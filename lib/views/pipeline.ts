import "server-only";

import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { listSiteEntries } from "@/lib/db/repositories/sites";
import { listDecisionCounts } from "@/lib/db/repositories/decision-counts";
import { listParameterVersionsWithStatus } from "@/lib/db/repositories/parameter-versions";
import { getRunById, listRuns } from "@/lib/db/repositories/runs";

/** 画面にテナント解決やDBの所在を漏らさない、標準の読取境界。 */
export async function loadPipelineView() {
  const tenantId = await getTenantId();
  return getOrCreateLatestResult(tenantId);
}

/** 最新結果に加えて、入力フォームの現在値が必要な画面用。 */
export async function loadInteractivePipelineView() {
  const tenantId = await getTenantId();
  const [result, interactions] = await Promise.all([
    getOrCreateLatestResult(tenantId),
    loadInteractionState(tenantId),
  ]);
  return { tenantId, result, interactions };
}

export async function loadSitesView() {
  const tenantId = await getTenantId();
  const [result, storedEntries] = await Promise.all([
    getOrCreateLatestResult(tenantId),
    listSiteEntries(tenantId),
  ]);
  return { result, storedEntries };
}

export async function loadLedgerView(compareWith?: string) {
  const tenantId = await getTenantId();
  const [result, parameterVersions, runs, decisionCounts] = await Promise.all([
    getOrCreateLatestResult(tenantId),
    listParameterVersionsWithStatus(tenantId),
    listRuns(tenantId, 10),
    listDecisionCounts(tenantId),
  ]);
  const latestRunId = runs[0]?.id;
  const priorRunId = compareWith ?? runs[1]?.id;
  const priorRun = priorRunId && priorRunId !== latestRunId ? await getRunById(tenantId, priorRunId) : null;
  return { result, parameterVersions, runs, decisionCounts, priorRun };
}
