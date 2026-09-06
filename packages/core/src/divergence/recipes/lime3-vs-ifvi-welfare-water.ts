/**
 * M4完成 T-11:LIME3 水消費 × IFVI Water Consumption の厚生価値内訳(VFnutrition / VFdisease / VFes)の
 * **手法間**比較レシピ(部分分解)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.5・§6.2・T-11、
 *         docs/data/aop-mapping-v1.md §1.3・§2.1、docs/data/method-recalculability.md §3
 *
 * 数値化できる要因は**地理較正だけ**である。両手法とも「係数(USD/m³ 相当)× 物理量」を出したあと、
 * 同じ地理較正ステップ(PPP × 所得弾力性調整 × デフレータ × 相対価格上昇 × 面積スケーリング)で
 * 円へ落としており、この設定は一次資料と `GeographicCalibrationRecord` から差し替え式を定義できる。
 * 現行デモでは両者が同一の較正記録を共有するため、**寄与は厳密にゼロ**になる(ゼロ寄与公理の実データ検証)。
 * ゼロを出すために比較対象や係数を選別していない(§2-10):較正記録は M3 が両手法へ同じものを渡す。
 *
 * 数値化できない差(被覆経路・価値評価技法・基礎モデル/データ・価格年)は `fixedDifferences` として
 * 構造化し、**金額を割り当てない**(§6.4)。したがって `decompositionKind: "partial"` であり、
 * V* = V_A を要求しない。基準側は常に B(=LIME3)で、逆方向(A基準)は定義しない:
 * 固定している基礎モデルが A 側・B 側で非対称(LIME3特性化 vs LC-Impact/Motoshita/ESVD)であり、
 * `v_reverse(S) = v_forward(F∖S)` を保証できないため(§6.2 A/B反転の保証条件)。
 */

import type { EvidenceRef } from "../../types/comparison";
import type { KnownDifference, MethodComparisonRecipe, RecipeSupportCheck } from "../../types/recipe";
import type { MethodEvaluationTrace } from "../../types/trace";
import { realDataSwapFactor, stepIdOfKind } from "./trace-swap";

export const LIME3_VS_IFVI_WELFARE_WATER_RECIPE_ID = "lime3-vs-ifvi-welfare-water";

/** このレシピが扱う IFVI の厚生価値内訳。VFaccess(交換価値・代替費用モデル)は別レシピ。 */
export const IFVI_WELFARE_SUB_FACTORS = ["VFnutrition", "VFdisease", "VFes"] as const;

const IFVI_METHODOLOGY_EVIDENCE: EvidenceRef = {
  source: "IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf(最終承認版)",
  locator: "Appendix D Table D1(日本)、Appendix B §B37-B41(Global Perspective・国際ドル建て)",
  version: "2026年3月",
  tier: "primary",
};

const LIME3_EVIDENCE: EvidenceRef = {
  source: "docs/data/lime3-coefficients-notes.md",
  locator: "§2〜§3(AIST-IDEA Ver.4.0 標準版 LIME3 統合化係数の構成と未確認の仮定)",
  tier: "secondary",
};

const CALIBRATION_EVIDENCE: EvidenceRef = {
  source: "docs/data/calibration-parameters-v1.md",
  locator: "§1(PPP: 世界銀行ICP 2024年版 PA.NUS.PPP)",
  tier: "primary",
  note: "地理較正の各倍率と適用順は packages/core/src/monetization/calibration.ts と同一(M3 D-3・D-127・D-128)。",
};

const AOP_MAPPING_EVIDENCE: EvidenceRef = {
  source: "docs/data/aop-mapping-v1.md",
  locator: "§1.3(IFVI 4内訳)・§2.1(LIME3 水資源)",
  tier: "secondary",
};

const RECALCULABILITY_EVIDENCE: EvidenceRef = {
  source: "docs/data/method-recalculability.md",
  locator: "§2・§3(再計算可能性の判定)",
  tier: "secondary",
};

/**
 * 地理較正(PPP・所得弾力性調整・デフレータ・相対価格上昇・面積スケーリング)の差し替え。
 * ステップIDは `{recordMethodId}.geographic_calibration` で手法ごとに異なるため kind で解決する。
 */
const GEOGRAPHIC_CALIBRATION_FACTOR = realDataSwapFactor({
  id: "geographic_calibration",
  category: "geographic_model",
  label: "地理較正(PPP×所得弾力性×デフレータ×相対価格上昇×面積スケーリング)",
  evidence: [CALIBRATION_EVIDENCE],
  targets: [
    {
      resolveStepId: stepIdOfKind("geographic_calibration"),
      selectors: [
        { key: "ppp", settingKey: "ppp", label: "購買力平価(PPP)" },
        { key: "income_elasticity_adjustment", settingKey: "income_elasticity_adjustment", label: "所得弾力性調整" },
        { key: "deflator", settingKey: "deflator", label: "デフレータ" },
        { key: "relative_price_escalation", settingKey: "relative_price_escalation", label: "相対価格上昇" },
        { key: "area_scaling", settingKey: "area_scaling", label: "面積スケーリング" },
      ],
    },
  ],
  precondition: (base, target) => {
    for (const [side, trace] of [
      ["基準側", base],
      ["差し替え先", target],
    ] as const) {
      const step = trace.steps.find((candidate) => candidate.kind === "geographic_calibration");
      if (!step) return `${side}(${trace.recordMethodId})に地理較正ステップがありません。`;
      if (!step.applied) {
        return (
          `${side}(${trace.recordMethodId})は地理較正を適用していません(${step.skipReason ?? "理由未記録"})。` +
          "適用していない設定を相手の値へ差し替えても意味を持たないため、倍率を仮置きしません。"
        );
      }
    }
    return null;
  },
});

const FIXED_DIFFERENCES: KnownDifference[] = [
  {
    category: "coverage_pathway",
    description:
      "被覆・因果経路が異なる。LIME3 水消費は「取水→水不足→人間健康DALY」の単一経路に100%配分するのに対し、" +
      "IFVI は栄養不良(VFnutrition)・水系感染症(VFdisease)・生態系サービス(VFes)を別内訳として持ち、" +
      "集計時は MAX で1つだけを採用する。IFVI 側の pressure / midpoint は一次資料から特定できず " +
      "`unmapped` のままであり(pathway-mapping.ts)、経路の対応を数値化できる形で定義できない。",
    sideA: "IFVI:内訳ごとの損害経路(栄養不良 / 水系感染症 / 生態系サービス)。pressure・midpoint は unmapped",
    sideB: "LIME3:水不足→人間健康 DALY(Yamasaki et al. 2020 Table 2 により100%人間健康配分)",
    evidence: [AOP_MAPPING_EVIDENCE, IFVI_METHODOLOGY_EVIDENCE],
    acquisitionAction: {
      item: "IFVI 各内訳の圧力・中間影響(pressure / midpoint)の一次資料記述",
      candidateSource: "IFVI Water Consumption Topic Methodology 本文および Transparency Report",
      enablesRecalculation: false,
      gate: "H-02",
    },
  },
  {
    category: "valuation_technique",
    description:
      "価値評価技法が異なる。LIME3 は DALY へ統合化係数(US$/DALY)を掛けて貨幣化する。IFVI は " +
      "VFnutrition / VFdisease が VSL、VFes が ESVD によるベネフィット・トランスファーである。" +
      "同じ「厚生価値」でも支払意思の測り方が違い、片方の技法へ差し替える式を一次資料から定義できない。",
    sideA: "IFVI:VSL(健康2経路)/ ESVD ベネフィット・トランスファー(VFes)",
    sideB: "LIME3:DALY × 統合化係数(LIME3 重み付け・利子率2%)",
    evidence: [AOP_MAPPING_EVIDENCE, LIME3_EVIDENCE, IFVI_METHODOLOGY_EVIDENCE],
    acquisitionAction: {
      item: "LIME3 統合化係数の構成(コンジョイント分析の重み付けテーブル)と IFVI VSL の原単位",
      candidateSource: "LIME3 書籍(伊坪ほか)本文および IFVI Transparency Report Appendix",
      enablesRecalculation: false,
      gate: "H-02",
    },
  },
  {
    category: "underlying_model_data",
    description:
      "基礎モデル・データが異なる。LIME3 は独自の特性化モデル(取水→水不足→健康影響)、IFVI は " +
      "LC-Impact(VFnutrition)、Motoshita et al. 2011(VFdisease)、ESVD + 実蒸発散量 AET(VFes)に依拠する。" +
      "損害関数そのものを相手側へ差し替える式は公開されていない。",
    sideA: "IFVI:LC-Impact / Motoshita et al. 2011 / ESVD(Brander et al. 2024)+ AET",
    sideB: "LIME3:LIME3 特性化係数(AIST-IDEA Ver.4.0 標準版)",
    evidence: [RECALCULABILITY_EVIDENCE, IFVI_METHODOLOGY_EVIDENCE, LIME3_EVIDENCE],
    acquisitionAction: {
      item: "両手法の損害関数・特性化係数の算出式",
      candidateSource: "LIME3 書籍付録、IFVI Transparency Report、LC-Impact / Motoshita et al. (2011) 原論文",
      enablesRecalculation: false,
      gate: "H-02",
    },
  },
  {
    category: "normalization",
    description:
      "価格基準年が揃っているか確認できない。IFVI は USD(2024)建てと明記されているが、AIST-IDEA の " +
      "LIME3 係数ファイルには価格基準年の記載を発見できず `priceYear: null` のままである。" +
      "推定で年を埋めないため、価格年調整(reconciliation)を適用していない。差の一部が価格年の違いに" +
      "由来する可能性は残るが、金額を割り当てない。",
    sideA: "IFVI:USD(2024)、Global Perspective(国際ドル)",
    sideB: "LIME3:価格基準年 不明(null)",
    evidence: [
      { source: "docs/data/lime3-coefficients-notes.md", locator: "§3.2-4(価格基準年の記載を発見できず)", tier: "secondary" },
      IFVI_METHODOLOGY_EVIDENCE,
    ],
    acquisitionAction: {
      item: "AIST-IDEA Ver.4.0 LIME3 統合化係数の価格基準年",
      candidateSource: "AIST-IDEA Ver.4.0 付属ドキュメント、または産総研への照会",
      enablesRecalculation: true,
      gate: "H-02",
    },
  },
  {
    category: "coverage_pathway",
    description:
      "IFVI 本文 Eq.3-5(局所生物多様性圧力 / 水ストレス比による拠点レベル補正)は式が公表済みだが未実装であり、" +
      "国レベル値をそのまま拠点へ適用している(`siteCorrection: not_implemented_formula_published`)。" +
      "LIME3 側に拠点補正の概念は無い(`not_applicable`)。実装すれば数値化可能要因が1つ増える。",
    sideA: "IFVI:Eq.3-5 の拠点補正(式は公開済み・未実装)",
    sideB: "LIME3:拠点補正の概念なし(国レベル統合化係数)",
    evidence: [
      { source: "docs/data/acquisition-runbook.md", locator: "§3.4 IFVI 価値係数(残作業)", tier: "secondary" },
      IFVI_METHODOLOGY_EVIDENCE,
    ],
    acquisitionAction: {
      item: "IFVI 本文 Eq.3-5 の式と、拠点レベルの生物多様性圧力・水ストレス値",
      candidateSource: "IFVI Water Consumption Topic Methodology 本文(一次資料PDF)",
      enablesRecalculation: true,
      gate: "H-02",
    },
  },
];

function supports(traceA: MethodEvaluationTrace, traceB: MethodEvaluationTrace): RecipeSupportCheck {
  const welfare: readonly string[] = IFVI_WELFARE_SUB_FACTORS;
  if (!welfare.includes(traceA.subFactorId)) {
    return {
      ok: false,
      reason: "trace_insufficient",
      detail:
        `このレシピが扱う IFVI の内訳は ${welfare.join(" / ")}(厚生価値)だけです(実際: ${traceA.subFactorId})。` +
        "VFaccess は交換価値の代替費用モデルであり、replacement-cost-vs-vfaccess レシピの対象です。",
    };
  }
  if (traceB.methodId !== "lime3-water") {
    return { ok: false, reason: "trace_insufficient", detail: `基準側が LIME3 水ではありません(${traceB.recordMethodId})。` };
  }
  return { ok: true };
}

export const LIME3_VS_IFVI_WELFARE_WATER_RECIPE: Omit<MethodComparisonRecipe, "hash"> = {
  id: LIME3_VS_IFVI_WELFARE_WATER_RECIPE_ID,
  version: "1.0.0",
  category: "water",
  /** A = 差し替え先(IFVI の厚生価値内訳)。`subFactorId` 省略で3内訳すべてを対象にする。 */
  methodA: { methodId: "ifvi-water-consumption", versionRange: "2026-03-final" },
  /** B = 基準側(LIME3 水消費)。v(∅) = V_B。 */
  methodB: { methodId: "lime3-water", subFactorId: "lime3-water", versionRange: "3.*" },
  analysisUnit: "cross_method",
  countsTowardRealDataEvidence: true,
  review: {
    status: "evidence_verified",
    reviewer: { kind: "ai" },
    reviewedAt: "2026-09-06",
    verification: [
      "地理較正の式(PPP×所得弾力性調整×デフレータ×相対価格上昇×面積スケーリング)は " +
        "packages/core/src/monetization/calibration.ts と GeographicCalibrationRecord から独立に検算できる",
      "固定差(被覆経路・価値評価技法・基礎モデル/データ・価格年・拠点補正)は aop-mapping-v1.md §1.3/§2.1、" +
        "method-recalculability.md §2/§3、lime3-coefficients-notes.md §3.2-4 の一次・二次資料に対応付け済み",
      "経路差の記述は monetization/trace/pathway-mapping.ts の対応表(そのレビュー状態に従う。VFes は pending_domain_review)に基づく",
      "検証: packages/core/src/divergence/recipes/lime3-vs-ifvi-welfare-water.test.ts",
    ],
  },
  evidence: [IFVI_METHODOLOGY_EVIDENCE, LIME3_EVIDENCE, AOP_MAPPING_EVIDENCE, CALIBRATION_EVIDENCE],
  comparableScope: {
    valueConcept: "welfare",
    requiredSubjectAttributes: ["category", "flow", "quantity", "location", "period", "timeBasis"],
    pathwayNote:
      "同じ厚生価値だが因果経路は一致しない。被覆経路の差は数値化せず `fixedDifferences` として並置する(§6.4)。",
  },
  supports,
  /**
   * 比較前正規化は無い。両手法とも係数は外貨建てだが、円への換算は手法内部の地理較正ステップが
   * PPP と一体で行う(D-127・D-128)。これを reconciliation として二重計上せず、地理較正要因として
   * 一度だけ数値化する(§5.5「同一の補正を二重適用しない」)。
   */
  normalization: [],
  factors: [GEOGRAPHIC_CALIBRATION_FACTOR],
  decompositionKind: "partial",
  baseline: "B",
  reverseCompatible: false,
  fixedDifferences: FIXED_DIFFERENCES,
  modePolicy: {},
  budget: { maxFactors: 1, maxEvaluations: 2 },
};
