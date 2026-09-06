/**
 * M4完成 §3.1・T-07:**テスト専用**の合成トレースと比較レシピ。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §6.2・§6.3・T-17
 *
 * 実データの手法アダプター(T-12)が揃う前に、分解エンジンの数理と停止条件を固定するための
 * 合成ケースを提供する。**本番レジストリには登録しない**(`createProductionRegistry()` は
 * これらを含めず、`RecipeRegistry.register` が testOnly を本番へ登録することを拒否する)。
 *
 * 合成トレースは `finalizeTrace` で組み立てた実際の計算プログラムであり、反実仮想は
 * `swapLiteral` によるリテラル差し替えと**同じ評価器での再実行**で得る(固定倍率の合成ではない)。
 *
 * 用意するケース:
 *   (a) `synthetic-product-full`   2要因が独立な積。完全分解・逆方向互換
 *   (b) `synthetic-max-partial`    MAX集計を含む相互作用。部分分解・逆方向非互換(γを基準側に固定)
 *   (c) `synthetic-budget`         3要因で評価回数の予算を超える
 *   (d) `synthetic-sum-additive`   加法向け(ゼロ・同符号負値を含む)
 *   (e) `synthetic-order-dependent` 同じ設定キーを2要因が奪い合い、組合せで意味を失う
 *   (f) `synthetic-excluded-factor` 反実仮想を定義できない要因を含み、Fを縮小する
 *   (g) `synthetic-draft-review`   レビュー状態が draft(実行不可)
 */

import type { EvidenceRef, ZeroMeaning } from "../../types/comparison";
import type { AoPCode } from "../../types/common";
import type { CounterfactualFactor, MethodComparisonRecipe, SwapResult } from "../../types/recipe";
import type { MethodEvaluationTrace, TraceOperand, TraceStepDraft } from "../../types/trace";
import { finalizeTrace, swapLiteral } from "../../trace/evaluate-trace";

export const SYNTHETIC_EVIDENCE: EvidenceRef[] = [
  { source: "合成トレース(テスト専用。実データではない)", tier: "secondary", version: "synthetic-v1" },
];

type LiteralOperand = Extract<TraceOperand, { kind: "literal" }>;

function literal(value: number, settingKey?: string, zeroMeaning?: ZeroMeaning): LiteralOperand {
  return { kind: "literal", value, unit: "JPY", currency: "JPY", priceYear: 2024, evidence: SYNTHETIC_EVIDENCE, settingKey, zeroMeaning };
}

function step(partial: Pick<TraceStepDraft, "id" | "operation" | "inputs"> & Partial<TraceStepDraft>): TraceStepDraft {
  return {
    role: "method_model",
    kind: "coefficient_application",
    label: partial.id,
    formula: partial.id,
    evidence: SYNTHETIC_EVIDENCE,
    applied: true,
    outputUnit: "JPY",
    outputCurrency: "JPY",
    outputPriceYear: 2024,
    ...partial,
  };
}

export type SyntheticShape = "product" | "max" | "sum";

export interface SyntheticTraceOptions {
  methodId: string;
  subFactorId?: string;
  methodVersion?: string;
  shape: SyntheticShape;
  quantity: number;
  alpha: number;
  beta: number;
  /** 3要因ケース(shape="product")の第3要因。 */
  delta?: number;
  /** 数値化しないモデル差(基準側に固定される)。product/max は乗算、sum は加算。 */
  gamma: number;
  /** 比較前正規化(reconciliation)の倍率。既定 1。 */
  fxRate?: number;
  /** 最終値が 0 の場合の意味。アダプターが出典付きで確定する(§5.6)。 */
  zeroMeaning?: ZeroMeaning;
  pressure?: string;
  midpoint?: string;
  damagePathway?: string;
  aopCode?: AoPCode;
  metric?: MethodEvaluationTrace["pathway"]["metric"];
  valuationTechnique?: MethodEvaluationTrace["pathway"]["valuationTechnique"];
  currency?: "JPY" | "USD" | "EUR";
  priceYear?: number;
}

/**
 * 合成トレースを組み立てる。差し替え可能な設定キーは "quantity" / "alpha" / "beta" / "delta" /
 * "gamma" / "fx_rate"。ステップIDは shape ごとに固定し、レシピの差し替え式が対象を名指しできるようにする。
 */
export function makeSyntheticTrace(options: SyntheticTraceOptions): MethodEvaluationTrace {
  const { shape, quantity, alpha, beta, delta, gamma } = options;
  const fxRate = options.fxRate ?? 1;
  const steps: TraceStepDraft[] = [];

  if (shape === "product") {
    steps.push(step({ id: "input", kind: "input_snapshot", operation: { op: "identity", operand: "q" }, inputs: { q: literal(quantity, "quantity") } }));
    steps.push(
      step({
        id: "alpha",
        operation: { op: "product", operands: ["prev", "a"] },
        inputs: { prev: { kind: "ref", stepId: "input" }, a: literal(alpha, "alpha") },
      })
    );
    steps.push(
      step({
        id: "beta",
        operation: { op: "product", operands: ["prev", "b"] },
        inputs: { prev: { kind: "ref", stepId: "alpha" }, b: literal(beta, "beta") },
      })
    );
    if (delta !== undefined) {
      steps.push(
        step({
          id: "delta",
          operation: { op: "product", operands: ["prev", "d"] },
          inputs: { prev: { kind: "ref", stepId: "beta" }, d: literal(delta, "delta") },
        })
      );
    }
    steps.push(
      step({
        id: "model",
        operation: { op: "product", operands: ["prev", "g"] },
        inputs: { prev: { kind: "ref", stepId: delta === undefined ? "beta" : "delta" }, g: literal(gamma, "gamma") },
      })
    );
  } else if (shape === "max") {
    steps.push(step({ id: "input", kind: "input_snapshot", operation: { op: "identity", operand: "q" }, inputs: { q: literal(quantity, "quantity") } }));
    steps.push(step({ id: "a", operation: { op: "identity", operand: "a" }, inputs: { a: literal(alpha, "alpha") } }));
    steps.push(step({ id: "b", operation: { op: "identity", operand: "b" }, inputs: { b: literal(beta, "beta") } }));
    steps.push(
      step({
        id: "agg",
        kind: "aggregation",
        operation: { op: "max", operands: ["a", "b"] },
        inputs: { a: { kind: "ref", stepId: "a" }, b: { kind: "ref", stepId: "b" } },
      })
    );
    steps.push(
      step({
        id: "scaled",
        operation: { op: "product", operands: ["q", "agg"] },
        inputs: { q: { kind: "ref", stepId: "input" }, agg: { kind: "ref", stepId: "agg" } },
      })
    );
    steps.push(
      step({
        id: "model",
        operation: { op: "product", operands: ["prev", "g"] },
        inputs: { prev: { kind: "ref", stepId: "scaled" }, g: literal(gamma, "gamma") },
      })
    );
  } else {
    steps.push(
      step({
        id: "alpha",
        operation: { op: "product", operands: ["q", "a"] },
        inputs: { q: literal(quantity, "quantity"), a: literal(alpha, "alpha") },
      })
    );
    steps.push(
      step({
        id: "beta",
        operation: { op: "product", operands: ["q", "b"] },
        inputs: { q: literal(quantity, "quantity"), b: literal(beta, "beta") },
      })
    );
    steps.push(
      step({
        id: "aggregate",
        kind: "aggregation",
        operation: { op: "sum", operands: ["a", "b"] },
        inputs: { a: { kind: "ref", stepId: "alpha" }, b: { kind: "ref", stepId: "beta" } },
      })
    );
    steps.push(
      step({
        id: "model",
        operation: { op: "sum", operands: ["prev", "g"] },
        inputs: { prev: { kind: "ref", stepId: "aggregate" }, g: literal(gamma, "gamma") },
      })
    );
  }

  steps.push(
    step({
      id: "fx",
      role: "reconciliation",
      kind: "currency_conversion",
      label: "比較前正規化(共通通貨・価格年へ揃える)",
      operation: { op: "product", operands: ["prev", "rate"] },
      inputs: { prev: { kind: "ref", stepId: "model" }, rate: literal(fxRate, "fx_rate") },
      outputCurrency: options.currency ?? "JPY",
      outputPriceYear: options.priceYear ?? 2024,
    })
  );

  return finalizeTrace({
    traceVersion: "1",
    methodId: options.methodId,
    subFactorId: options.subFactorId ?? options.methodId,
    recordMethodId: options.subFactorId ? `${options.methodId}.${options.subFactorId}` : options.methodId,
    methodVersion: options.methodVersion ?? "1.0.0",
    coefficientSetVersion: "synthetic-coefficients-v1",
    physicalQuantityId: "pq-synthetic",
    inputSnapshot: {
      category: "water",
      physicalQuantity: quantity,
      unit: "m3",
      siteId: "site-synthetic",
      sourceRegion: "JP",
      targetRegion: "JP",
    },
    flowInterpretation: { inputProvides: "consumption", methodAssumes: "consumption", status: "match", evidence: SYNTHETIC_EVIDENCE },
    steps,
    endpointBreakdown: { status: "available" },
    damageTimeProfile: { status: "not_applicable", reason: "合成ケースは時間次元を持たない" },
    siteCorrection: { status: "not_applicable", reason: "合成ケースは拠点補正を持たない" },
    pathway: {
      pressure: options.pressure ?? "water_consumption",
      midpoint: options.midpoint ?? "freshwater_scarcity",
      damagePathway: options.damagePathway ?? "synthetic_damage",
      aopCode: options.aopCode ?? "human_health",
      metric: options.metric ?? "DALY",
      valuationTechnique: options.valuationTechnique ?? "daly_monetization",
      mappingVersion: "synthetic-pathway-v1",
      review: { status: "evidence_verified", reviewer: { kind: "ai" }, reviewedAt: "2026-09-06", verification: ["synthetic-interaction.test.ts"] },
      evidence: SYNTHETIC_EVIDENCE,
    },
    underlyingModel: { description: "合成モデル(テスト専用)", dataGeneration: "unmapped", evidence: SYNTHETIC_EVIDENCE },
    zeroMeaning: options.zeroMeaning,
    license: { mode: "embedded", productionDisplayAllowed: true },
  });
}

// ---------------------------------------------------------------------------
// 反実仮想の差し替え式
// ---------------------------------------------------------------------------

function findLiteral(trace: MethodEvaluationTrace, stepId: string, settingKey: string): LiteralOperand | undefined {
  const target = trace.steps.find((candidate) => candidate.id === stepId);
  if (!target) return undefined;
  for (const operand of Object.values(target.inputs)) {
    if (operand.kind === "literal" && operand.settingKey === settingKey) return operand;
  }
  return undefined;
}

export interface LiteralSwapFactorOptions {
  id: string;
  category: CounterfactualFactor["category"];
  label: string;
  stepId: string;
  settingKey: string;
  /** 差し替え値を加工する(同じ設定キーを2要因が奪い合うケースの再現に使う)。 */
  transform?: (value: number) => number;
}

/** 指定ステップの設定キーを、差し替え先トレースの同じキーの値へ置き換える要因。 */
export function literalSwapFactor(options: LiteralSwapFactorOptions): CounterfactualFactor {
  const { id, category, label, stepId, settingKey, transform } = options;
  return {
    id,
    category,
    label,
    evidence: SYNTHETIC_EVIDENCE,
    swap: (base, target): SwapResult => {
      const targetLiteral = findLiteral(target, stepId, settingKey);
      const baseLiteral = findLiteral(base, stepId, settingKey);
      if (!targetLiteral || !baseLiteral) {
        return {
          ok: false,
          reason: `ステップ "${stepId}" の設定 "${settingKey}" が${!targetLiteral ? "差し替え先" : "基準側"}のトレースにありません。倍率を仮置きしません。`,
          missingData: [
            {
              item: `${label}(${settingKey})の値と出典`,
              candidateSource: "手法の一次資料(該当式・表)",
              enablesRecalculation: true,
            },
          ],
        };
      }
      const replacement: LiteralOperand = transform
        ? { ...targetLiteral, value: transform(targetLiteral.value) }
        : targetLiteral;
      try {
        const trace = swapLiteral(base, stepId, settingKey, replacement);
        return {
          ok: true,
          trace,
          swapped: [
            {
              stepId,
              settingKey,
              from: { value: baseLiteral.value, label: `基準側 ${settingKey}`, evidence: baseLiteral.evidence },
              to: { value: replacement.value, label: `差し替え後 ${settingKey}`, evidence: replacement.evidence },
            },
          ],
        };
      } catch (error) {
        return {
          ok: false,
          reason: `差し替え後の再評価に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
          missingData: [],
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// レシピ本体(すべて testOnly)
// ---------------------------------------------------------------------------

type SyntheticRecipe = Omit<MethodComparisonRecipe, "hash">;

function baseRecipe(overrides: Partial<SyntheticRecipe> & Pick<SyntheticRecipe, "id" | "methodA" | "methodB" | "factors">): SyntheticRecipe {
  return {
    version: "1.0.0",
    category: "water",
    analysisUnit: "cross_method",
    countsTowardRealDataEvidence: false,
    review: {
      status: "evidence_verified",
      reviewer: { kind: "ai" },
      reviewedAt: "2026-09-06",
      verification: ["packages/core/src/divergence/recipes/synthetic-interaction.test.ts"],
    },
    evidence: SYNTHETIC_EVIDENCE,
    comparableScope: {
      valueConcept: "welfare",
      requiredSubjectAttributes: ["category", "flow", "quantity", "location", "period", "timeBasis"],
      pathwayNote: "合成ケース。実データの被覆一致を主張しない。",
    },
    supports: () => ({ ok: true }),
    normalization: [
      { id: "fx", label: "比較前正規化(共通通貨・価格年へ揃える)", stepKinds: ["currency_conversion"], evidence: SYNTHETIC_EVIDENCE },
    ],
    decompositionKind: "partial",
    baseline: "B",
    reverseCompatible: false,
    fixedDifferences: [],
    modePolicy: {},
    budget: { maxFactors: 4, maxEvaluations: 16 },
    testOnly: true,
    ...overrides,
  };
}

const ALPHA_FACTOR = literalSwapFactor({
  id: "alpha",
  category: "coverage_pathway",
  label: "被覆係数α",
  stepId: "alpha",
  settingKey: "alpha",
});
const BETA_FACTOR = literalSwapFactor({
  id: "beta",
  category: "geographic_model",
  label: "地理係数β",
  stepId: "beta",
  settingKey: "beta",
});
const DELTA_FACTOR = literalSwapFactor({
  id: "delta",
  category: "time_model",
  label: "時間係数δ",
  stepId: "delta",
  settingKey: "delta",
});

/** (a) 2要因が独立な積。完全分解・逆方向互換(γ・数量を両側で共通にした場合のみ成立)。 */
export const SYNTHETIC_PRODUCT_FULL: SyntheticRecipe = baseRecipe({
  id: "synthetic-product-full",
  methodA: { methodId: "synthetic-product-a", versionRange: "1.*" },
  methodB: { methodId: "synthetic-product-b", versionRange: "1.*" },
  factors: [ALPHA_FACTOR, BETA_FACTOR],
  decompositionKind: "full",
  reverseCompatible: true,
});

/** (b) MAX集計を含む相互作用。γを基準側に固定するため部分分解・逆方向非互換。 */
export const SYNTHETIC_MAX_PARTIAL: SyntheticRecipe = baseRecipe({
  id: "synthetic-max-partial",
  methodA: { methodId: "synthetic-max-a", versionRange: "1.*" },
  methodB: { methodId: "synthetic-max-b", versionRange: "1.*" },
  factors: [
    literalSwapFactor({ id: "alpha", category: "coverage_pathway", label: "経路α(MAX候補)", stepId: "a", settingKey: "alpha" }),
    literalSwapFactor({ id: "beta", category: "coverage_pathway", label: "経路β(MAX候補)", stepId: "b", settingKey: "beta" }),
  ],
  decompositionKind: "partial",
  reverseCompatible: false,
  fixedDifferences: [
    {
      category: "underlying_model_data",
      description: "損害関数γは両手法で異なるが、反実仮想の式を一次資料から定義できないため基準側に固定した。",
      sideA: "手法Aの損害関数γ",
      sideB: "手法Bの損害関数γ(基準側に固定)",
      evidence: SYNTHETIC_EVIDENCE,
      acquisitionAction: {
        item: "損害関数γの公開式",
        candidateSource: "手法A・手法Bの方法論文書",
        enablesRecalculation: true,
      },
    },
  ],
});

/** (c) 3要因。`budget.maxEvaluations` を 2^3 が超えるため `budget_exceeded` で停止する。 */
export const SYNTHETIC_BUDGET_EXCEEDED: SyntheticRecipe = baseRecipe({
  id: "synthetic-budget",
  methodA: { methodId: "synthetic-budget-a", versionRange: "1.*" },
  methodB: { methodId: "synthetic-budget-b", versionRange: "1.*" },
  factors: [ALPHA_FACTOR, BETA_FACTOR, DELTA_FACTOR],
  budget: { maxFactors: 3, maxEvaluations: 4 },
});

/** (d) 加法向け。ゼロ・同符号負値を含むケースで使う。 */
export const SYNTHETIC_SUM_ADDITIVE: SyntheticRecipe = baseRecipe({
  id: "synthetic-sum-additive",
  methodA: { methodId: "synthetic-sum-a", versionRange: "1.*" },
  methodB: { methodId: "synthetic-sum-b", versionRange: "1.*" },
  factors: [
    literalSwapFactor({ id: "alpha", category: "coverage_pathway", label: "加算項α", stepId: "alpha", settingKey: "alpha" }),
    literalSwapFactor({ id: "beta", category: "valuation_technique", label: "加算項β", stepId: "beta", settingKey: "beta" }),
  ],
  decompositionKind: "full",
  reverseCompatible: true,
});

/** (e) 2要因が同じ設定キーを奪い合い、適用順で値が変わる(組合せで意味を失う)。 */
export const SYNTHETIC_ORDER_DEPENDENT: SyntheticRecipe = baseRecipe({
  id: "synthetic-order-dependent",
  methodA: { methodId: "synthetic-order-a", versionRange: "1.*" },
  methodB: { methodId: "synthetic-order-b", versionRange: "1.*" },
  factors: [
    literalSwapFactor({ id: "alpha_direct", category: "coverage_pathway", label: "係数αをそのまま差し替える", stepId: "alpha", settingKey: "alpha" }),
    literalSwapFactor({
      id: "alpha_scaled",
      category: "geographic_model",
      label: "係数αを地域補正込みで差し替える",
      stepId: "alpha",
      settingKey: "alpha",
      transform: (value) => value * 2,
    }),
  ],
});

/** (f) 反実仮想を定義できない要因(存在しない設定キー)を含み、F を縮小する。 */
export const SYNTHETIC_EXCLUDED_FACTOR: SyntheticRecipe = baseRecipe({
  id: "synthetic-excluded-factor",
  methodA: { methodId: "synthetic-excl-a", versionRange: "1.*" },
  methodB: { methodId: "synthetic-excl-b", versionRange: "1.*" },
  factors: [
    ALPHA_FACTOR,
    literalSwapFactor({ id: "epsilon", category: "underlying_model_data", label: "疫学モデルε", stepId: "model", settingKey: "epsilon" }),
  ],
});

/** (g) レビュー状態が draft。登録はできるが実行時に `recipe_not_registrable` で停止する。 */
export const SYNTHETIC_DRAFT_REVIEW: SyntheticRecipe = baseRecipe({
  id: "synthetic-draft-review",
  methodA: { methodId: "synthetic-draft-a", versionRange: "1.*" },
  methodB: { methodId: "synthetic-draft-b", versionRange: "1.*" },
  factors: [ALPHA_FACTOR],
  review: { status: "draft", reviewer: { kind: "ai" }, reviewedAt: "2026-09-06", verification: [] },
});

export const SYNTHETIC_RECIPES: SyntheticRecipe[] = [
  SYNTHETIC_PRODUCT_FULL,
  SYNTHETIC_MAX_PARTIAL,
  SYNTHETIC_BUDGET_EXCEEDED,
  SYNTHETIC_SUM_ADDITIVE,
  SYNTHETIC_ORDER_DEPENDENT,
  SYNTHETIC_EXCLUDED_FACTOR,
  SYNTHETIC_DRAFT_REVIEW,
];
