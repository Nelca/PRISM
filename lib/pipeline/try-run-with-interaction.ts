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
import { executeAndPersistRun, persistComputedRun } from "./execute-run";

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
  commit?: () => Promise<void>;
  /**
   * 失敗時にFormStateへ返す文の主語。「◯◯を適用できませんでした。」の◯◯。
   * 内部IDや例外文言を含めない、利用者の言葉で書く。
   */
  label: string;
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

/**
 * 変更後の状態でパイプラインを試し、成功したときだけ永続化する。
 *
 * 失敗しても**DBには何も書かない**ため、失敗した操作が以後の全操作を巻き込むことがない。
 */
export async function tryRunAndPersist(tenantId: string, input: TryRunInput): Promise<TryRunResult> {
  const [currentSites, currentEvents] = await Promise.all([listSiteEntries(tenantId), listInteractionEvents(tenantId)]);

  const now = new Date().toISOString();
  const pendingEvents: InteractionEvent[] = (input.events ?? []).map((event, index) => ({
    id: `pending-${index}`,
    createdAt: now,
    actor: event.actor,
    kind: event.kind,
    subjectId: event.subjectId,
    payload: event.payload,
  }));

  const userSites = input.userSites ? input.userSites(currentSites) : currentSites;
  const interactions = projectInteractionState([...currentEvents, ...pendingEvents]);

  let verified;
  try {
    verified = runDemoPipeline({ userSites, interactions, rngSeed: DEFAULT_RNG_SEED });
  } catch (cause) {
    logFailure(input.label, cause);
    return { ok: false, message: failureMessage(input.label) };
  }

  try {
    if (input.commit) {
      await input.commit();
    }
    for (const event of input.events ?? []) {
      await appendInteractionEvent(tenantId, event);
    }
    if (input.commit) {
      // 拠点IDの採番などDB側で決まる値があるため、書き込み後の実データで作り直す。
      await executeAndPersistRun(tenantId);
    } else {
      // 検証に使ったものと同じ状態なので、検証済みの結果をそのまま保存する(二重実行しない)。
      await persistComputedRun(tenantId, verified);
    }
  } catch (cause) {
    logFailure(input.label, cause);
    return { ok: false, message: failureMessage(input.label) };
  }

  return { ok: true };
}
