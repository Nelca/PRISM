/**
 * パイプライン層:M1(対象定義とLocate)→M2(評価実行・深度可変)。
 * 参照元: docs/roadmap/build-plan.md §7.1(GATE:M1からM8まで通す)
 *
 * 各モジュールの関数シグネチャ・型は変更しない。ここでは
 *   1. 正しい順序で呼ぶ
 *   2. 前段の出力を次段の入力形式に変換する
 *   3. M8のderive*Payload()でAssumptionEntryを実際に生成し、出力レコードの
 *      assumptionEntryIdsに反映する(不変な後処理として。既存関数は書き換えない)
 * という接続ロジックのみを担う。
 *
 * M3のスクリーニング評価(M2 D-1が要求する「全MaterialIssueを一度スクリーニング深度で
 * 通す」ステップ)は、呼び出し側が用意した`screeningValuationForMaterialIssue`として注入する
 * (実際のM3呼び出しに必要な物理量入力はサイト・カテゴリ固有のデータであり、
 * このパイプライン層が決め打ちしない)。
 */

import { buildSitesFromRows } from "../site/ingest";
import type { SiteIngestionError, SiteRow } from "../site/ingest";
import { resolveSiteLocation } from "../site/location";
import type { Geocode } from "../site/location";
import { buildExcludedMaterialIssue, buildMaterialIssues } from "../site/build-material-issues";
import { computePriorityScores } from "../assessment/priority-score";
import type { PriorityScoreInput } from "../assessment/priority-score";
import { computeDepthDecisions } from "../assessment/depth-decision";
import type { ComputeDepthDecisionsOptions } from "../assessment/depth-decision";
import { buildAssumptionEntry, deriveM1ExclusionPayload, deriveM2DepthDecisionPayload } from "../ledger/assumption-entry";
import type { ImpactCategory } from "../types/common";
import type { MaterialIssue, NatureInterface, Site } from "../types/site";
import type { PriorityScore, DepthDecision } from "../types/assessment";
import type { ExchangeValuationRecord } from "../types/valuation";
import type { AssumptionEntry } from "../types/ledger";

export interface AssessmentPipelineOptions {
  rows: SiteRow[];
  geocode: Geocode;
  /** M1のbuildMaterialIssuesと同じ形の注入点。座標解決が成功した拠点にのみ呼ばれる。 */
  interfacesByCategoryForSite: (site: Site) => Partial<Record<ImpactCategory, NatureInterface[]>>;
  /** 座標解決に失敗した拠点について、どのカテゴリの除外レコードを残すか。 */
  excludedCategoriesForSite: (site: Site) => ImpactCategory[];
  /** M2 D-1のスクリーニング評価結果(M3スクリーニング深度)を注入する。 */
  screeningValuationForMaterialIssue: (materialIssue: MaterialIssue) => ExchangeValuationRecord;
  promotionOptions?: ComputeDepthDecisionsOptions;
  idSequence: () => string;
  now: string;
}

export interface AssessmentPipelineResult {
  sites: Site[];
  ingestionErrors: SiteIngestionError[];
  materialIssues: MaterialIssue[];
  priorityScores: PriorityScore[];
  depthDecisions: DepthDecision[];
  assumptionEntries: AssumptionEntry[];
}

export function runAssessmentPipeline(options: AssessmentPipelineOptions): AssessmentPipelineResult {
  const { sites, errors } = buildSitesFromRows(options.rows);
  const assumptionEntries: AssumptionEntry[] = [];
  const materialIssues: MaterialIssue[] = [];

  for (const site of sites) {
    const resolution = resolveSiteLocation(site, options.geocode);

    if (resolution.excluded) {
      const payload = deriveM1ExclusionPayload(resolution)!; // excluded=trueなので必ず非null
      for (const category of options.excludedCategoriesForSite(site)) {
        const issue = buildExcludedMaterialIssue(site.id, category, resolution.exclusionReason!);
        const entry = buildAssumptionEntry(options.idSequence(), options.now, "M1", issue.id, payload);
        assumptionEntries.push(entry);
        materialIssues.push({ ...issue, assumptionEntryIds: [entry.id] });
      }
      continue;
    }

    const interfacesByCategory = options.interfacesByCategoryForSite(resolution.site);
    materialIssues.push(...buildMaterialIssues(resolution.site.id, interfacesByCategory));
  }

  const evaluableIssues = materialIssues.filter((issue) => !issue.excluded);
  const priorityInputs: PriorityScoreInput[] = evaluableIssues.map((issue) => ({
    materialIssueId: issue.id,
    sensitivityScore: issue.sensitivityScore,
    screeningValuationRecord: options.screeningValuationForMaterialIssue(issue),
    impactCategory: issue.impactCategory,
  }));

  const priorityScores = computePriorityScores(priorityInputs);
  const rawDepthDecisions = computeDepthDecisions(priorityScores, options.promotionOptions);

  const depthDecisions = rawDepthDecisions.map((decision) => {
    const payload = deriveM2DepthDecisionPayload(decision);
    const entry = buildAssumptionEntry(options.idSequence(), options.now, "M2", decision.materialIssueId, payload);
    assumptionEntries.push(entry);
    return { ...decision, assumptionEntryIds: [entry.id] };
  });

  return {
    sites,
    ingestionErrors: errors,
    materialIssues,
    priorityScores,
    depthDecisions,
    assumptionEntries,
  };
}
