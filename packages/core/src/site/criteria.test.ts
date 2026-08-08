import { describe, expect, it } from "vitest";
import { assessCriteria, evaluateCriteriaMet } from "./criteria";
import { computeSensitivityScore, evaluatedCriteriaCount } from "../types/site";
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

describe("assessCriteria:ライセンス保留とデータソース不在の区別(GAP-08 / GAP-13)", () => {
  it("pending_reviewのデータソースは、rawResultがtrueでも充足扱いにしない(M8 D-4)", () => {
    const { criteriaMet, unevaluatedCriteria } = assessCriteria([
      iface({ layerType: "kba", dataSource: "IBAT", licenseMode: "pending_review", rawResult: true }),
    ]);

    expect(criteriaMet.highBiodiversityImportance).toBe(false);
    expect(computeSensitivityScore(criteriaMet)).toBe(0);
    expect(unevaluatedCriteria).toContainEqual({
      criterion: "highBiodiversityImportance",
      reason: "license_pending",
      dataSources: ["IBAT"],
    });
  });

  it("同じ基準を支えるレイヤが複数あり1つでも利用可能なら、その基準は評価する(保留レイヤの値は無視する)", () => {
    const { criteriaMet, unevaluatedCriteria } = assessCriteria([
      iface({ layerType: "kba", dataSource: "IBAT", licenseMode: "pending_review", rawResult: true }),
      iface({ layerType: "protected_area", dataSource: "自社調査", licenseMode: "embedded", rawResult: false }),
    ]);

    // 利用可能なレイヤ(自社調査=false)だけで判定する。保留中のIBAT(true)は使わない
    expect(criteriaMet.highBiodiversityImportance).toBe(false);
    expect(unevaluatedCriteria.map((c) => c.criterion)).not.toContain("highBiodiversityImportance");
  });

  it("対応するレイヤが1件もない基準は no_data_source として記録する(falseと評価不能を区別する)", () => {
    const { unevaluatedCriteria } = assessCriteria([
      iface({ layerType: "water_stress", dataSource: "Aqueduct", rawResult: true }),
    ]);

    const reasons = Object.fromEntries(unevaluatedCriteria.map((c) => [c.criterion, c.reason]));
    expect(reasons).toEqual({
      highEcosystemIntegrity: "no_data_source",
      rapidIntegrityDecline: "no_data_source",
      highBiodiversityImportance: "no_data_source",
      likelySignificantDependencyImpact: "no_data_source",
    });
  });

  it("感応度スコアの分母は5ではなく、評価できた基準の数になる", () => {
    const { criteriaMet, unevaluatedCriteria } = assessCriteria([
      iface({ layerType: "kba", dataSource: "IBAT", licenseMode: "pending_review", rawResult: true }),
      iface({ layerType: "water_stress", dataSource: "Aqueduct", rawResult: true }),
      iface({ layerType: "dependency_impact", dataSource: "ENCORE", rawResult: true }),
      iface({ layerType: "ecosystem_integrity", dataSource: "FLII", rawResult: false }),
    ]);

    // 2/3(水ストレス・依存影響が充足、生態系完全性は非充足)。
    // 生物多様性重要性はライセンス保留、急速な劣化はデータソース不在で、いずれも分母に入らない
    expect(computeSensitivityScore(criteriaMet)).toBe(2);
    expect(evaluatedCriteriaCount(criteriaMet, unevaluatedCriteria)).toBe(3);
  });

  it("evaluateCriteriaMetはassessCriteriaと同じ判定結果を返す(既存呼び出し元の互換性)", () => {
    const interfaces = [
      iface({ layerType: "kba", dataSource: "IBAT", licenseMode: "pending_review", rawResult: true }),
      iface({ layerType: "water_stress", dataSource: "Aqueduct", rawResult: true }),
    ];
    expect(evaluateCriteriaMet(interfaces)).toEqual(assessCriteria(interfaces).criteriaMet);
  });
});
