/**
 * M8 D-3の完了条件「任意のレコードを旧版係数で再計算できる」(GAP-07)。
 */

import { describe, expect, it } from "vitest";
import { calibrationFactor, recalculateWithPriorParameters } from "./recalculate-with-prior-parameters";
import { IDENTITY_CALIBRATION, makeValuationRecord } from "../divergence/test-helpers";
import type { GeographicCalibrationRecord } from "../types/valuation";

/** PPPを1.15、所得比を上げた「現行」の較正。 */
const currentCalibration: GeographicCalibrationRecord = {
  ...IDENTITY_CALIBRATION,
  pppValue: 1.15,
  targetIncomeLevel: 130,
  sourceIncomeLevel: 100,
  deflator: 1.03,
};

/** 旧版:PPPも所得調整もない(恒等変換)。 */
const priorCalibration = IDENTITY_CALIBRATION;

const record = makeValuationRecord({
  methodId: "ifvi-water-consumption.VFes",
  centralValue: 1_000,
  valueConcept: "welfare",
  geographicCalibration: currentCalibration,
});

describe("旧版パラメータでの再計算", () => {
  it("較正前の値を復元し、旧版の較正倍率を掛け直す", () => {
    const result = recalculateWithPriorParameters(record, {
      methodId: record.methodId,
      methodVersion: record.methodVersion,
      geographicCalibration: priorCalibration,
    });

    expect(result.status).toBe("recalculated");
    // 旧版は恒等変換なので、再計算値 = 較正前の値 = 現在値 / 現行の較正倍率
    const expected = 1_000 / calibrationFactor(currentCalibration);
    expect(result.recalculatedValue).toBeCloseTo(expected, 6);
    // 現行の較正は値を押し上げているため、旧版で計算し直すと小さくなる
    expect(result.recalculatedValue!).toBeLessThan(1_000);
  });

  it("較正パラメータが同一なら「変わらない」と返す(無意味な再計算値を出さない)", () => {
    const result = recalculateWithPriorParameters(record, {
      methodId: record.methodId,
      methodVersion: record.methodVersion,
      geographicCalibration: currentCalibration,
    });

    expect(result.status).toBe("identical_parameters");
    expect(result.recalculatedValue).toBeUndefined();
  });

  it("手法の版が違う場合は再計算せず、理由を返す(係数値を保持していないため)", () => {
    const result = recalculateWithPriorParameters(record, {
      methodId: record.methodId,
      methodVersion: "0.9.0",
      geographicCalibration: priorCalibration,
    });

    expect(result.status).toBe("method_version_differs");
    expect(result.recalculatedValue).toBeUndefined();
    expect(result.reason).toContain("0.9.0");
  });

  it("現行の較正倍率が0なら較正前の値を復元できないため、推定せずuncomputableを返す", () => {
    const zeroCalibrated = makeValuationRecord({
      methodId: "m-zero",
      centralValue: 0,
      valueConcept: "welfare",
      geographicCalibration: { ...IDENTITY_CALIBRATION, areaScaling: 0 },
    });

    const result = recalculateWithPriorParameters(zeroCalibrated, {
      methodId: zeroCalibrated.methodId,
      methodVersion: zeroCalibrated.methodVersion,
      geographicCalibration: priorCalibration,
    });

    expect(result.status).toBe("uncomputable");
    expect(result.recalculatedValue).toBeUndefined();
  });

  it("再計算は往復で一致する(現行→旧版→現行で元の値に戻る)", () => {
    const toPrior = recalculateWithPriorParameters(record, {
      methodId: record.methodId,
      methodVersion: record.methodVersion,
      geographicCalibration: priorCalibration,
    });

    const priorRecord = makeValuationRecord({
      methodId: record.methodId,
      centralValue: toPrior.recalculatedValue!,
      valueConcept: "welfare",
      geographicCalibration: priorCalibration,
    });

    const backToCurrent = recalculateWithPriorParameters(priorRecord, {
      methodId: record.methodId,
      methodVersion: record.methodVersion,
      geographicCalibration: currentCalibration,
    });

    expect(backToCurrent.recalculatedValue).toBeCloseTo(1_000, 6);
  });
});
