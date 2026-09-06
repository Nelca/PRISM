import { describe, expect, it } from "vitest";
import type { EvidenceRef } from "../types/comparison";
import type { MethodEvaluationTrace, TraceStepDraft } from "../types/trace";
import { finalizeTrace, materializeSteps, replayTrace, swapLiteral, TraceEvaluationError } from "./evaluate-trace";

const EV: EvidenceRef[] = [{ source: "test", tier: "primary" }];

function draft(partial: Partial<TraceStepDraft> & Pick<TraceStepDraft, "id" | "operation" | "inputs">): TraceStepDraft {
  return {
    role: "method_model",
    kind: "coefficient_application",
    label: partial.id,
    formula: partial.id,
    evidence: EV,
    applied: true,
    outputUnit: "JPY",
    ...partial,
  };
}

function lit(value: number, settingKey?: string) {
  return { kind: "literal" as const, value, unit: "x", evidence: EV, settingKey };
}

describe("materializeSteps:構造化演算だけを順に評価する", () => {
  it("product / sum / max / ratio / power / identity / discounted_sum を評価し、参照を解決する", () => {
    const steps = materializeSteps([
      draft({ id: "q", operation: { op: "identity", operand: "v" }, inputs: { v: lit(10) } }),
      draft({ id: "p", operation: { op: "product", operands: ["a", "b"] }, inputs: { a: { kind: "ref", stepId: "q" }, b: lit(3) } }),
      draft({ id: "s", operation: { op: "sum", operands: ["a", "b"] }, inputs: { a: { kind: "ref", stepId: "p" }, b: lit(5) } }),
      draft({ id: "m", operation: { op: "max", operands: ["a", "b", "c"] }, inputs: { a: lit(1), b: lit(7), c: { kind: "ref", stepId: "q" } } }),
      draft({ id: "r", operation: { op: "ratio", numerator: "a", denominator: "b" }, inputs: { a: lit(9), b: lit(3) } }),
      draft({ id: "pw", operation: { op: "power", base: "a", exponent: "b" }, inputs: { a: lit(2), b: lit(3) } }),
      draft({
        id: "d",
        operation: { op: "discounted_sum", series: "s", rate: "r" },
        inputs: { s: { kind: "series", values: [100, 100], unit: "JPY", evidence: EV }, r: lit(0.0) },
      }),
    ]);
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.output.value]));
    expect(byId).toEqual({ q: 10, p: 30, s: 35, m: 10, r: 3, pw: 8, d: 200 });
    expect(steps.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(new Set(steps.map((s) => s.outputHash)).size).toBe(7);
  });

  it("非有限値・未評価参照・0除算・applied=false の非identity は例外にする(欠損を0へ置換しない)", () => {
    expect(() => materializeSteps([draft({ id: "x", operation: { op: "identity", operand: "v" }, inputs: { v: lit(NaN) } })])).toThrow(
      TraceEvaluationError
    );
    expect(() =>
      materializeSteps([draft({ id: "x", operation: { op: "identity", operand: "v" }, inputs: { v: { kind: "ref", stepId: "nope" } } })])
    ).toThrow(TraceEvaluationError);
    expect(() =>
      materializeSteps([draft({ id: "x", operation: { op: "ratio", numerator: "a", denominator: "b" }, inputs: { a: lit(1), b: lit(0) } })])
    ).toThrow(TraceEvaluationError);
    expect(() =>
      materializeSteps([
        draft({ id: "x", applied: false, skipReason: "skip", operation: { op: "product", operands: ["a"] }, inputs: { a: lit(1) } }),
      ])
    ).toThrow(TraceEvaluationError);
  });

  it("expectedOutput と許容誤差を超えて食い違う草稿は例外にする", () => {
    expect(() =>
      materializeSteps([
        draft({
          id: "x",
          operation: { op: "product", operands: ["a", "b"] },
          inputs: { a: lit(2), b: lit(3) },
          expectedOutput: { value: 7, unit: "JPY" },
        }),
      ])
    ).toThrow(TraceEvaluationError);
  });
});

function sampleTrace(ppp = 94.46): MethodEvaluationTrace {
  return finalizeTrace({
    traceVersion: "1",
    methodId: "m",
    subFactorId: "m",
    recordMethodId: "m",
    methodVersion: "1",
    coefficientSetVersion: "c1",
    physicalQuantityId: "pq",
    inputSnapshot: { category: "water", physicalQuantity: 10, unit: "m3", siteId: "s", sourceRegion: "JP", targetRegion: "JP" },
    flowInterpretation: { inputProvides: "withdrawal", methodAssumes: "withdrawal", status: "match", evidence: EV },
    endpointBreakdown: { status: "available" },
    damageTimeProfile: { status: "not_applicable", reason: "no time dimension" },
    siteCorrection: { status: "not_applicable", reason: "n/a" },
    pathway: {
      pressure: "water_withdrawal",
      midpoint: "unmapped",
      damagePathway: "unmapped",
      aopCode: "human_health",
      metric: "DALY",
      valuationTechnique: "daly_monetization",
      mappingVersion: "v1",
      review: { status: "evidence_verified", reviewer: { kind: "ai" }, reviewedAt: "2026-09-06", verification: [] },
      evidence: EV,
    },
    underlyingModel: { description: "test", dataGeneration: "unmapped", evidence: EV },
    license: { mode: "embedded", productionDisplayAllowed: true },
    steps: [
      draft({ id: "usd", operation: { op: "product", operands: ["q", "f"] }, inputs: { q: lit(10), f: lit(0.5) }, outputUnit: "USD" }),
      draft({
        id: "jpy",
        kind: "geographic_calibration",
        role: "reconciliation",
        operation: { op: "product", operands: ["v", "ppp"] },
        inputs: { v: { kind: "ref", stepId: "usd" }, ppp: lit(ppp, "ppp") },
      }),
    ],
  });
}

describe("finalizeTrace / replayTrace / swapLiteral", () => {
  it("最終値は最後のステップの出力で、リテラルから再生した値と一致する", () => {
    const trace = sampleTrace();
    expect(trace.finalValue.value).toBeCloseTo(10 * 0.5 * 94.46, 9);
    const replay = replayTrace(trace);
    expect(replay.matches).toBe(true);
    expect(replay.finalValue).toBeCloseTo(trace.finalValue.value, 9);
  });

  it("swapLiteral は settingKey のリテラルを差し替えて同じ評価器で再実行し、ハッシュが変わる", () => {
    const trace = sampleTrace();
    const swapped = swapLiteral(trace, "jpy", "ppp", lit(1, "ppp"));
    expect(swapped.finalValue.value).toBeCloseTo(5, 9);
    expect(swapped.hash).not.toBe(trace.hash);
    expect(() => swapLiteral(trace, "jpy", "no-such-key", lit(1))).toThrow(TraceEvaluationError);
  });

  it("記録された出力が改ざんされていれば replayTrace が不一致を報告する", () => {
    const trace = sampleTrace();
    const tampered: MethodEvaluationTrace = {
      ...trace,
      steps: trace.steps.map((s) => (s.id === "jpy" ? { ...s, output: { ...s.output, value: s.output.value * 2 } } : s)),
    };
    const replay = replayTrace(tampered);
    expect(replay.matches).toBe(false);
    expect(replay.mismatchedStepIds).toEqual(["jpy"]);
  });
});
