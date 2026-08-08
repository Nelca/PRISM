/**
 * `packages/core` の型 ⇄ DBの行の変換。**このファイルだけが両者を知る。**
 *
 * `pipeline_run.result` が読み出しの正であり、ここで作る個別レコードの行は
 * **同じオブジェクトから同一トランザクションで書かれる派生の索引**である(計画B-2)。
 * したがって両者が食い違う経路は存在しない。索引側は横断検索(T-12の判定件数、
 * T-13の旧版比較)のために存在する。
 */

import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { evaluatedCriteriaCount } from "@core/types/site";
import type {
  assumptionEntry,
  decisionRecord,
  divergenceDecomposition,
  gapFinding,
  materialIssue,
  valuationRecord,
} from "./schema";

export interface RunExtracts {
  materialIssues: (typeof materialIssue.$inferInsert)[];
  valuationRecords: (typeof valuationRecord.$inferInsert)[];
  divergenceDecompositions: (typeof divergenceDecomposition.$inferInsert)[];
  decisionRecords: (typeof decisionRecord.$inferInsert)[];
  gapFindings: (typeof gapFinding.$inferInsert)[];
  assumptionEntries: (typeof assumptionEntry.$inferInsert)[];
}

export function extractRunRows(tenantId: string, runId: string, result: DemoPipelineResult): RunExtracts {
  const materialIssues = result.assessment.materialIssues.map((issue) => ({
    runId,
    tenantId,
    id: issue.id,
    siteId: issue.siteId,
    impactCategory: issue.impactCategory,
    sensitivityScore: issue.sensitivityScore,
    // 分母は5とは限らない(GAP-08 / GAP-13)。索引側にも出しておく。
    evaluatedCriteriaCount: evaluatedCriteriaCount(issue.criteriaMet, issue.unevaluatedCriteria),
    excluded: issue.excluded,
    data: issue,
  }));

  const valuationRecords = Object.entries(result.valuation.valuationRecordsByMaterialIssue).flatMap(
    ([materialIssueId, records]) =>
      records.map((record) => ({
        runId,
        tenantId,
        id: record.id,
        materialIssueId,
        siteId: record.siteId,
        methodId: record.methodId,
        methodVersion: record.methodVersion,
        physicalQuantityId: record.physicalQuantityId,
        valueConcept: record.valueConcept,
        transferFitnessTier: record.transferFitness.tier,
        centralValue: record.centralValue as unknown as number,
        recalculationHash: record.recalculationHash,
        data: record,
      }))
  );

  const divergenceDecompositions = result.valuation.divergenceDecompositions.map((decomposition) => ({
    runId,
    tenantId,
    id: decomposition.id,
    siteId: decomposition.siteId,
    targetPhysicalQuantityId: decomposition.targetPhysicalQuantityId,
    recalculationHash: decomposition.recalculationHash,
    data: decomposition,
  }));

  const decisionRecords = result.decisions.map((entry) => ({
    runId,
    tenantId,
    id: entry.decision.decisionRecord.id,
    siteId: entry.siteId,
    decisionTarget: entry.decision.decisionRecord.decisionTarget,
    verdict: entry.decision.decisionRecord.verdict,
    recalculationHash: entry.decision.decisionRecord.recalculationHash,
    data: entry.decision.decisionRecord,
  }));

  const gapFindings = result.disclosure.gapFindings.map((finding) => ({
    runId,
    tenantId,
    id: finding.id,
    claimId: finding.claimId,
    gapType: finding.gapType,
    data: finding,
  }));

  const assumptionEntries = result.assumptionEntries.map((entry) => ({
    runId,
    tenantId,
    id: entry.id,
    sourceModule: entry.sourceModule,
    relatedRecordId: entry.relatedRecordId,
    payload: entry.payload,
  }));

  return { materialIssues, valuationRecords, divergenceDecompositions, decisionRecords, gapFindings, assumptionEntries };
}
