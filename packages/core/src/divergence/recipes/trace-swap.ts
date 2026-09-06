/**
 * M4完成 T-11/T-12:実データ比較レシピが使う共通の差し替え部品。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.4・§6.2
 *
 * 合成レシピ(`synthetic-interaction.ts`)の `literalSwapFactor` は、両トレースのステップIDが
 * 同じであることを前提にしている。実データの手法アダプターはステップIDに `recordMethodId` を
 * 含める(例 `ifvi-water-consumption.VFes.geographic_calibration` と
 * `lime3-water.geographic_calibration`)ため、**ステップIDを手法ごとに解決する**必要がある。
 * また `lime3-water.endpoint_allocation` の配分率リテラルには `settingKey` が付いていないため、
 * オペランド名での照合も要る。この2点だけを合成版から拡張したものがこのモジュールである。
 *
 * 差し替えは必ず共有評価器(`trace/evaluate-trace.ts`)での**再実行**で行い、固定倍率の合成で
 * 代用しない(§6.2)。差し替え対象が見つからない場合は理由と不足データを返し、値を仮置きしない。
 */

import type { EvidenceRef } from "../../types/comparison";
import type { CounterfactualFactor, DataAcquisitionAction, SwapResult, SwappedSetting } from "../../types/recipe";
import type { MethodEvaluationTrace, TraceOperand, TraceStepDraft } from "../../types/trace";
import { finalizeTrace, toDrafts } from "../../trace/evaluate-trace";

export type LiteralOperand = Extract<TraceOperand, { kind: "literal" }>;

/** 差し替える1リテラルの指定。`settingKey` を優先し、無い場合だけ `operandName` で照合する。 */
export interface LiteralSelector {
  /** 表示用の名前(SwappedSetting.settingKey に入る)。 */
  key: string;
  settingKey?: string;
  operandName?: string;
  label: string;
}

function matches(name: string, operand: TraceOperand, selector: LiteralSelector): operand is LiteralOperand {
  if (operand.kind !== "literal") return false;
  if (selector.settingKey !== undefined) return operand.settingKey === selector.settingKey;
  return name === selector.operandName;
}

/** ステップ内から該当リテラルを探す。見つからなければ undefined(推定で埋めない)。 */
export function findLiteral(
  trace: MethodEvaluationTrace,
  stepId: string,
  selector: LiteralSelector
): LiteralOperand | undefined {
  const step = trace.steps.find((candidate) => candidate.id === stepId);
  if (!step) return undefined;
  for (const [name, operand] of Object.entries(step.inputs)) {
    if (matches(name, operand, selector)) return operand;
  }
  return undefined;
}

/**
 * 指定ステップの複数リテラルをまとめて差し替え、同じ評価器で再実行したトレースを返す。
 * `evaluate-trace.ts` の `swapLiteral` を、複数キー・オペランド名照合へ広げたもの。
 */
export function replaceLiterals(
  trace: MethodEvaluationTrace,
  stepId: string,
  replacements: { selector: LiteralSelector; operand: LiteralOperand }[]
): MethodEvaluationTrace {
  const drafts: TraceStepDraft[] = toDrafts(trace.steps).map((draft) => {
    if (draft.id !== stepId) return draft;
    const inputs: Record<string, TraceOperand> = {};
    for (const [name, operand] of Object.entries(draft.inputs)) {
      const replacement = replacements.find(({ selector }) => matches(name, operand, selector));
      // 差し替え後も基準側の settingKey を維持する(後続の差し替え・監査で同じキーで引けるようにする)。
      inputs[name] =
        replacement && operand.kind === "literal" ? { ...replacement.operand, settingKey: operand.settingKey } : operand;
    }
    return { ...draft, inputs };
  });
  const finalStepId = trace.steps.reduce((last, step) => (step.order > last.order ? step : last), trace.steps[0]).id;
  const { hash: _hash, steps: _steps, finalValue: _final, ...rest } = trace;
  void _hash;
  void _steps;
  void _final;
  return finalizeTrace({ ...rest, steps: drafts, finalStepId });
}

/** 差し替え対象の1ステップと、その中で差し替えるリテラル群。 */
export interface SwapTarget {
  /** 差し替え対象ステップをトレースから特定する。手法ごとにステップIDが異なるため関数で解決する。 */
  resolveStepId: (trace: MethodEvaluationTrace) => string | undefined;
  /** そのステップ内で差し替えるリテラル(複数可)。 */
  selectors: LiteralSelector[];
}

export interface RealDataSwapFactorOptions {
  id: string;
  category: CounterfactualFactor["category"];
  label: string;
  evidence: EvidenceRef[];
  /**
   * 差し替える設定の束。複数ステップに跨ってよい(例:LIME3の地理的視点は、係数照会ステップの
   * DALY/m³ と貨幣化ステップの統合化係数の**両方**を同じ公表列から取るため、1要因として束ねる)。
   */
  targets: SwapTarget[];
  /** 差し替えが定義できない場合に返す不足データ(取得すれば再計算可能になるもの)。 */
  missingData?: DataAcquisitionAction[];
  /**
   * 追加の事前条件。満たさない場合は差し替えを行わず理由を返す(倍率を仮置きしない)。
   * 例:一方の手法が地理較正を適用していない(円建て単価)ため差し替えの意味が無い。
   */
  precondition?: (base: MethodEvaluationTrace, target: MethodEvaluationTrace) => string | null;
}

/**
 * 実データ用の反実仮想要因。`swap(base, target)` は base(手法B)のトレースの指定リテラルを
 * target(手法A)の同じリテラルで置き換えて再実行する。
 */
export function realDataSwapFactor(options: RealDataSwapFactorOptions): CounterfactualFactor {
  const { id, category, label, evidence, targets } = options;
  const missingData = options.missingData ?? [];

  return {
    id,
    category,
    label,
    evidence,
    swap: (base, target): SwapResult => {
      const preconditionFailure = options.precondition?.(base, target);
      if (preconditionFailure) return { ok: false, reason: preconditionFailure, missingData };

      const plan: { baseStepId: string; replacements: { selector: LiteralSelector; operand: LiteralOperand }[] }[] = [];
      const swapped: SwappedSetting[] = [];

      for (const { resolveStepId, selectors } of targets) {
        const baseStepId = resolveStepId(base);
        const targetStepId = resolveStepId(target);
        if (!baseStepId || !targetStepId) {
          return {
            ok: false,
            reason:
              `要因「${label}」の差し替え対象ステップが` +
              `${!baseStepId ? "基準側" : "差し替え先"}のトレース(${!baseStepId ? base.recordMethodId : target.recordMethodId})にありません。` +
              "式を定義できないため倍率を仮置きしません。",
            missingData,
          };
        }

        const replacements: { selector: LiteralSelector; operand: LiteralOperand }[] = [];
        for (const selector of selectors) {
          const targetLiteral = findLiteral(target, targetStepId, selector);
          const baseLiteral = findLiteral(base, baseStepId, selector);
          if (!targetLiteral || !baseLiteral) {
            return {
              ok: false,
              reason:
                `要因「${label}」の設定「${selector.label}」が` +
                `${!targetLiteral ? "差し替え先" : "基準側"}のトレースにありません。倍率を仮置きしません。`,
              missingData,
            };
          }
          replacements.push({ selector, operand: targetLiteral });
          swapped.push({
            stepId: baseStepId,
            settingKey: selector.key,
            from: { value: baseLiteral.value, label: `基準側 ${selector.label}`, evidence: baseLiteral.evidence },
            to: { value: targetLiteral.value, label: `差し替え後 ${selector.label}`, evidence: targetLiteral.evidence },
          });
        }
        plan.push({ baseStepId, replacements });
      }

      try {
        let trace = base;
        for (const { baseStepId, replacements } of plan) {
          trace = replaceLiterals(trace, baseStepId, replacements);
        }
        return { ok: true, trace, swapped };
      } catch (error) {
        return {
          ok: false,
          reason: `差し替え後の再評価に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
          missingData,
        };
      }
    },
  };
}

/** 指定 kind のステップIDを解決する(手法ごとにステップIDの接頭辞が異なるため)。 */
export function stepIdOfKind(kind: MethodEvaluationTrace["steps"][number]["kind"]) {
  return (trace: MethodEvaluationTrace): string | undefined => trace.steps.find((step) => step.kind === kind)?.id;
}
