/**
 * 拠点 + ユーザー操作を読み、パイプラインを1回実行して結果を永続化する。
 *
 * ページはここを呼ばない。**ページは最新runを読むだけ**(再計算しない)。
 * runを新しく作るのは、拠点の追加や操作イベントの追記といった「入力が変わった」瞬間だけ。
 *
 * 参照: docs/roadmap/implementation-plan.md T-11、承認済み計画のB-2
 */

import { runDemoPipeline, DEFAULT_RNG_SEED } from "@/lib/demo/run-demo-pipeline";
import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { listSiteEntries } from "@/lib/db/repositories/sites";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { getLatestRun, persistRun } from "@/lib/db/repositories/runs";

/** 入力を読み直してパイプラインを実行し、新しいrunとして永続化する。 */
export async function executeAndPersistRun(tenantId: string): Promise<DemoPipelineResult> {
  const [userSites, interactions] = await Promise.all([listSiteEntries(tenantId), loadInteractionState(tenantId)]);

  const result = runDemoPipeline({ userSites, interactions, rngSeed: DEFAULT_RNG_SEED });
  await persistRun({ tenantId, rngSeed: DEFAULT_RNG_SEED, result });
  return result;
}

/**
 * 画面・APIの読み出し口。最新runがあればそれを返す。
 *
 * まだ1件もない場合(初回起動・seed前)だけ、その場で1回実行して永続化する。
 * 「runが無いので空表示」にすると、seedを忘れたときに原因が分かりにくいため。
 */
export async function getOrCreateLatestResult(tenantId: string): Promise<DemoPipelineResult> {
  const latest = await getLatestRun(tenantId);
  if (latest) {
    return latest.result;
  }
  return executeAndPersistRun(tenantId);
}
