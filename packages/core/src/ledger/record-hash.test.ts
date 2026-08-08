/**
 * レコード単位の再計算ハッシュ(GAP-06)の検証。
 *
 * build-plan §4.2「すべてのレコードに再計算ハッシュのフィールドを持たせる」の完了条件は
 * 「任意のレコード1件のハッシュから、生成に使われた全パラメータ版が特定でき、
 *  同じ入力で再実行すると同じハッシュになる」こと。ここではその不変条件を固定する。
 */

import { describe, expect, it } from "vitest";
import { buildValuationRecords } from "../monetization/build-valuation-records";
import type { ValuationRecordVersions } from "../monetization/build-valuation-records";
import { replacementCostPlugin } from "../monetization/plugins/replacement-cost";
import { buildDivergenceDecomposition } from "../divergence/build-divergence-decomposition";
import { buildDecisionRecord } from "../decision/build-decision-record";
import { createSeededRng } from "../monetization/rng";
import {
  IDENTITY_CALIBRATION,
  TEST_DECISION_VERSIONS,
  TEST_DECOMPOSITION_VERSIONS,
  TEST_VALUATION_VERSIONS,
  makeValuationRecord,
} from "../divergence/test-helpers";
import { exchangeAmount } from "../types/common";
import type { MethodConfig, PhysicalQuantityInput } from "../types/valuation";
import type { BaselineNpvInput } from "../types/financial-bridge";

const input: PhysicalQuantityInput = {
  category: "water",
  physicalQuantity: 1,
  unit: "m3",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
};
const config: MethodConfig = { depth: "screening", unitReplacementCost: 500 };

function buildRecords(versions: ValuationRecordVersions = TEST_VALUATION_VERSIONS) {
  return buildValuationRecords({
    physicalQuantityId: "pq-1",
    input,
    config,
    calibration: IDENTITY_CALIBRATION,
    plugins: [replacementCostPlugin],
    versions,
    rng: createSeededRng(1),
  });
}

describe("ValuationRecord の再計算ハッシュ", () => {
  it("同じ入力・同じ版なら同じハッシュになる", () => {
    expect(buildRecords()[0].records[0].recalculationHash).toBe(buildRecords()[0].records[0].recalculationHash);
  });

  it("係数セットの版が変われば別のハッシュになる", () => {
    const changed = buildRecords({ ...TEST_VALUATION_VERSIONS, calibrationSetVersion: "test-calibration-v2" });
    expect(changed[0].records[0].recalculationHash).not.toBe(buildRecords()[0].records[0].recalculationHash);
  });

  it("適合度ティア閾値・AoP対応表の版が変わってもハッシュが変わる", () => {
    const tierChanged = buildRecords({ ...TEST_VALUATION_VERSIONS, fitnessTierThresholdVersion: "v2" });
    const aopChanged = buildRecords({ ...TEST_VALUATION_VERSIONS, aopMappingVersion: "v2" });
    const base = buildRecords()[0].records[0].recalculationHash;

    expect(tierChanged[0].records[0].recalculationHash).not.toBe(base);
    expect(aopChanged[0].records[0].recalculationHash).not.toBe(base);
  });

  it("版は同じでも較正パラメータの実値が変われば別のハッシュになる", () => {
    // 版番号だけをハッシュに入れると、同じ版のまま値が差し替わったことを検出できず、
    // 監査で「同じ条件で計算した」と誤って読める。
    const changed = buildValuationRecords({
      physicalQuantityId: "pq-1",
      input,
      config,
      calibration: { ...IDENTITY_CALIBRATION, incomeElasticity: 0.587 },
      plugins: [replacementCostPlugin],
      versions: TEST_VALUATION_VERSIONS,
      rng: createSeededRng(1),
    });
    expect(changed[0].records[0].recalculationHash).not.toBe(buildRecords()[0].records[0].recalculationHash);
  });

  it("乱数シードが変わってもハッシュは変わらない(シードは版ではない)", () => {
    const other = buildValuationRecords({
      physicalQuantityId: "pq-1",
      input,
      config,
      calibration: IDENTITY_CALIBRATION,
      plugins: [replacementCostPlugin],
      versions: TEST_VALUATION_VERSIONS,
      rng: createSeededRng(999),
    });
    // 分位点は変わるが、パラメータ版は同一なのでハッシュは一致する(M8 D-2の定義に従う)
    expect(other[0].records[0].quantileRange).not.toEqual(buildRecords()[0].records[0].quantileRange);
    expect(other[0].records[0].recalculationHash).toBe(buildRecords()[0].records[0].recalculationHash);
  });

  it("プレースホルダーではない(GAP-06の解消)", () => {
    expect(buildRecords()[0].records[0].recalculationHash).not.toMatch(/^placeholder:/);
  });
});

describe("上流レコードの変化が下流のハッシュに伝播する", () => {
  const recordA = makeValuationRecord({ methodId: "m-a", centralValue: 100, valueConcept: "welfare" });
  const recordB = makeValuationRecord({ methodId: "m-b", centralValue: 300, valueConcept: "welfare" });

  function decompose(records: typeof recordA[]) {
    return buildDivergenceDecomposition({
      id: "dd-1",
      targetPhysicalQuantityId: "pq-1",
      siteId: "site-042",
      records,
      versions: TEST_DECOMPOSITION_VERSIONS,
    });
  }

  it("DivergenceDecomposition:入力ValuationRecordのハッシュが変われば分解のハッシュも変わる", () => {
    const base = decompose([recordA, recordB]).recalculationHash;
    const upstreamChanged = decompose([{ ...recordA, recalculationHash: "vr:changed" }, recordB]);

    expect(upstreamChanged.recalculationHash).not.toBe(base);
    expect(decompose([recordA, recordB]).recalculationHash).toBe(base);
  });

  it("DivergenceDecomposition:分解アルゴリズムの版が変われば別のハッシュになる", () => {
    const changed = buildDivergenceDecomposition({
      id: "dd-1",
      targetPhysicalQuantityId: "pq-1",
      siteId: "site-042",
      records: [recordA, recordB],
      versions: { ...TEST_DECOMPOSITION_VERSIONS, algorithmVersion: "shapley-v2" },
    });
    expect(changed.recalculationHash).not.toBe(decompose([recordA, recordB]).recalculationHash);
  });

  it("DecisionRecord:根拠にしたValuationRecordが差し替わればハッシュが変わる", () => {
    const exchangeRecord = makeValuationRecord({ methodId: "replacement-cost", centralValue: 1000, valueConcept: "exchange" });
    const baselineNpv: BaselineNpvInput = { value: 5_000_000, discountRate: 0.05, horizon: 10, source: "manual_entry" };

    const options = {
      id: "dr-1",
      decisionTarget: "investment_approval" as const,
      decisionMaker: "テスト",
      decisionDate: "2027-02-14",
      approvalThreshold: { value: exchangeAmount(3_000_000), source: "manual_entry" as const },
      relatedValuationRecords: [exchangeRecord],
      baselineNpv,
      countermeasures: [],
      valuationRecordsById: { [exchangeRecord.id]: exchangeRecord },
      bindingMechanism: { kind: "weak_reference" as const },
      versions: TEST_DECISION_VERSIONS,
    };

    const base = buildDecisionRecord(options).recalculationHash;
    const upstreamChanged = buildDecisionRecord({
      ...options,
      relatedValuationRecords: [{ ...exchangeRecord, recalculationHash: "vr:changed" }],
    });

    // ★判定の根拠が差し替わったのに判定だけ古いまま、という状態を検出できる
    expect(upstreamChanged.recalculationHash).not.toBe(base);
  });

  it("DecisionRecord:承認閾値が変わればハッシュが変わる", () => {
    const exchangeRecord = makeValuationRecord({ methodId: "replacement-cost", centralValue: 1000, valueConcept: "exchange" });
    const baselineNpv: BaselineNpvInput = { value: 5_000_000, discountRate: 0.05, horizon: 10, source: "manual_entry" };
    const options = {
      id: "dr-1",
      decisionTarget: "investment_approval" as const,
      decisionMaker: "テスト",
      decisionDate: "2027-02-14",
      approvalThreshold: { value: exchangeAmount(3_000_000), source: "manual_entry" as const },
      relatedValuationRecords: [exchangeRecord],
      baselineNpv,
      countermeasures: [],
      valuationRecordsById: { [exchangeRecord.id]: exchangeRecord },
      bindingMechanism: { kind: "weak_reference" as const },
      versions: TEST_DECISION_VERSIONS,
    };

    const changed = buildDecisionRecord({
      ...options,
      approvalThreshold: { value: exchangeAmount(9_000_000), source: "manual_entry" },
    });
    expect(changed.recalculationHash).not.toBe(buildDecisionRecord(options).recalculationHash);
  });
});
