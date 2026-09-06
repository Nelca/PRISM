import { describe, expect, it } from "vitest";
import {
  checkComparability,
  compareSubjects,
  comparePathways,
  convertUnit,
  recipeSideMatches,
  versionInRange,
} from "./comparability";
import { makeComparisonSubject, makeValuationRecord } from "./test-helpers";
import { makeSyntheticTrace, SYNTHETIC_EVIDENCE, SYNTHETIC_PRODUCT_FULL } from "./recipes/synthetic-interaction";
import { createTestRegistry } from "./recipes/registry";
import type { CausalPathway, ZeroMeaning } from "../types/comparison";

const registry = createTestRegistry();
const PRODUCT_FULL = registry.register(SYNTHETIC_PRODUCT_FULL);

function pathway(overrides: Partial<CausalPathway> = {}): CausalPathway {
  return {
    pressure: "water_consumption",
    midpoint: "freshwater_scarcity",
    damagePathway: "agricultural_water_shortage_malnutrition",
    aopCode: "human_health",
    metric: "DALY",
    valuationTechnique: "daly_monetization",
    mappingVersion: "test-v1",
    review: { status: "evidence_verified", reviewer: { kind: "ai" }, reviewedAt: "2026-09-06", verification: [] },
    evidence: SYNTHETIC_EVIDENCE,
    ...overrides,
  };
}

const PUBLISHED_ZERO: ZeroMeaning = {
  code: "published_zero",
  candidates: ["published_zero", "computed_zero"],
  evidence: SYNTHETIC_EVIDENCE,
  rationale: "規則2:出典が0を公表し、非該当・被覆外の明示がない。",
  assignedBy: "method_adapter",
};

describe("convertUnit / versionInRange / recipeSideMatches", () => {
  it("同一次元の単純換算だけを許す(kg↔t は可、m3↔kg は不可)", () => {
    expect(convertUnit("t", "kg")?.factor).toBe(1000);
    expect(convertUnit("kg", "t")?.factor).toBe(0.001);
    expect(convertUnit("m3", "m3")?.factor).toBe(1);
    expect(convertUnit("m3", "kg")).toBeNull();
    expect(convertUnit("m3", "present_value_JPY")).toBeNull();
  });

  it("版レンジは完全一致・接頭辞・列挙・ワイルドカードだけを解釈する", () => {
    expect(versionInRange("1.0.0", "*")).toBe(true);
    expect(versionInRange("1.0.0", "1.0.0")).toBe(true);
    expect(versionInRange("1.2.3", "1.*")).toBe(true);
    expect(versionInRange("2.0.0", "1.*")).toBe(false);
    expect(versionInRange("2.0.0", "1.*|2.0.0")).toBe(true);
    expect(versionInRange("2.0.0", ">=1.0.0")).toBe(false);
  });

  it("レシピの片側は手法ID・内訳ID・版レンジのすべてで照合する", () => {
    const side = { methodId: "m", subFactorId: "VFes", versionRange: "1.*" };
    expect(recipeSideMatches(side, { methodId: "m", subFactorId: "VFes", methodVersion: "1.2.0" })).toBe(true);
    expect(recipeSideMatches(side, { methodId: "m", subFactorId: "VFnutrition", methodVersion: "1.2.0" })).toBe(false);
    expect(recipeSideMatches(side, { methodId: "m", subFactorId: "VFes", methodVersion: "2.0.0" })).toBe(false);
  });
});

describe("compareSubjects(§5.1)", () => {
  it("全属性が一致すれば same を返す", () => {
    const result = compareSubjects(makeComparisonSubject(), makeComparisonSubject());
    expect(result.kind).toBe("same");
  });

  it("水源種別が unknown 同士なら same だが、仮定として明示する", () => {
    const subject = makeComparisonSubject({ flow: { kind: "water", waterSource: "unknown", waterUse: "consumption" } });
    const result = compareSubjects(subject, subject);
    expect(result.kind).toBe("same");
    if (result.kind !== "same") return;
    expect(result.assumptions.join(" ")).toContain("水源種別");
  });

  it("unknown と具体値は different_subject にする(不明側を推定で埋めない)", () => {
    const unknown = makeComparisonSubject({ flow: { kind: "water", waterSource: "unknown", waterUse: "consumption" } });
    const surface = makeComparisonSubject({ flow: { kind: "water", waterSource: "surface", waterUse: "consumption" } });
    const result = compareSubjects(unknown, surface);
    expect(result.kind).toBe("different_subject");
    if (result.kind !== "different_subject") return;
    expect(result.reasons.join(" ")).toContain("推定しません");
  });

  it("取水と消費水を同一視しない", () => {
    const withdrawal = makeComparisonSubject({ flow: { kind: "water", waterSource: "surface", waterUse: "withdrawal" } });
    const consumption = makeComparisonSubject();
    expect(compareSubjects(withdrawal, consumption).kind).toBe("different_subject");
  });

  it("kg と t は換算後の数量が一致すれば same(換算を仮定として残す)", () => {
    const inKg = makeComparisonSubject({
      category: "waste",
      flow: { kind: "waste", wasteTypeCode: "w1", hazardous: false, treatmentRoute: "landfill", treatmentLocation: "offsite", weightBasis: "wet" },
      quantity: { value: 1000, unit: "kg", measurementBoundary: "site" },
    });
    const inTon = makeComparisonSubject({
      category: "waste",
      flow: { kind: "waste", wasteTypeCode: "w1", hazardous: false, treatmentRoute: "landfill", treatmentLocation: "offsite", weightBasis: "wet" },
      quantity: { value: 1, unit: "t", measurementBoundary: "site" },
    });
    const result = compareSubjects(inKg, inTon);
    expect(result.kind).toBe("same");
    if (result.kind !== "same") return;
    expect(result.assumptions.join(" ")).toContain("単位換算");
  });

  it("換算後も数量が一致しなければ different_subject にする", () => {
    const a = makeComparisonSubject({ quantity: { value: 45000, unit: "m3", measurementBoundary: "site" } });
    const b = makeComparisonSubject({ quantity: { value: 30000, unit: "m3", measurementBoundary: "site" } });
    expect(compareSubjects(a, b).kind).toBe("different_subject");
  });

  it("地域・期間・時間基準の違いを個別の理由として返す(年間フローと現在価値を自動換算しない)", () => {
    const base = makeComparisonSubject();
    expect(compareSubjects(base, makeComparisonSubject({ location: { siteId: "site-042", region: "US" } })).kind).toBe("different_subject");
    expect(compareSubjects(base, makeComparisonSubject({ period: { kind: "annual", year: 2026 } })).kind).toBe("different_subject");
    const npv = compareSubjects(base, makeComparisonSubject({ timeBasis: "present_value" }));
    expect(npv.kind).toBe("different_subject");
    if (npv.kind !== "different_subject") return;
    expect(npv.reasons.join(" ")).toContain("時間基準");
  });
});

describe("comparePathways(§5.2・§4-3)", () => {
  it("AoPが同じでも損害経路が違えば同一視しない(VFnutrition と VFdisease)", () => {
    const nutrition = pathway({ damagePathway: "agricultural_water_shortage_malnutrition" });
    const disease = pathway({ damagePathway: "waterborne_disease" });
    const result = comparePathways(nutrition, disease);
    expect(result.kind).toBe("different_pathway");
    if (result.kind !== "different_pathway") return;
    expect(result.differences.join(" ")).toContain("損害経路");
  });

  it("全階層が一致すれば same_pathway", () => {
    expect(comparePathways(pathway(), pathway()).kind).toBe("same_pathway");
  });

  it("特定できない階層があれば unmapped を返し、どちら側かを示す", () => {
    const result = comparePathways(pathway(), pathway({ midpoint: "unmapped" }));
    expect(result.kind).toBe("unmapped");
    if (result.kind !== "unmapped") return;
    expect(result.unmappedSide).toBe("B");
  });
});

describe("checkComparability(§6.1 の6段階)", () => {
  const traceA = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });
  const traceB = makeSyntheticTrace({ methodId: "synthetic-product-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });
  const recordA = makeValuationRecord({ methodId: "synthetic-product-a", centralValue: traceA.finalValue.value, trace: traceA });
  const recordB = makeValuationRecord({ methodId: "synthetic-product-b", centralValue: traceB.finalValue.value, trace: traceB });
  const subject = makeComparisonSubject();
  const base = { recordA, recordB, traceA, traceB, subjectA: subject, subjectB: subject, recipe: PRODUCT_FULL, allowTestOnly: true };

  it("全条件を満たせば ok と正規化ステップを返す", () => {
    const result = checkComparability(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.normalizationApplied.length).toBeGreaterThan(0);
  });

  it("1段階目:比較対象が違えば different_subject(以降の判定へ進まない)", () => {
    const result = checkComparability({ ...base, subjectB: makeComparisonSubject({ location: { siteId: "site-999", region: "JP" } }) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("different_subject");
  });

  it("2段階目:価値概念が違えば value_concept_mismatch", () => {
    const exchangeRecord = makeValuationRecord({
      methodId: "synthetic-product-a",
      centralValue: traceA.finalValue.value,
      trace: traceA,
      valueConcept: "exchange",
    });
    const result = checkComparability({ ...base, recordA: exchangeRecord });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("value_concept_mismatch");
  });

  it("3段階目:非有限値は non_finite、非ゼロ符号の不一致は sign_mismatch", () => {
    const infinite = { ...traceA, finalValue: { ...traceA.finalValue, value: Number.POSITIVE_INFINITY } };
    const infiniteResult = checkComparability({
      ...base,
      traceA: infinite,
      recordA: makeValuationRecord({ methodId: "synthetic-product-a", centralValue: 1, trace: infinite }),
    });
    expect(infiniteResult.ok).toBe(false);
    if (infiniteResult.ok) return;
    expect(infiniteResult.reason).toBe("non_finite");

    const negative = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: -1 });
    const negativeResult = checkComparability({
      ...base,
      traceA: negative,
      recordA: makeValuationRecord({ methodId: "synthetic-product-a", centralValue: negative.finalValue.value, trace: negative }),
    });
    expect(negativeResult.ok).toBe(false);
    if (negativeResult.ok) return;
    expect(negativeResult.reason).toBe("sign_mismatch");
  });

  it("4段階目:正規化後も通貨が揃わなければ normalization_mismatch", () => {
    const usd = makeSyntheticTrace({
      methodId: "synthetic-product-a",
      shape: "product",
      quantity: 1,
      alpha: 3,
      beta: 2,
      gamma: 1,
      currency: "USD",
    });
    const result = checkComparability({
      ...base,
      traceA: usd,
      recordA: makeValuationRecord({ methodId: "synthetic-product-a", centralValue: usd.finalValue.value, trace: usd }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("normalization_mismatch");
  });

  it("5段階目:レシピ未登録は recipe_missing、版不一致は recipe_version_unsupported", () => {
    const missing = checkComparability({ ...base, recipe: undefined });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.reason).toBe("recipe_missing");
    expect(missing.missingData.length).toBeGreaterThan(0);

    const newerVersion = checkComparability({
      ...base,
      recordA: makeValuationRecord({
        methodId: "synthetic-product-a",
        centralValue: traceA.finalValue.value,
        trace: traceA,
        methodVersion: "2.0.0",
      }),
    });
    expect(newerVersion.ok).toBe(false);
    if (newerVersion.ok) return;
    expect(newerVersion.reason).toBe("recipe_version_unsupported");
  });

  it("5段階目:レビュー状態が不足、または testOnly を許可していなければ recipe_not_registrable", () => {
    const draft = checkComparability({
      ...base,
      recipe: { ...PRODUCT_FULL, review: { ...PRODUCT_FULL.review, status: "draft" } },
    });
    expect(draft.ok).toBe(false);
    if (draft.ok) return;
    expect(draft.reason).toBe("recipe_not_registrable");

    const testOnlyBlocked = checkComparability({ ...base, allowTestOnly: false });
    expect(testOnlyBlocked.ok).toBe(false);
    if (testOnlyBlocked.ok) return;
    expect(testOnlyBlocked.reason).toBe("recipe_not_registrable");
  });

  it("6段階目:トレースが無ければ trace_insufficient(レシピ未登録と区別する)", () => {
    const noTrace = checkComparability({
      ...base,
      traceA: undefined,
      recipe: undefined,
      recordA: makeValuationRecord({ methodId: "synthetic-product-a", centralValue: 6 }),
    });
    expect(noTrace.ok).toBe(false);
    if (noTrace.ok) return;
    expect(noTrace.reason).toBe("trace_insufficient");
    expect(noTrace.missingData[0].item).toContain("トレース");
  });

  it("6段階目:値が0でゼロ意味が無ければ停止する(値からゼロ意味を推論しない)", () => {
    const zeroTrace = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 0, beta: 2, gamma: 1 });
    const result = checkComparability({
      ...base,
      traceA: zeroTrace,
      recordA: makeValuationRecord({ methodId: "synthetic-product-a", centralValue: 0, trace: zeroTrace }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("trace_insufficient");
    expect(result.missingData[0].item).toContain("ゼロ意味の出典");
  });

  it("6段階目:ゼロ意味が付いていれば 0 でも通過し、missing なら停止する", () => {
    const publishedZero = makeSyntheticTrace({
      methodId: "synthetic-product-a",
      shape: "product",
      quantity: 1,
      alpha: 0,
      beta: 2,
      gamma: 1,
      zeroMeaning: PUBLISHED_ZERO,
    });
    const ok = checkComparability({
      ...base,
      traceA: publishedZero,
      recordA: makeValuationRecord({ methodId: "synthetic-product-a", centralValue: 0, trace: publishedZero }),
    });
    expect(ok.ok).toBe(true);

    const missing = makeSyntheticTrace({
      methodId: "synthetic-product-a",
      shape: "product",
      quantity: 1,
      alpha: 0,
      beta: 2,
      gamma: 1,
      zeroMeaning: { ...PUBLISHED_ZERO, code: "missing" },
    });
    const stopped = checkComparability({
      ...base,
      traceA: missing,
      recordA: makeValuationRecord({ methodId: "synthetic-product-a", centralValue: 0, trace: missing }),
    });
    expect(stopped.ok).toBe(false);
    if (stopped.ok) return;
    expect(stopped.reason).toBe("trace_insufficient");
    expect(stopped.detail).toContain("missing");
  });

  it("6段階目:レシピの supports が false を返せばその理由コードへ写す", () => {
    const blocked = checkComparability({
      ...base,
      recipe: { ...PRODUCT_FULL, supports: () => ({ ok: false, reason: "license_blocked", detail: "商用表示不可" }) },
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe("license_blocked");
  });
});
