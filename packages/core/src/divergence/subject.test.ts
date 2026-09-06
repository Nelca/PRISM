/**
 * T-13.2:`PhysicalQuantityInput` から比較対象を構築する。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.1・T-13
 */
import { describe, expect, it } from "vitest";
import { buildComparisonSubject } from "./subject";
import { compareSubjects, SUBJECT_IDENTITY_RULE_VERSION } from "./comparability";
import type { PhysicalQuantityInput } from "../types/valuation";

const water: PhysicalQuantityInput = {
  category: "water",
  physicalQuantity: 45_000,
  unit: "m3",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
};

describe("buildComparisonSubject", () => {
  it("水:水源種別は拠点データに無いため unknown、使用形態は取水(推定で埋めない)", () => {
    const subject = buildComparisonSubject({ input: water, physicalQuantityId: "pq-1", provenance: "demo_default" });
    expect(subject.flow).toEqual({ kind: "water", waterSource: "unknown", waterUse: "withdrawal" });
    expect(subject.id).toBe("subject:pq-1");
    expect(subject.quantity).toEqual({ value: 45_000, unit: "m3", measurementBoundary: "site" });
    expect(subject.location).toEqual({ siteId: "site-042", region: "JP" });
    // 入力型が年を持たないため、年は推定せず null にする。
    expect(subject.period).toEqual({ kind: "annual", year: null });
    expect(subject.timeBasis).toBe("annual");
    expect(subject.identityRuleVersion).toBe(SUBJECT_IDENTITY_RULE_VERSION);
    expect(subject.provenance).toBe("demo_default");
    expect(subject.sourceRecordIds).toEqual([]);
    expect(subject.sourceHash.startsWith("subject:")).toBe(true);
  });

  it("同じ入力からは同じ比較対象(同一性ハッシュ含む)ができ、同一と判定される", () => {
    const a = buildComparisonSubject({ input: water, physicalQuantityId: "pq-1", provenance: "demo_default" });
    const b = buildComparisonSubject({ input: water, physicalQuantityId: "pq-1", provenance: "demo_default" });
    expect(a.sourceHash).toBe(b.sourceHash);
    expect(compareSubjects(a, b).kind).toBe("same");
  });

  it("量が変われば同一性ハッシュも変わり、different_subject になる", () => {
    const a = buildComparisonSubject({ input: water, physicalQuantityId: "pq-1", provenance: "demo_default" });
    const b = buildComparisonSubject({
      input: { ...water, physicalQuantity: 46_000 },
      physicalQuantityId: "pq-1",
      provenance: "demo_default",
    });
    expect(a.sourceHash).not.toBe(b.sourceHash);
    expect(compareSubjects(a, b).kind).toBe("different_subject");
  });

  it("汚染:排出と移動を区別し、元レコードIDと報告年を引き継ぐ", () => {
    const input: PhysicalQuantityInput = {
      category: "pollution",
      physicalQuantity: 120,
      unit: "kg",
      siteId: "site-042",
      sourceRegion: "JP",
      targetRegion: "JP",
      reportingYear: 2025,
      prtrListVersion: "2025",
      facilityId: "f-1",
      prtrSubstanceCode: "001",
      casRns: ["71-43-2"],
      releaseMedium: "offsite_waste",
      sourceKind: "customer_prtr",
      sourceRecordId: "row-1",
      sourceRecordHash: "hash-1",
    };
    const subject = buildComparisonSubject({ input, physicalQuantityId: "pq-2", provenance: "customer_provided" });
    expect(subject.flow).toEqual({
      kind: "pollution",
      substanceCode: "001",
      casRns: ["71-43-2"],
      releaseMedium: "offsite_waste",
      releaseKind: "transfer",
    });
    expect(subject.period).toEqual({ kind: "annual", year: 2025 });
    expect(subject.sourceRecordIds).toEqual(["row-1"]);
    expect(subject.provenance).toBe("customer_provided");
  });

  it("廃棄物:処理経路・場所・重量基準・有害区分をそのまま持つ", () => {
    const input: PhysicalQuantityInput = {
      category: "waste",
      physicalQuantity: 3_000,
      unit: "kg",
      siteId: "site-042",
      sourceRegion: "JP",
      targetRegion: "JP",
      reportingPeriod: "2026-04/2027-03",
      wasteTypeCode: "w-01",
      hazardous: true,
      treatmentRoute: "incineration",
      treatmentLocation: "offsite",
      weightBasis: "wet",
      sourceRecordId: "waste-row-1",
      sourceRecordHash: "hash-2",
    };
    const subject = buildComparisonSubject({ input, physicalQuantityId: "pq-3", provenance: "customer_provided" });
    expect(subject.flow).toEqual({
      kind: "waste",
      wasteTypeCode: "w-01",
      hazardous: true,
      treatmentRoute: "incineration",
      treatmentLocation: "offsite",
      weightBasis: "wet",
    });
    expect(subject.period).toEqual({ kind: "reference_date", date: "2026-04/2027-03" });
  });

  it("土地利用:転換と占有で属性が変わる", () => {
    const conversion = buildComparisonSubject({
      input: {
        category: "land_use",
        activityKind: "conversion",
        physicalQuantity: 1_000,
        unit: "m2",
        siteId: "site-042",
        sourceRegion: "JP",
        targetRegion: "JP",
        projectId: "p-1",
        landClassBefore: "forest",
        landClassAfter: "industrial",
        sourceRecordId: "land-1",
        sourceRecordHash: "hash-3",
      },
      physicalQuantityId: "pq-4",
      provenance: "customer_provided",
    });
    expect(conversion.flow).toEqual({
      kind: "land_use",
      activityKind: "conversion",
      landClassBefore: "forest",
      landClassAfter: "industrial",
    });

    const occupation = buildComparisonSubject({
      input: {
        category: "land_use",
        activityKind: "occupation",
        physicalQuantity: 1_000,
        unit: "m2year",
        siteId: "site-042",
        sourceRegion: "JP",
        targetRegion: "JP",
        projectId: "p-1",
        landClass: "industrial",
        sourceRecordId: "land-2",
        sourceRecordHash: "hash-4",
      },
      physicalQuantityId: "pq-5",
      provenance: "customer_provided",
    });
    expect(occupation.flow).toEqual({ kind: "land_use", activityKind: "occupation", landClass: "industrial" });
  });

  it("気候:tCO2e 基準として持つ", () => {
    const subject = buildComparisonSubject({
      input: {
        category: "climate",
        physicalQuantity: 8_000,
        unit: "tCO2e",
        siteId: "site-070",
        sourceRegion: "JP",
        targetRegion: "JP",
      },
      physicalQuantityId: "pq-6",
      provenance: "demo_default",
    });
    expect(subject.flow).toEqual({ kind: "climate", gasBasis: "tCO2e" });
  });
});
