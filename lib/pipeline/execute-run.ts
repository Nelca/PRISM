/**
 * 拠点 + ユーザー操作を読み、パイプラインを1回実行して結果を永続化する。
 *
 * ページはここを呼ばない。**ページは最新runを読むだけ**(再計算しない)。
 * runを新しく作るのは、拠点の追加や操作イベントの追記といった「入力が変わった」瞬間だけ。
 *
 * 参照: docs/roadmap/implementation-plan.md T-11、承認済み計画のB-2
 */

import { cache } from "react";
import { runDemoPipeline, DEFAULT_RNG_SEED, RESULT_SCHEMA_VERSION } from "@/lib/demo/run-demo-pipeline";
import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { listSiteEntries } from "@/lib/db/repositories/sites";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { getLatestRun, persistRun } from "@/lib/db/repositories/runs";
import { observedVersionsFromHashInputs, recordObservedVersions } from "@/lib/db/repositories/parameter-versions";
import type { DbExecutor } from "@/lib/db/client";
import { listActiveInputBatches, listActivePhysicalInputRecords } from "@/lib/db/repositories/physical-inputs";
import type { AppendCalculationLineItemInput } from "@/lib/db/repositories/physical-inputs";
import { DEMO_CATEGORY_EXPANSION_BATCHES, DEMO_CATEGORY_EXPANSION_RECORDS } from "@/lib/demo/category-expansion-data";
import { buildCategoryExpansionRuntime } from "./category-expansion-runtime";

/** 読取と操作保存で同じ入力選択規則を使う。デモと実入力を混在させない。 */
export async function loadCategoryExpansion(tenantId: string, db?: DbExecutor) {
  const physicalInputRecords = await listActivePhysicalInputRecords(tenantId, undefined, db);
  const activeBatches = await listActiveInputBatches(tenantId, db);
  // 未登録環境でも追加3カテゴリの画面・算定を確認できるよう、入力バッチが一件も
  // 有効化されていない場合だけ架空サンプルを使う。顧客入力が一件でもあれば混在させない。
  const usesDemoCategoryInputs = activeBatches.length === 0;
  const expansion = await buildCategoryExpansionRuntime(
    usesDemoCategoryInputs ? DEMO_CATEGORY_EXPANSION_RECORDS : physicalInputRecords,
    usesDemoCategoryInputs ? DEMO_CATEGORY_EXPANSION_BATCHES : activeBatches
  );
  // 架空レコードにはphysical_input_recordの外部キーがないため索引行を保存しない。
  return { ...expansion, calculationLineItems: usesDemoCategoryInputs ? [] : expansion.calculationLineItems };
}

/** 入力を読み直してパイプラインを実行し、新しいrunとして永続化する。 */
export async function executeAndPersistRun(tenantId: string, db?: DbExecutor): Promise<DemoPipelineResult> {
  // DbTransactionは単一clientなので、pg@9でも安全なよう同一tx内のqueryを並列実行しない。
  const userSites = await listSiteEntries(tenantId, db);
  const interactions = await loadInteractionState(tenantId, db);
  const expansion = await loadCategoryExpansion(tenantId, db);
  const result = runDemoPipeline({
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
  // デモレコードはDBのphysical_input_recordに存在しないため、外部キーを持つ算定行は
  // 保存しない。run内の入力ハッシュ・カバレッジ・仮定台帳には出所を残す。
  return persistComputedRun(tenantId, result, db, expansion.calculationLineItems);
}

/**
 * 既に計算済みの結果をrunとして永続化する。
 *
 * 「検証してから永続化」(第4版 D-01)の共通ヘルパー
 * (`lib/pipeline/try-run-with-interaction.ts`)が、事前検証で得た結果をそのまま
 * 保存するために使う。パイプラインの実行と永続化を分けておくことで、
 * **成功した計算だけを保存する**という順序を呼び出し側が守れる。
 */
export async function persistComputedRun(
  tenantId: string,
  result: DemoPipelineResult,
  db?: DbExecutor,
  calculationLineItems?: AppendCalculationLineItemInput[]
): Promise<DemoPipelineResult> {
  await persistRun({ tenantId, rngSeed: DEFAULT_RNG_SEED, result, calculationLineItems }, db);

  // 実際に使われた版を台帳に取り込む(M8「後から手で入力する設計にしない」)。
  // 変更理由は付けない(自動検出では分からないため。画面が未記録として人間に促す)。
  await recordObservedVersions(
    tenantId,
    new Date().toISOString(),
    observedVersionsFromHashInputs(result.recalculationHash.inputs),
    db
  );

  return result;
}

/**
 * 画面・APIの読み出し口。最新runがあればそれを返す。
 *
 * 再実行するのは次の2つの場合だけ:
 *   1. runがまだ1件もない(初回起動)。「空表示」にすると原因が分かりにくいため
 *   2. **保存済みrunの結果構造が古い**(RESULT_SCHEMA_VERSION が上がった)
 *
 * 2が必要な理由:ページは保存済みrunをそのまま読むため(計画B-2)、結果の構造を変える
 * コード変更をデプロイすると、古い形のrunを新しいコードが読んで壊れる。
 * 古いrunは削除せず残したまま(追記のみ)、新しい版のrunを積む。
 *
 * **同一リクエスト内でのメモ化:** layout.tsx(ナビの状態表示・指示01-4)とpage.tsx双方が
 * 同じrunを読むようになったため、`React.cache` でラップしてリクエスト単位に結果を
 * 共有する(DB読み出し・版台帳への書き込みの重複を避ける)。Next.jsの推奨パターン。
 * 参照: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md
 * 「Sharing data with context and React.cache」。Server Componentのレンダー外
 * (テストからの直接呼び出し等)では`react`パッケージの`cache`は素通し実装になり、
 * 単に毎回実行されるだけで安全。
 */
export const getOrCreateLatestResult = cache(async function getOrCreateLatestResult(
  tenantId: string
): Promise<DemoPipelineResult> {
  const latest = await getLatestRun(tenantId);
  if (latest && latest.resultSchemaVersion === RESULT_SCHEMA_VERSION && !requiresLicenseRefresh(latest.result)) {
    // 保存済みrunを返す場合も、そのrunが使った版が台帳にあることを保証する。
    // 版管理を後から導入したため、既存runの分が台帳に載っていないことがある。
    // 追記は冪等(同じsetId・versionは無視される)なので、読み出しのたびに呼んでよい。
    await recordObservedVersions(
      tenantId,
      latest.executedAt,
      observedVersionsFromHashInputs(latest.result.recalculationHash.inputs)
    );
    return latest.result;
  }
  return executeAndPersistRun(tenantId);
});

/** 保存済みrunの計算後にライセンス期限を迎えた場合、期限前の金額を配信し続けない。 */
export function requiresLicenseRefresh(result: DemoPipelineResult, now = new Date()): boolean {
  const expiresAtEndOfDay = (date: string): number =>
    /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T23:59:59.999+09:00`).getTime()
      : new Date(date).getTime();
  return Object.values(result.valuation.methodAvailabilityByMaterialIssue).some((methods) =>
    methods.some(
      (method) =>
        method.status === "available" &&
        method.licenseExpiresAt !== undefined &&
        (!Number.isFinite(expiresAtEndOfDay(method.licenseExpiresAt)) || expiresAtEndOfDay(method.licenseExpiresAt) < now.getTime())
    )
  );
}
