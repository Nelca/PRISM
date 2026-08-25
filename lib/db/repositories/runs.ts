/**
 * パイプライン実行結果(pipeline_run と派生索引)の追記・読み出し。
 *
 * run は追記のみ。過去の run を書き換える経路は用意しない(M8 D-5)。
 * ページは常に最新 run の `result` を読むだけで、再計算しない(計画B-2)。
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import type { DbExecutor } from "../client";
import { buildDecisionCountRows } from "./decision-counts";
import {
  assumptionEntry,
  decisionCountEntry,
  decisionRecord,
  divergenceDecomposition,
  gapFinding,
  materialIssue,
  pipelineRun,
  valuationRecord,
} from "../schema";
import { extractRunRows } from "../serialize";
import { RESULT_SCHEMA_VERSION } from "@/lib/demo/run-demo-pipeline";
import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";

export interface PersistRunInput {
  tenantId: string;
  rngSeed: number;
  result: DemoPipelineResult;
}

export async function persistRun(input: PersistRunInput, db?: DbExecutor): Promise<string> {
  const runId = `run-${crypto.randomUUID()}`;
  const extracts = extractRunRows(input.tenantId, runId, input.result);

  const write = async (tx: DbExecutor) => {
    await tx.insert(pipelineRun).values({
      id: runId,
      tenantId: input.tenantId,
      rngSeed: input.rngSeed,
      recalculationHash: input.result.recalculationHash.hash,
      hashInputs: input.result.recalculationHash.inputs,
      result: input.result,
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
    });

    // 索引側。run本体と同じトランザクションで書くため、両者が食い違うことはない。
    if (extracts.materialIssues.length > 0) await tx.insert(materialIssue).values(extracts.materialIssues);
    if (extracts.valuationRecords.length > 0) await tx.insert(valuationRecord).values(extracts.valuationRecords);
    if (extracts.divergenceDecompositions.length > 0)
      await tx.insert(divergenceDecomposition).values(extracts.divergenceDecompositions);
    if (extracts.decisionRecords.length > 0) await tx.insert(decisionRecord).values(extracts.decisionRecords);
    if (extracts.gapFindings.length > 0) await tx.insert(gapFinding).values(extracts.gapFindings);
    if (extracts.assumptionEntries.length > 0) await tx.insert(assumptionEntry).values(extracts.assumptionEntries);

    // 判定件数のカウント(M6 D-8)。run本体と同じトランザクションで積む。
    // 既に積んだ DecisionRecord は onConflictDoNothing で無視される(再実行で二重課金しない)。
    const countRows = buildDecisionCountRows(
      input.tenantId,
      runId,
      input.result.decisions.map((entry) => ({ decisionRecord: entry.decision.decisionRecord, siteId: entry.siteId }))
    );
    if (countRows.length > 0) {
      await tx.insert(decisionCountEntry).values(countRows).onConflictDoNothing();
    }
  };

  if (db) await write(db);
  else await getDb().transaction(write);

  return runId;
}

export interface StoredRun {
  id: string;
  executedAt: string;
  rngSeed: number;
  /** 保存時点の結果構造の版。現在のRESULT_SCHEMA_VERSIONと違えば読み手が再実行する。 */
  resultSchemaVersion: number;
  result: DemoPipelineResult;
}

export async function getLatestRun(tenantId: string): Promise<StoredRun | null> {
  const rows = await getDb()
    .select()
    .from(pipelineRun)
    .where(eq(pipelineRun.tenantId, tenantId))
    .orderBy(desc(pipelineRun.executedAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    executedAt: row.executedAt.toISOString(),
    rngSeed: row.rngSeed,
    resultSchemaVersion: row.resultSchemaVersion,
    result: row.result as DemoPipelineResult,
  };
}

/** 指定したrunを読む(旧版パラメータでの再計算の比較元)。 */
export async function getRunById(tenantId: string, runId: string): Promise<StoredRun | null> {
  const rows = await getDb()
    .select()
    .from(pipelineRun)
    .where(and(eq(pipelineRun.tenantId, tenantId), eq(pipelineRun.id, runId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    executedAt: row.executedAt.toISOString(),
    rngSeed: row.rngSeed,
    resultSchemaVersion: row.resultSchemaVersion,
    result: row.result as DemoPipelineResult,
  };
}

/** 過去のrunを含む一覧(新しい順)。T-13(旧版係数での再計算の比較)が使う土台。 */
export async function listRuns(tenantId: string, limit = 20): Promise<{ id: string; executedAt: string; recalculationHash: string }[]> {
  const rows = await getDb()
    .select({ id: pipelineRun.id, executedAt: pipelineRun.executedAt, recalculationHash: pipelineRun.recalculationHash })
    .from(pipelineRun)
    .where(eq(pipelineRun.tenantId, tenantId))
    .orderBy(desc(pipelineRun.executedAt))
    .limit(limit);

  return rows.map((row) => ({ id: row.id, executedAt: row.executedAt.toISOString(), recalculationHash: row.recalculationHash }));
}
