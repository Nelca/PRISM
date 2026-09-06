/**
 * M4完成:比較対象(ComparisonSubject)・ゼロ意味・因果経路。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.1・§5.2・§5.6、§4-1〜4
 *
 * 比較対象は「同じ物理量に見えるもの」を自動的に同一視しないための構造。取水と消費水、
 * 表層水と地下水、排出と移動、単年フローとNPVは、属性が揃わない限り `different_subject` として
 * 金額倍率を計算しない(§5.1)。
 */

import type { AoPCode, ImpactCategory, LicenseMode } from "./common";

/** 出典への参照。制限付き原本の値は転記せず、資料名・位置・版・ハッシュだけを持つ(§0.2)。 */
export interface EvidenceRef {
  /** 資料名(例 "AIST-IDEA v4.0 LCIA係数_LIME3")。 */
  source: string;
  /** 表・ページ・セル・行・API応答の位置(例 "row 001511000, 列『利子率2%、消費国、日本 / 統合化 / US$』")。 */
  locator?: string;
  version?: string;
  /** 取得日(ISO 8601)。 */
  retrievedAt?: string;
  /** 原本または抽出物のハッシュ。 */
  hash?: string;
  licenseMode?: LicenseMode;
  /** 一次資料か、一次資料への到達補助(二次資料)か(§2-7)。 */
  tier?: "primary" | "secondary";
  note?: string;
}

/** マッピング・レシピのレビュー状態(§9.5)。 */
export type ReviewStatus = "draft" | "evidence_verified" | "pending_domain_review" | "domain_approved" | "rejected";

export interface ReviewRecord {
  status: ReviewStatus;
  /** 確認者。AIと人間を区別する(§9.5)。 */
  reviewer: { kind: "ai" | "human"; name?: string };
  reviewedAt: string;
  /** 検証証跡(テスト名・診断スクリプト・照合した資料位置)。 */
  verification: string[];
}

// ---------------------------------------------------------------------------
// ゼロ値の意味(§5.6)
// ---------------------------------------------------------------------------

export type ZeroMeaningCode =
  | "published_zero" // 出典が0と公表
  | "not_applicable" // 概念が適用されない
  | "not_covered" // 手法の評価範囲外
  | "below_detection_or_rounding" // 閾値・丸めにより0
  | "missing" // 必要値が未取得。0として計算しない
  | "computed_zero"; // 入力0等により計算結果が0

/**
 * ゼロ意味は手法アダプターが出典を引用して確定する(§5.6「付与主体」)。
 * 比較エンジンは値の大きさや桁からゼロ意味を推論しない。
 */
export interface ZeroMeaning {
  code: ZeroMeaningCode;
  /** 採用しなかった候補区分も残す(§5.6 優先順位の適用結果)。 */
  candidates: ZeroMeaningCode[];
  evidence: EvidenceRef[];
  /** 適用した規則番号と根拠の要約(決定論的テンプレート)。 */
  rationale: string;
  assignedBy: "method_adapter";
}

// ---------------------------------------------------------------------------
// 因果経路(§5.2)。既存の aopCode / metric / cicesRef を包含し、第2の分類体系を作らない。
// ---------------------------------------------------------------------------

export type ValuationTechnique =
  | "revealed_preference"
  | "stated_preference"
  | "vsl"
  | "vsly"
  | "daly_monetization" // DALY × 統合化係数(LIME3の統合化)
  | "replacement_cost"
  | "avoided_cost"
  | "damage_cost"
  | "market_price"
  | "benefit_transfer_esvd"
  | "unmapped";

/**
 * pressure → midpoint → damage pathway → AoP → metric → valuation technique の階層。
 * 特定不能な階層は "unmapped" とし推定で埋めない(§5.2)。
 */
export interface CausalPathway {
  /** 例 "water_withdrawal"。 */
  pressure: string | "unmapped";
  /** 例 "freshwater_scarcity"。 */
  midpoint: string | "unmapped";
  /** 例 "agricultural_water_shortage_malnutrition"、"waterborne_disease"、"altered_ecosystem_services"。 */
  damagePathway: string | "unmapped";
  /** 既存の `ValuationRecord.aopCode` と同じ体系(AoP階層)。 */
  aopCode: AoPCode;
  /** 既存の `ValuationRecord.metric` を含む(metric階層)。 */
  metric: "DALY" | "PDF" | "MSA" | "USD" | "unmapped" | null;
  valuationTechnique: ValuationTechnique;
  /** 対応表の版とレビュー状態(§9.5)。 */
  mappingVersion: string;
  review: ReviewRecord;
  evidence: EvidenceRef[];
}

/** 被覆判定の結果。AoP一致だけで一致と判定しない(§4-3)。 */
export type PathwayCoverageComparison =
  | { kind: "same_pathway" }
  | { kind: "different_pathway"; differences: string[] }
  | { kind: "unmapped"; unmappedSide: "A" | "B" | "both"; reason: string };

// ---------------------------------------------------------------------------
// 比較対象(§5.1)
// ---------------------------------------------------------------------------

export interface WaterFlowAttributes {
  kind: "water";
  /** 拠点データに水源種別が無い場合は "unknown" を明示し、表層水を推定しない。 */
  waterSource: "surface" | "ground" | "unknown";
  waterUse: "withdrawal" | "consumption" | "unknown";
}

export interface PollutionFlowAttributes {
  kind: "pollution";
  substanceCode: string;
  casRns: string[];
  releaseMedium: string;
  /** 排出と移動を同一視しない。 */
  releaseKind: "release" | "transfer";
}

export interface WasteFlowAttributes {
  kind: "waste";
  wasteTypeCode: string;
  hazardous: boolean;
  treatmentRoute: string;
  treatmentLocation: "onsite" | "offsite";
  weightBasis: "wet" | "dry" | "unknown";
}

export interface LandUseFlowAttributes {
  kind: "land_use";
  activityKind: "conversion" | "occupation";
  landClassBefore?: string;
  landClassAfter?: string;
  landClass?: string;
}

export interface ClimateFlowAttributes {
  kind: "climate";
  gasBasis: "tCO2e";
  scope?: string;
}

export type FlowAttributes =
  | WaterFlowAttributes
  | PollutionFlowAttributes
  | WasteFlowAttributes
  | LandUseFlowAttributes
  | ClimateFlowAttributes;

export type TimeBasis = "annual" | "one_time" | "present_value";

export interface ComparisonSubject {
  /** 例 "subject:pq-site042-water-2027"。 */
  id: string;
  physicalQuantityId: string;
  /** 元レコードID(取込行、PRTR届出等)。デモ既定値の場合は空配列。 */
  sourceRecordIds: string[];
  category: ImpactCategory;
  flow: FlowAttributes;
  quantity: { value: number; unit: string; measurementBoundary: "site" | "organization" | "project" };
  location: { siteId: string; region: string };
  period: { kind: "annual"; year: number | null } | { kind: "reference_date"; date: string } | { kind: "unknown" };
  timeBasis: TimeBasis;
  boundary: { companyId?: string; branchId?: string; siteId: string };
  /** 同一対象判定に使った規則の版。再計算ハッシュに入る。 */
  identityRuleVersion: string;
  /** 物理入力・元レコードの由来(観測値/デモ既定値/推定)を隠さない(§7.3)。 */
  provenance: "customer_provided" | "official_public_data" | "official_statistics" | "demo_default";
  sourceHash: string;
}

export type SubjectIdentityResult =
  | { kind: "same"; assumptions: string[] }
  | { kind: "different_subject"; reasons: string[] };
