/**
 * M4完成 T-13:`PhysicalQuantityInput` から比較対象(`ComparisonSubject`)を機械的に構築する。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.1・§4-1、T-13.2
 *
 * **推定で埋めない(D-15)。** 入力に無い属性は `"unknown"` / `null` を明示する。
 * 特に水源種別(表層水/地下水)は拠点データに存在しないため常に `"unknown"` とし、
 * LIME3が既定採用している表層水を対象属性へ書き写さない(手法側の仮定であって、
 * 比較対象そのものの属性ではないため。docs/data/lime3-coefficients-notes.md §3.1・D-126)。
 *
 * 水の使用形態は `"withdrawal"`(取水)。MVPの物理量は取水量であり、IFVIが前提とする
 * 水消費量とは異なる(docs/data/aop-mapping-v1.md §0 重要な留保)。この差は手法アダプター側の
 * `flowInterpretation`(assumed_equivalent)が記録しており、比較対象の属性としては
 * 入力が提供している「取水」をそのまま持つ。
 */

import type { ComparisonSubject, FlowAttributes } from "../types/comparison";
import type { PhysicalQuantityInput } from "../types/valuation";
import { computeRecordHash } from "../ledger/recalculation-hash";
import { SUBJECT_IDENTITY_RULE_VERSION } from "./comparability";

export interface BuildComparisonSubjectOptions {
  input: PhysicalQuantityInput;
  physicalQuantityId: string;
  /** 取込行・PRTR届出等の元レコードID。デモ既定値など元レコードが無い場合は空配列。 */
  sourceRecordIds?: string[];
  provenance: ComparisonSubject["provenance"];
  /** 期間。入力型が年・期間を持たないカテゴリでは呼び出し側が渡す。省略時は入力から機械的に決める。 */
  period?: ComparisonSubject["period"];
  companyId?: string;
  branchId?: string;
  measurementBoundary?: ComparisonSubject["quantity"]["measurementBoundary"];
}

/** 元レコードIDを入力から機械的に集める(存在する場合のみ)。無い場合は補わない。 */
function sourceRecordIdsOf(input: PhysicalQuantityInput): string[] {
  return "sourceRecordId" in input && typeof input.sourceRecordId === "string" ? [input.sourceRecordId] : [];
}

/** 期間。入力が報告年・報告期間を持つカテゴリだけ具体値にし、他は年を null にした年次とする。 */
function periodOf(input: PhysicalQuantityInput): ComparisonSubject["period"] {
  if (input.category === "pollution") return { kind: "annual", year: input.reportingYear };
  if (input.category === "waste") return { kind: "reference_date", date: input.reportingPeriod };
  // 水・気候・土地利用の入力型は期間を持たない。年を推定しない(D-15)。
  return { kind: "annual", year: null };
}

/** カテゴリ固有属性。入力に無い属性は "unknown" を明示する。 */
function flowOf(input: PhysicalQuantityInput): FlowAttributes {
  switch (input.category) {
    case "water":
      return {
        kind: "water",
        // 拠点データに水源種別が無い。表層水を既定採用しているのは手法側の仮定であり、
        // 比較対象の属性として書き写さない(§4-1・D-126)。
        waterSource: "unknown",
        // MVPの物理量は取水量(aop-mapping-v1.md §0)。
        waterUse: "withdrawal",
      };
    case "pollution":
      return {
        kind: "pollution",
        substanceCode: input.prtrSubstanceCode,
        casRns: input.casRns,
        releaseMedium: input.releaseMedium,
        // PRTRの「排出」と「移動」を同一視しない(§4-1)。offsite_waste は移動。
        releaseKind: input.releaseMedium === "offsite_waste" ? "transfer" : "release",
      };
    case "waste":
      return {
        kind: "waste",
        wasteTypeCode: input.wasteTypeCode,
        hazardous: input.hazardous,
        treatmentRoute: input.treatmentRoute,
        treatmentLocation: input.treatmentLocation,
        weightBasis: input.weightBasis,
      };
    case "land_use":
      return input.activityKind === "conversion"
        ? {
            kind: "land_use",
            activityKind: "conversion",
            landClassBefore: input.landClassBefore,
            landClassAfter: input.landClassAfter,
          }
        : { kind: "land_use", activityKind: "occupation", landClass: input.landClass };
    case "climate":
      return { kind: "climate", gasBasis: "tCO2e" };
  }
}

/**
 * 同一対象判定に使う属性だけからハッシュを作る。物理量・単位・地点・期間・時間基準・フロー属性が
 * 変われば比較対象が変わり、再計算ハッシュへ伝播する(T-14.2)。
 */
function subjectHash(subject: Omit<ComparisonSubject, "sourceHash">): string {
  return computeRecordHash("subject", {
    physicalQuantityId: subject.physicalQuantityId,
    category: subject.category,
    flow: subject.flow,
    quantity: subject.quantity,
    location: subject.location,
    period: subject.period,
    timeBasis: subject.timeBasis,
    boundary: subject.boundary,
    identityRuleVersion: subject.identityRuleVersion,
    provenance: subject.provenance,
  });
}

/**
 * M3の物理入力から比較対象を組み立てる。時間基準はいずれのカテゴリも年間フロー(`annual`)。
 * 年間フローと現在価値を自動換算しないため、現在価値の手法(IFVI VFaccess等)が
 * 内部で割引しているかどうかはここでは扱わず、時間モデル要因・定性差異として比較レシピが扱う(§5.5-4)。
 */
export function buildComparisonSubject(options: BuildComparisonSubjectOptions): ComparisonSubject {
  const { input, physicalQuantityId, provenance } = options;
  const withoutHash: Omit<ComparisonSubject, "sourceHash"> = {
    id: `subject:${physicalQuantityId}`,
    physicalQuantityId,
    sourceRecordIds: options.sourceRecordIds ?? sourceRecordIdsOf(input),
    category: input.category,
    flow: flowOf(input),
    quantity: {
      value: input.physicalQuantity,
      unit: input.unit,
      measurementBoundary: options.measurementBoundary ?? "site",
    },
    location: { siteId: input.siteId, region: input.targetRegion },
    period: options.period ?? periodOf(input),
    timeBasis: "annual",
    boundary: {
      ...(options.companyId !== undefined ? { companyId: options.companyId } : {}),
      ...(options.branchId !== undefined ? { branchId: options.branchId } : {}),
      siteId: input.siteId,
    },
    identityRuleVersion: SUBJECT_IDENTITY_RULE_VERSION,
    provenance,
  };
  return { ...withoutHash, sourceHash: subjectHash(withoutHash) };
}
