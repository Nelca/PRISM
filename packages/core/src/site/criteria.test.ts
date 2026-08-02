import { describe, expect, it } from "vitest";
import { evaluateCriteriaMet } from "./criteria";
import { computeSensitivityScore } from "../types/site";
import type { NatureInterface } from "../types/site";

function iface(overrides: Partial<NatureInterface> & Pick<NatureInterface, "layerType" | "rawResult">): NatureInterface {
  return {
    id: `ni-${overrides.layerType}`,
    siteId: "site-042",
    dataSource: "test",
    licenseMode: "reference_only",
    ...overrides,
  };
}

describe("evaluateCriteriaMet", () => {
  it("protected_area・kbaはどちらもhighBiodiversityImportanceにOR集約される", () => {
    const criteria = evaluateCriteriaMet([iface({ layerType: "kba", rawResult: true })]);
    expect(criteria.highBiodiversityImportance).toBe(true);

    const criteria2 = evaluateCriteriaMet([iface({ layerType: "protected_area", rawResult: true })]);
    expect(criteria2.highBiodiversityImportance).toBe(true);
  });

  it("water_stressはwaterStressに、dependency_impactはlikelySignificantDependencyImpactに対応する", () => {
    const criteria = evaluateCriteriaMet([
      iface({ layerType: "water_stress", rawResult: true }),
      iface({ layerType: "dependency_impact", rawResult: true }),
    ]);
    expect(criteria.waterStress).toBe(true);
    expect(criteria.likelySignificantDependencyImpact).toBe(true);
  });

  it("数値のrawResultは0より大きければ基準を満たすとみなす", () => {
    const criteria = evaluateCriteriaMet([iface({ layerType: "water_stress", rawResult: 4.2 })]);
    expect(criteria.waterStress).toBe(true);

    const criteria2 = evaluateCriteriaMet([iface({ layerType: "water_stress", rawResult: 0 })]);
    expect(criteria2.waterStress).toBe(false);
  });

  it("ecosystem_integrityは既定でhighEcosystemIntegrityのみに対応し、rapidIntegrityDeclineは常にfalse", () => {
    const criteria = evaluateCriteriaMet([iface({ layerType: "ecosystem_integrity", rawResult: true })]);
    expect(criteria.highEcosystemIntegrity).toBe(true);
    expect(criteria.rapidIntegrityDecline).toBe(false);
  });

  it("resolveCriterionを差し替えることでrapidIntegrityDeclineを導出できる", () => {
    const interfaces = [
      iface({ layerType: "ecosystem_integrity", dataSource: "Forest Landscape Integrity Index", rawResult: true }),
      iface({ layerType: "ecosystem_integrity", dataSource: "Global Forest Watch 減少率", rawResult: true }),
    ];

    const criteria = evaluateCriteriaMet(interfaces, (i) =>
      i.dataSource === "Global Forest Watch 減少率" ? "rapidIntegrityDecline" : "highEcosystemIntegrity"
    );

    expect(criteria.highEcosystemIntegrity).toBe(true);
    expect(criteria.rapidIntegrityDecline).toBe(true);
  });

  it("該当するNatureInterfaceがない基準はfalseのまま", () => {
    const criteria = evaluateCriteriaMet([]);
    expect(Object.values(criteria).every((v) => v === false)).toBe(true);
  });

  it("要件定義書§2の具体例(化学工場・水ストレス地域)を再現する:sensitivityScore=3", () => {
    const interfaces = [
      iface({ layerType: "kba", dataSource: "IBAT", rawResult: true }),
      iface({ layerType: "water_stress", dataSource: "Aqueduct", rawResult: true }),
      iface({ layerType: "dependency_impact", dataSource: "ENCORE", rawResult: true }),
    ];

    const criteria = evaluateCriteriaMet(interfaces);
    expect(criteria).toEqual({
      highEcosystemIntegrity: false,
      rapidIntegrityDecline: false,
      highBiodiversityImportance: true,
      waterStress: true,
      likelySignificantDependencyImpact: true,
    });
    expect(computeSensitivityScore(criteria)).toBe(3);
  });
});
