/**
 * 「検証してから永続化」(第4版 D-01-2)。
 *
 * 従来、interactionを書くServer Actionはどれも
 *   「イベントをDBへ追記 → `executeAndPersistRun`(パイプライン実行+run保存)」
 * の順で動いていた。この順序には構造的な欠陥がある:**パイプラインが例外を投げる操作でも、
 * イベントだけは先に永続化されてしまう。**イベントは追記のみで取り消せない(計画B-1)ため、
 * 以後のあらゆる操作が同じ壊れた状態の上で実行され、同じ例外で失敗し続ける
 * (2026-08-17のユーザーレビューで実際に起きた「操作不能の連鎖」)。
 *
 * このモジュールは順序を逆にする。
 *   1. 変更後の状態を**メモリ上で合成**して `runDemoPipeline` を実行する(DBには何も書かない)
 *   2. 成功したときだけ、イベントを追記し、**その検証済みの結果をそのままrunとして保存する**
 *   3. 失敗したときは何も書かず、平易な日本語のエラーをFormStateで返す
 *      (生の例外メッセージは画面に出さず、サーバーログにだけ残す)
 */

import { runDemoPipeline, DEFAULT_RNG_SEED } from "@/lib/demo/run-demo-pipeline";
import { projectInteractionState } from "@/lib/demo/interaction-state";
import type { InteractionEvent } from "@/lib/demo/interaction-state";
import type { UserSiteEntry } from "@/lib/demo/site-entry";
import { listSiteEntries } from "@/lib/db/repositories/sites";
import { appendInteractionEvent, listInteractionEvents } from "@/lib/db/repositories/interactions";
import type { AppendInteractionInput } from "@/lib/db/repositories/interactions";
import { persistComputedRun, loadCategoryExpansion } from "./execute-run";
import { getDb } from "@/lib/db/client";
import type { DbTransaction } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { allSiteRows } from "@/lib/demo/company";
import type { CategoryExpansionRuntime } from "./category-expansion-runtime";

export interface TryRunInput {
  /** 追記しようとしている操作イベント。検証に通るまでDBには書かない。 */
  events?: AppendInteractionInput[];
  /**
   * 拠点一覧の「変更後の姿」。拠点テーブルは追記のみの対象外(取込のやり直しがあるため)で、
   * 現在値そのものがDBの行なので、検証にはメモリ上の変更後の一覧を渡してもらう。
   */
  userSites?: (current: UserSiteEntry[]) => UserSiteEntry[];
  /**
   * 検証に成功したあとに実行する、拠点テーブルへの実際の書き込み。
   * これが指定された場合は、採番されたIDなどDB側で決まる値を取り込むため、
   * commit後にもう一度パイプラインを実行して保存する。
   */
  commit?: (db: DbTransaction) => Promise<void>;
  /**
   * 失敗時にFormStateへ返す文の主語。「◯◯を適用できませんでした。」の◯◯。
   * 内部IDや例外文言を含めない、利用者の言葉で書く。
   */
  label: string;
  /**
   * 書込直前に、ロック下で再計算した結果に対して追加の整合性を検証する(例外で保存を中止)。
   * 画面で確認した投資案件・開示主張が、確認後に変わっていないかの照合などに使う。
   */
  validateResult?: (result: ReturnType<typeof runDemoPipeline>) => void;
}

export type TryRunResult = { ok: true } | { ok: false; message: string };

function failureMessage(label: string): string {
  return (
    `${label}を適用できませんでした。この操作は保存していません(変更前の状態のままです)。` +
    "入力内容をご確認のうえ、もう一度お試しください。繰り返し失敗する場合は、直前に変更した項目を元に戻してからお試しください。"
  );
}

/** サーバーログにだけ残す。画面には出さない(生の例外文言を利用者に見せないため)。 */
function logFailure(label: string, cause: unknown): void {
  console.error(`[try-run-with-interaction] ${label} の事前検証でパイプラインが失敗しました:`, cause);
}

function runWithExpansion(
  userSites: UserSiteEntry[],
  interactions: ReturnType<typeof projectInteractionState>,
  expansion: CategoryExpansionRuntime
) {
  const validSiteIds = new Set(allSiteRows(userSites).map((site) => site.id));
  const orphan = expansion.activeMaterialIssueTargets.find((target) => !validSiteIds.has(target.siteId));
  if (orphan) throw new Error(`有効な物理入力が存在しない拠点を参照しています: ${orphan.siteId}`);
  return runDemoPipeline({
    userSites,
    interactions,
    rngSeed: DEFAULT_RNG_SEED,
    physicalInputs: expansion.physicalInputs,
    activeMaterialIssueTargets: expansion.activeMaterialIssueTargets,
    deepDiveConfigsByMaterialIssue: expansion.deepDiveConfigsByMaterialIssue,
    coverageByMaterialIssue: expansion.coverageByMaterialIssue,
    methodAvailabilityByMaterialIssue: expansion.methodAvailabilityByMaterialIssue,
    inputBatchHashes: expansion.inputBatchHashes,
    financialEffectSourceHashes: expansion.financialEffectSourceHashes,
  });
}

/**
 * 変更後の状態でパイプラインを試し、成功したときだけ永続化する。
 *
 * 失敗しても**DBには何も書かない**ため、失敗した操作が以後の全操作を巻き込むことがない。
 */
export async function tryRunAndPersist(tenantId: string, input: TryRunInput): Promise<TryRunResult> {
  try {
    await getDb().transaction(async (tx) => {
      // 同じテナントの「読取→計算→追記」を直列化し、古い状態から作ったrunの後勝ちを防ぐ。
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`);

      // 1トランザクション=1 client。同一clientへのquery並列実行はpg@9で非対応になる。
      const currentSites = await listSiteEntries(tenantId, tx);
      const currentEvents = await listInteractionEvents(tenantId, tx);
      const expansion = await loadCategoryExpansion(tenantId, tx);
      // バッチの連番日時より後に次の操作を置き、再生順序を安定させる。
      const eventTime = currentEvents.reduce((latest, event) => Math.max(latest, Date.parse(event.createdAt) + 1), Date.now());
      const pendingEvents: InteractionEvent[] = (input.events ?? []).map((event, index) => ({
        id: `pending-${index}`,
        createdAt: new Date(eventTime + index).toISOString(),
        actor: event.actor,
        kind: event.kind,
        subjectId: event.subjectId,
        payload: event.payload,
      }));
      const interactions = projectInteractionState([...currentEvents, ...pendingEvents]);
      const candidateSites = input.userSites ? input.userSites(currentSites) : currentSites;

      // 書込前に検証する。例外ならトランザクションはロールバックされる。
      let result = runWithExpansion(candidateSites, interactions, expansion);
      if (input.commit) {
        await input.commit(tx);
        // UUIDなどDBへ実際に保存された識別子を結果へ反映する。
        const committedSites = await listSiteEntries(tenantId, tx);
        result = runWithExpansion(committedSites, interactions, expansion);
      }
      input.validateResult?.(result);
      for (const [index, event] of (input.events ?? []).entries()) {
        await appendInteractionEvent(tenantId, { ...event, createdAt: new Date(eventTime + index) }, tx);
      }
      await persistComputedRun(tenantId, result, tx, expansion.calculationLineItems);
    });
  } catch (cause) {
    logFailure(input.label, cause);
    return { ok: false, message: failureMessage(input.label) };
  }

  return { ok: true };
}
