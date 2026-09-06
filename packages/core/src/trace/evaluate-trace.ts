/**
 * M4完成 §5.3・§6.2:計算トレースの汎用評価器。
 *
 * トレースのステップは構造化演算(product/sum/max/ratio/power/discounted_sum/identity)だけを持ち、
 * この評価器が順に実行して出力とハッシュを確定する。反実仮想 v(S) は、比較レシピがリテラルを
 * 差し替えたトレースを **同じ評価器で再実行** して得る。固定倍率の合成で代用しない。
 *
 * このモジュールは手法固有の意味を知らない。手法アダプター(monetization/trace/*)と
 * 分解エンジン(divergence/counterfactual.ts)の両方から使う共有部品である。
 */

import type { MethodEvaluationTrace, TraceOperand, TraceStep, TraceStepDraft, TraceValue } from "../types/trace";
import { computeRecordHash } from "../ledger/recalculation-hash";
import { TOLERANCE_POLICY, toleranceScale, withinTolerance } from "../divergence/tolerance";

export class TraceEvaluationError extends Error {
  constructor(
    public readonly stepId: string,
    message: string
  ) {
    super(`[trace:${stepId}] ${message}`);
  }
}

type Resolved = number | number[];

function resolveOperand(stepId: string, name: string, operand: TraceOperand | undefined, outputs: Map<string, TraceValue>): Resolved {
  if (!operand) throw new TraceEvaluationError(stepId, `オペランド "${name}" が inputs に存在しません。`);
  if (operand.kind === "literal") {
    if (!Number.isFinite(operand.value)) {
      throw new TraceEvaluationError(stepId, `オペランド "${name}" が有限値ではありません(${operand.value})。欠損を0へ置換しません。`);
    }
    return operand.value;
  }
  if (operand.kind === "series") {
    if (operand.values.some((v) => !Number.isFinite(v))) {
      throw new TraceEvaluationError(stepId, `系列オペランド "${name}" に非有限値が含まれます。`);
    }
    return operand.values;
  }
  const referenced = outputs.get(operand.stepId);
  if (!referenced) {
    throw new TraceEvaluationError(stepId, `参照先ステップ "${operand.stepId}" は未評価または存在しません(順序を確認してください)。`);
  }
  return referenced.value;
}

function scalar(stepId: string, name: string, value: Resolved): number {
  if (Array.isArray(value)) throw new TraceEvaluationError(stepId, `オペランド "${name}" は系列ですがスカラーが必要です。`);
  return value;
}

function series(stepId: string, name: string, value: Resolved): number[] {
  if (!Array.isArray(value)) throw new TraceEvaluationError(stepId, `オペランド "${name}" はスカラーですが系列が必要です。`);
  return value;
}

/** 1ステップの演算を実行する。`applied: false` のステップは identity のみ許す。 */
export function evaluateStep(step: TraceStepDraft, outputs: Map<string, TraceValue>): number {
  const op = step.operation;
  const get = (name: string) => resolveOperand(step.id, name, step.inputs[name], outputs);

  if (!step.applied && op.op !== "identity") {
    throw new TraceEvaluationError(step.id, "applied=false のステップは operation を identity にしてください(素通しする入力を明示する)。");
  }

  switch (op.op) {
    case "identity":
      return scalar(step.id, op.operand, get(op.operand));
    case "product": {
      if (op.operands.length === 0) throw new TraceEvaluationError(step.id, "product のオペランドが空です。");
      return op.operands.reduce((acc, name) => acc * scalar(step.id, name, get(name)), 1);
    }
    case "sum": {
      if (op.operands.length === 0) throw new TraceEvaluationError(step.id, "sum のオペランドが空です。");
      return op.operands.reduce((acc, name) => acc + scalar(step.id, name, get(name)), 0);
    }
    case "max": {
      if (op.operands.length === 0) throw new TraceEvaluationError(step.id, "max のオペランドが空です。");
      return Math.max(...op.operands.map((name) => scalar(step.id, name, get(name))));
    }
    case "ratio": {
      const denominator = scalar(step.id, op.denominator, get(op.denominator));
      if (denominator === 0) throw new TraceEvaluationError(step.id, `ratio の分母 "${op.denominator}" が 0 です。`);
      return scalar(step.id, op.numerator, get(op.numerator)) / denominator;
    }
    case "power":
      return scalar(step.id, op.base, get(op.base)) ** scalar(step.id, op.exponent, get(op.exponent));
    case "discounted_sum": {
      const values = series(step.id, op.series, get(op.series));
      const rate = scalar(step.id, op.rate, get(op.rate));
      return values.reduce((acc, v, t) => acc + v / (1 + rate) ** t, 0);
    }
  }
}

function stepInputHash(step: TraceStepDraft, outputs: Map<string, TraceValue>): string {
  const resolvedInputs: Record<string, unknown> = {};
  for (const [name, operand] of Object.entries(step.inputs)) {
    resolvedInputs[name] =
      operand.kind === "ref" ? { ref: operand.stepId, value: outputs.get(operand.stepId)?.value } : operand;
  }
  return computeRecordHash("ts-in", { id: step.id, operation: step.operation, inputs: resolvedInputs, applied: step.applied });
}

/**
 * 草稿を順に評価し、order・output・inputHash・outputHash を確定した TraceStep[] を返す。
 * `expectedOutput` がある草稿は、算出値との一致を許容誤差(tol-v1)で検証し、不一致なら例外にする
 * (誤ったトレースを出すより出さない)。
 */
export function materializeSteps(drafts: TraceStepDraft[]): TraceStep[] {
  const outputs = new Map<string, TraceValue>();
  const steps: TraceStep[] = [];
  const seen = new Set<string>();

  drafts.forEach((draft, index) => {
    if (seen.has(draft.id)) throw new TraceEvaluationError(draft.id, "ステップIDが重複しています。");
    seen.add(draft.id);

    const value = evaluateStep(draft, outputs);
    if (!Number.isFinite(value)) {
      throw new TraceEvaluationError(draft.id, `出力が有限値ではありません(${value})。`);
    }
    const output: TraceValue = {
      value,
      unit: draft.outputUnit,
      currency: draft.outputCurrency ?? null,
      priceYear: draft.outputPriceYear ?? null,
    };
    if (draft.expectedOutput) {
      const scale = toleranceScale([value, draft.expectedOutput.value]);
      if (!withinTolerance(value, draft.expectedOutput.value, scale, TOLERANCE_POLICY.money)) {
        throw new TraceEvaluationError(
          draft.id,
          `評価器の算出値(${value})が期待値(${draft.expectedOutput.value})と許容誤差(${TOLERANCE_POLICY.version})を超えて食い違います。`
        );
      }
    }
    outputs.set(draft.id, output);

    const { expectedOutput: _expected, outputUnit: _u, outputCurrency: _c, outputPriceYear: _p, ...rest } = draft;
    void _expected;
    void _u;
    void _c;
    void _p;
    const inputHash = stepInputHash(draft, outputs);
    steps.push({
      ...rest,
      order: index,
      output,
      inputHash,
      outputHash: computeRecordHash("ts-out", { id: draft.id, inputHash, output }),
    });
  });

  return steps;
}

/** 確定済み TraceStep[] を草稿へ戻す(差し替え後の再評価に使う)。 */
export function toDrafts(steps: TraceStep[]): TraceStepDraft[] {
  return [...steps]
    .sort((a, b) => a.order - b.order)
    .map(({ order: _o, inputHash: _i, outputHash: _h, output, ...rest }) => {
      void _o;
      void _i;
      void _h;
      return {
        ...rest,
        outputUnit: output.unit,
        outputCurrency: output.currency ?? null,
        outputPriceYear: output.priceYear ?? null,
      };
    });
}

export function traceHash(trace: Omit<MethodEvaluationTrace, "hash">): string {
  return computeRecordHash("trace", {
    traceVersion: trace.traceVersion,
    methodId: trace.methodId,
    subFactorId: trace.subFactorId,
    methodVersion: trace.methodVersion,
    coefficientSetVersion: trace.coefficientSetVersion,
    physicalQuantityId: trace.physicalQuantityId,
    inputSnapshot: trace.inputSnapshot,
    steps: trace.steps.map((s) => ({ id: s.id, inputHash: s.inputHash, outputHash: s.outputHash })),
    finalValue: trace.finalValue,
    pathway: { mappingVersion: trace.pathway.mappingVersion, aopCode: trace.pathway.aopCode },
    license: trace.license.mode,
    evidence: trace.steps.flatMap((s) => s.evidence.map((e) => e.hash ?? `${e.source}#${e.locator ?? ""}`)),
  });
}

export interface FinalizeTraceInput extends Omit<MethodEvaluationTrace, "hash" | "steps" | "finalValue"> {
  steps: TraceStepDraft[];
  /** 最終値とみなすステップID。省略時は最後のステップ。 */
  finalStepId?: string;
}

/** 草稿から完全なトレースを組み立てる。最終値は指定ステップの出力。 */
export function finalizeTrace(input: FinalizeTraceInput): MethodEvaluationTrace {
  const { steps: drafts, finalStepId, ...rest } = input;
  const steps = materializeSteps(drafts);
  if (steps.length === 0) throw new TraceEvaluationError("(trace)", "ステップが空のトレースは最終値を持てません。");
  const finalStep = finalStepId ? steps.find((s) => s.id === finalStepId) : steps[steps.length - 1];
  if (!finalStep) throw new TraceEvaluationError(finalStepId ?? "(trace)", "最終値ステップが見つかりません。");
  const withoutHash: Omit<MethodEvaluationTrace, "hash"> = { ...rest, steps, finalValue: finalStep.output };
  return { ...withoutHash, hash: traceHash(withoutHash) };
}

/**
 * 保存済みトレースをリテラルから再実行し、記録された各出力・最終値と一致するかを検証する(T-05)。
 * 一致しない場合は不一致ステップを返し、例外にはしない(診断用)。
 */
export function replayTrace(trace: MethodEvaluationTrace): {
  finalValue: number;
  matches: boolean;
  mismatchedStepIds: string[];
} {
  const replayed = materializeSteps(toDrafts(trace.steps));
  const mismatched: string[] = [];
  for (const step of replayed) {
    const recorded = trace.steps.find((s) => s.id === step.id);
    if (!recorded) {
      mismatched.push(step.id);
      continue;
    }
    const scale = toleranceScale([step.output.value, recorded.output.value]);
    if (!withinTolerance(step.output.value, recorded.output.value, scale, TOLERANCE_POLICY.money)) mismatched.push(step.id);
  }
  const lastRecorded = trace.steps.reduce((last, s) => (s.order > last.order ? s : last), trace.steps[0]);
  const finalValue = replayed.find((s) => s.id === lastRecorded?.id)?.output.value ?? NaN;
  const finalScale = toleranceScale([finalValue, trace.finalValue.value]);
  const finalMatches = withinTolerance(finalValue, trace.finalValue.value, finalScale, TOLERANCE_POLICY.money);
  return { finalValue, matches: mismatched.length === 0 && finalMatches, mismatchedStepIds: mismatched };
}

/**
 * 指定ステップの設定キーを持つリテラルを差し替え、再評価したトレースを返す(レシピの swap の基本操作)。
 * 該当キーが無い場合は例外にする(無いものを黙って据え置かない)。
 */
export function swapLiteral(
  trace: MethodEvaluationTrace,
  stepId: string,
  settingKey: string,
  replacement: Extract<TraceOperand, { kind: "literal" }> | Extract<TraceOperand, { kind: "series" }>
): MethodEvaluationTrace {
  let found = false;
  const drafts = toDrafts(trace.steps).map((draft) => {
    if (draft.id !== stepId) return draft;
    const inputs: Record<string, TraceOperand> = {};
    for (const [name, operand] of Object.entries(draft.inputs)) {
      if (operand.kind !== "ref" && operand.settingKey === settingKey) {
        found = true;
        inputs[name] = { ...replacement, settingKey };
      } else {
        inputs[name] = operand;
      }
    }
    return { ...draft, inputs };
  });
  if (!found) throw new TraceEvaluationError(stepId, `settingKey "${settingKey}" を持つリテラルがありません。`);
  const finalStepId = trace.steps.reduce((last, s) => (s.order > last.order ? s : last), trace.steps[0]).id;
  const { hash: _hash, steps: _steps, finalValue: _final, ...rest } = trace;
  void _hash;
  void _steps;
  void _final;
  return finalizeTrace({ ...rest, steps: drafts, finalStepId });
}
