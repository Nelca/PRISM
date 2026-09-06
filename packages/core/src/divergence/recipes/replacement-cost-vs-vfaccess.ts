/**
 * M4完成 T-11:代替費用法(自社定義)× IFVI VFaccess の**交換価値**比較レシピ(停止例)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §3.3・§6.2・T-11、
 *         docs/requirements/m3-monetization-engine.md D-8.1・D-8.2、docs/data/aop-mapping-v1.md §1.3・§3
 *
 * どちらも「代替費用」型の交換価値だが、**数値化できる要因が1つも作れない**ことを示すレシピである。
 *
 *   - 時間モデル:IFVI VFaccess は 2%・2080年までの割引現在価値だが、損害の時間列(年次系列)は
 *     公開されていない(`damageTimeProfile: not_published`)。代替費用法は D-8.1 により割引を含めない。
 *     したがって「相手の時間モデルへ差し替える」計算式を書けない。割引率だけを仮置きしない(§4-5)。
 *   - 地理較正:代替費用法は企業提供の円建て単価であり地理較正を適用しない(`applied: false`、D-127・D-128)。
 *     適用していない設定を相手の値へ差し替えても意味を持たない。
 *
 * 結果として F が空になり `no_numerizable_factors` で停止する。これは失敗ではなく、
 * §3.3 が求める「比較不能または反実仮想不能を正しく止め、何を取得すれば再計算できるかを示す」実例であり、
 * `countsTowardRealDataEvidence: true` のまま実証コーパスへ残す。金額差は診断値として保持される。
 */

import type { EvidenceRef } from "../../types/comparison";
import type {
  CounterfactualFactor,
  DataAcquisitionAction,
  KnownDifference,
  MethodComparisonRecipe,
  RecipeSupportCheck,
  SwapResult,
} from "../../types/recipe";
import type { MethodEvaluationTrace } from "../../types/trace";
import { realDataSwapFactor, stepIdOfKind } from "./trace-swap";

export const REPLACEMENT_COST_VS_VFACCESS_RECIPE_ID = "replacement-cost-vs-vfaccess";

const IFVI_TRANSPARENCY_EVIDENCE: EvidenceRef = {
  source: "IFVI Water Consumption Topic Methodology Transparency Report",
  locator: "Appendix H, Item 9(Accounting for future impacts)。本文 Appendix B26–B33(VFaccess)",
  version: "2026年3月",
  tier: "primary",
};

const M3_DECISION_EVIDENCE: EvidenceRef = {
  source: "docs/requirements/m3-monetization-engine.md",
  locator: "D-8.1(代替費用法は割引現在価値化を含めない)・D-8.2(VFaccess は 2%・2080年まで)",
  tier: "secondary",
};

const AOP_MAPPING_EVIDENCE: EvidenceRef = {
  source: "docs/data/aop-mapping-v1.md",
  locator: "§1.3 VFaccess 行・§3 代替費用法",
  tier: "secondary",
};

/** 取得すれば VFaccess の時間モデルを反実仮想できるようになるデータ(H-02)。 */
const DAMAGE_TIME_SERIES_ACTION: DataAcquisitionAction = {
  item: "VFaccess の損害時間列(2024→2080 の年次系列)と割引適用順",
  candidateSource:
    "IFVI Water Consumption 方法論 Appendix B26–B33 / Transparency Report Appendix H(Item 9)",
  enablesRecalculation: true,
  gate: "H-02",
};

/**
 * 時間モデル要因。割引の反実仮想には損害の年次系列が要る。VFaccess 側が `not_published` のため、
 * 差し替え式を定義できず、理由と不足データを返す(割引率だけを仮置きしない)。
 */
const TIME_MODEL_FACTOR: CounterfactualFactor = {
  id: "time_model",
  category: "time_model",
  label: "時間モデル(割引率と予測期間)",
  evidence: [IFVI_TRANSPARENCY_EVIDENCE, M3_DECISION_EVIDENCE],
  swap: (base: MethodEvaluationTrace, target: MethodEvaluationTrace): SwapResult => {
    const missing: { side: string; trace: MethodEvaluationTrace }[] = [];
    for (const [side, trace] of [
      ["差し替え先", target],
      ["基準側", base],
    ] as const) {
      if (trace.damageTimeProfile.status !== "available") missing.push({ side, trace });
    }
    if (missing.length === 0) {
      return {
        ok: false,
        reason:
          "両側の損害時間列が利用可能になった場合の差し替え式は、このレシピ版では未定義です。" +
          "式を定義せずに割引率だけを差し替えません。",
        missingData: [DAMAGE_TIME_SERIES_ACTION],
      };
    }
    return {
      ok: false,
      reason: missing
        .map(({ side, trace }) => {
          const profile = trace.damageTimeProfile;
          const reason = "reason" in profile ? profile.reason : "";
          return `${side}(${trace.recordMethodId})の損害時間列が ${profile.status} です。${reason}`;
        })
        .join(" "),
      missingData: [DAMAGE_TIME_SERIES_ACTION],
    };
  },
};

/**
 * 地理較正要因。代替費用法は企業提供の円建て単価であり地理較正を適用していない(`applied: false`)。
 * `precondition` がその事実を理由として返し、差し替えを行わない。
 */
const GEOGRAPHIC_CALIBRATION_FACTOR = realDataSwapFactor({
  id: "geographic_calibration",
  category: "geographic_model",
  label: "地理較正(PPP×所得弾力性×デフレータ×相対価格上昇×面積スケーリング)",
  evidence: [
    { source: "docs/data/calibration-parameters-v1.md", locator: "§1(PPP)", tier: "primary" },
    { source: "docs/decisions/design-rationale-log.md", locator: "D-127・D-128", tier: "secondary" },
  ],
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
          "一方が現地通貨建てで較正非適用のため、較正設定の差し替えは意味を持ちません。倍率を仮置きしません。"
        );
      }
    }
    return null;
  },
  missingData: [],
});

const FIXED_DIFFERENCES: KnownDifference[] = [
  {
    category: "time_model",
    description:
      "時間モデルが異なる。IFVI VFaccess は将来の水供給コストを 2% で 2080年まで割引現在価値化する。" +
      "代替費用法は「今この瞬間の代替調達コスト」であり、D-8.1 により割引現在価値化を含めない。" +
      "年間フローと現在価値を自動換算しない(§5.5)ため、この差に金額を割り当てない。",
    sideA: "IFVI VFaccess:割引率 2%・2080年までの現在価値",
    sideB: "代替費用法:割引なし(時間次元を持たない単年フロー)",
    evidence: [IFVI_TRANSPARENCY_EVIDENCE, M3_DECISION_EVIDENCE],
    acquisitionAction: DAMAGE_TIME_SERIES_ACTION,
  },
  {
    category: "valuation_technique",
    description:
      "どちらも代替費用型だが、単価の出所が異なる。IFVI VFaccess は将来の水供給単価(IBnet ベンチマーク)を、" +
      "代替費用法は企業提供の現在の代替調達単価(円/m³)を使う。単価の定義が違うため、片方の単価へ" +
      "差し替える式を一次資料から書けない。",
    sideA: "IFVI VFaccess:将来の水供給単価(IBnet ベンチマーク、国際ドル)",
    sideB: "代替費用法:企業提供の代替調達単価(円/m³、現在価格)",
    evidence: [AOP_MAPPING_EVIDENCE, IFVI_TRANSPARENCY_EVIDENCE],
    acquisitionAction: {
      item: "IFVI VFaccess が用いる IBnet 水供給単価の原データと国別引き当て規則",
      candidateSource: "IFVI Water Consumption 方法論 Appendix B26–B33、IBnet(International Benchmarking Network)",
      enablesRecalculation: true,
      gate: "H-02",
    },
  },
  {
    category: "coverage_pathway",
    description:
      "被覆範囲が異なる。IFVI VFaccess は水ストレス(需要/供給比)が1を超える分の抽出だけを対象にする。" +
      "代替費用法は取水量の全量を対象にする。同じ物理量に対して数えている部分が違う。",
    sideA: "IFVI VFaccess:水ストレス超過分の抽出のみ",
    sideB: "代替費用法:取水量の全量",
    evidence: [AOP_MAPPING_EVIDENCE, IFVI_TRANSPARENCY_EVIDENCE],
    acquisitionAction: {
      item: "拠点所在地の水ストレス(需要/供給比)と、超過分の算定式",
      candidateSource: "IFVI Water Consumption 方法論 本文 Eq.1・Appendix B26–B33",
      enablesRecalculation: true,
      gate: "H-02",
    },
  },
  {
    category: "coverage_pathway",
    description:
      "IFVI 本文 Eq.3-5(局所生物多様性圧力 / 水ストレス比による拠点レベル補正)は式が公表済みだが未実装であり、" +
      "国レベル値をそのまま拠点へ適用している(`siteCorrection: not_implemented_formula_published`)。" +
      "代替費用法に拠点補正の概念は無い(`not_applicable`)。今回の実装範囲では Eq.3-5 を実装しない。",
    sideA: "IFVI VFaccess:Eq.3-5 の拠点補正(式は公開済み・未実装)",
    sideB: "代替費用法:拠点補正の概念なし(企業提供の拠点単価そのもの)",
    evidence: [
      { source: "docs/data/acquisition-runbook.md", locator: "§3.4 IFVI 価値係数(残作業)", tier: "secondary" },
      IFVI_TRANSPARENCY_EVIDENCE,
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
  if (traceA.subFactorId !== "VFaccess") {
    return {
      ok: false,
      reason: "trace_insufficient",
      detail: `このレシピが扱う IFVI の内訳は VFaccess だけです(実際: ${traceA.subFactorId})。`,
    };
  }
  if (traceB.methodId !== "replacement-cost") {
    return { ok: false, reason: "trace_insufficient", detail: `基準側が代替費用法ではありません(${traceB.recordMethodId})。` };
  }
  return { ok: true };
}

export const REPLACEMENT_COST_VS_VFACCESS_RECIPE: Omit<MethodComparisonRecipe, "hash"> = {
  id: REPLACEMENT_COST_VS_VFACCESS_RECIPE_ID,
  version: "1.0.0",
  category: "water",
  /** A = 差し替え先(IFVI VFaccess)。 */
  methodA: { methodId: "ifvi-water-consumption", subFactorId: "VFaccess", versionRange: "2026-03-final" },
  /** B = 基準側(代替費用法)。v(∅) = V_B。 */
  methodB: { methodId: "replacement-cost", subFactorId: "replacement-cost", versionRange: "1.*" },
  analysisUnit: "cross_method",
  countsTowardRealDataEvidence: true,
  review: {
    status: "evidence_verified",
    reviewer: { kind: "ai" },
    reviewedAt: "2026-09-06",
    verification: [
      "VFaccess の損害時間列が未公開であることを Transparency Report Appendix H, Item 9 の記述と " +
        "plugins/ifvi-water-consumption.ts の damageTimeProfile(not_published)で確認",
      "代替費用法が地理較正を適用しないこと(skipGeographicCalibration、D-127・D-128)を plugins/replacement-cost.ts で確認",
      "検証: packages/core/src/divergence/recipes/replacement-cost-vs-vfaccess.test.ts",
    ],
  },
  evidence: [IFVI_TRANSPARENCY_EVIDENCE, M3_DECISION_EVIDENCE, AOP_MAPPING_EVIDENCE],
  comparableScope: {
    valueConcept: "exchange",
    requiredSubjectAttributes: ["category", "flow", "quantity", "location", "period", "timeBasis"],
    pathwayNote:
      "どちらも代替費用型の直接コストで AoP 体系の対象外だが、被覆範囲(全量 vs 水ストレス超過分)と時間モデルが異なる。",
  },
  supports,
  normalization: [],
  /**
   * 宣言した2要因はいずれも一次資料から差し替え式を書けない。エンジンは両方を除外し、
   * F が空になったところで `no_numerizable_factors` を返す。要因を最初から空にせず宣言するのは、
   * 「何を数値化しようとして、なぜできなかったか」と不足データを結果に残すためである(§6.4)。
   */
  factors: [TIME_MODEL_FACTOR, GEOGRAPHIC_CALIBRATION_FACTOR],
  decompositionKind: "partial",
  baseline: "B",
  reverseCompatible: false,
  fixedDifferences: FIXED_DIFFERENCES,
  modePolicy: {},
  budget: { maxFactors: 2, maxEvaluations: 4 },
};
