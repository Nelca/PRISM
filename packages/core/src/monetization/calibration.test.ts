import { describe, expect, it } from "vitest";
import { applyGeographicCalibration } from "./calibration";
import type { GeographicCalibrationRecord } from "../types/valuation";

describe("applyGeographicCalibration", () => {
  it("M3要件定義書§3.3の数値例を再現する(500円/m³ → 約755円/m³)", () => {
    const calibration: GeographicCalibrationRecord = {
      pppSource: "世界銀行ICP 2024年版",
      pppValue: 1.15,
      incomeElasticity: 0.7,
      sourceIncomeLevel: 100,
      targetIncomeLevel: 130,
      sourceRegion: "EU",
      targetRegion: "JP",
      deflator: 1.03,
      relativePriceEscalationRate: 1.02,
      elapsedYears: 3,
      areaScaling: 1.0,
    };

    const result = applyGeographicCalibration(500, calibration);

    expect(result).toBeCloseTo(755, 0);
  });

  it("すべての係数が1の場合は値を変えない", () => {
    const identity: GeographicCalibrationRecord = {
      pppSource: "test",
      pppValue: 1,
      incomeElasticity: 0.7,
      sourceIncomeLevel: 100,
      targetIncomeLevel: 100,
      sourceRegion: "JP",
      targetRegion: "JP",
      deflator: 1,
      relativePriceEscalationRate: 1,
      elapsedYears: 0,
      areaScaling: 1,
    };

    expect(applyGeographicCalibration(1000, identity)).toBeCloseTo(1000, 6);
  });
});
