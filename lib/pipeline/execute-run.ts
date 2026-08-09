/**
 * 拠点 + ユーザー操作を読み、パイプラインを1回実行して結果を永続化する。
 *
 * ページはここを呼ばない。**ページは最新runを読むだけ**(再計算しない)。
 * runを新しく作るのは、拠点の追加や操作イベントの追記といった「入力が変わった」瞬間だけ。
 *
 * 参照: docs/roadmap/implementation-plan.md T-11、承認済み計画のB-2
 */

import { runDemoPipeline, DEFAULT_RNG_SEED, RESULT_SCHEMA_VERSION } from "@/lib/demo/run-demo-pipeline";
import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { listSiteEntries } from "@/lib/db/repositories/sites";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { getLatestRun, persistRun } from "@/lib/db/repositories/runs";
import { observedVersionsFromHashInputs, recordObservedVersions } from "@/lib/db/repositories/parameter-versions";

/** 入力を読み直してパイプラインを実行し、新しいrunとして永続化する。 */
export async function executeAndPersistRun(tenantId: string): Promise<DemoPipelineResult> {
  const [userSites, interactions] = await Promise.all([listSiteEntries(tenantId), loadInteractionState(tenantId)]);

  const result = runDemoPipeline({ userSites, interactions, rngSeed: DEFAULT_RNG_SEED });
  await persistRun({ tenantId, rngSeed: DEFAULT_RNG_SEED, result });

  // 実際に使われた版を台帳に取り込む(M8「後から手で入力する設計にしない」)。
  // 変更理由は付けない(自動検出では分からないため。画面が未記録として人間に促す)。
  await recordObservedVersions(
    tenantId,
    new Date().toISOString(),
    observedVersionsFromHashInputs(result.recalculationHash.inputs)
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
 */
export async function getOrCreateLatestResult(tenantId: string): Promise<DemoPipelineResult> {
  const latest = await getLatestRun(tenantId);
  if (latest && latest.resultSchemaVersion === RESULT_SCHEMA_VERSION) {
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
}
