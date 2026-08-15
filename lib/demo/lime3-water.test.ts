/**
 * LIME3(A-5)の実データ差し替え(docs/data/lime3-coefficients-notes.md)が
 * 正しくコードに反映されていることを検証する数値回帰テスト。
 * IFVI側の同種テスト(company.test.ts)と同じ構成。
 */
import { describe, expect, it } from "vitest";
import { applyGeographicCalibration } from "@core/monetization/calibration";
import { lime3WaterPlugin } from "@core/monetization/plugins/lime3-water";
import { DEEP_DIVE_CALIBRATION, DEEP_DIVE_CONFIG, DEEP_DIVE_INPUT } from "./company";

describe("LIME3:site-042の実データ回帰テスト", () => {
  const outputs = lime3WaterPlugin.evaluate(DEEP_DIVE_INPUT, DEEP_DIVE_CONFIG);
  const centralValue = outputs[0].centralValue;

  const calibration = {
    ...DEEP_DIVE_CALIBRATION,
    sourceRegion: DEEP_DIVE_INPUT.sourceRegion,
    targetRegion: DEEP_DIVE_INPUT.targetRegion,
  };

  it("較正前(米ドル、AIST-IDEA表層水・消費国=日本の統合化スコア × 45,000m3)", () => {
    expect(centralValue).toBeCloseTo(45_000 * 0.0135886259, 6); // ≈ 611.49
  });

  it("較正後(円。日本のPPP換算係数94.46円/国際ドルを適用):旧仮値のままではない", () => {
    const calibrated = applyGeographicCalibration(centralValue, calibration);

    // 旧仮値(28,500)のままなら 45,000 * 28,500 = 1,282,500,000 になってしまう、という回帰を防ぐ。
    expect(calibrated).not.toBeCloseTo(45_000 * 28_500, -3);
    expect(calibrated).toBeCloseTo(45_000 * 0.0135886259 * 94.46, 2);
  });
});
