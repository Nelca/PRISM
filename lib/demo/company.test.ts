/**
 * IFVI Water Consumption(A-4)の実データ差し替え(docs/data/acquisition-runbook.md §3.4)が
 * 正しくコードに反映されていることを検証する数値回帰テスト。
 *
 * 合成テストベクタ(packages/core/src/monetization/plugins/ifvi-water-consumption.test.ts)は
 * プラグインの自己整合性のみを検証しており、実際に投入したIFVI Table D1(日本)の値・
 * 45,000m3という具体的な物理量・実PPP換算係数が正しく組み合わさることは検証していない。
 * このテストはその欠落を埋める。
 */
import { describe, expect, it } from "vitest";
import { applyGeographicCalibration } from "@core/monetization/calibration";
import { ifviWaterConsumptionPlugin } from "@core/monetization/plugins/ifvi-water-consumption";
import { DEEP_DIVE_CALIBRATION, DEEP_DIVE_CONFIG, DEEP_DIVE_INPUT } from "./company";

describe("IFVI Water Consumption:site-042の実データ回帰テスト", () => {
  const outputs = ifviWaterConsumptionPlugin.evaluate(DEEP_DIVE_INPUT, DEEP_DIVE_CONFIG);
  const byId = new Map(outputs.map((o) => [o.subFactorId, o.centralValue]));

  const calibration = {
    ...DEEP_DIVE_CALIBRATION,
    sourceRegion: DEEP_DIVE_INPUT.sourceRegion,
    targetRegion: DEEP_DIVE_INPUT.targetRegion,
  };

  it("較正前(米ドル、IFVI Table D1 日本の値 × 45,000m3):3本は0、VFesのみ非ゼロ", () => {
    expect(byId.get("VFnutrition")).toBe(0);
    expect(byId.get("VFdisease")).toBe(0);
    expect(byId.get("VFes")).toBeCloseTo(45_000 * 2.97, 6); // = 133,650
    expect(byId.get("VFaccess")).toBe(0);
  });

  it("較正後(円。日本のPPP換算係数94.46円/国際ドルを適用):恒等変換(旧仮値)のままではない", () => {
    const esCentralValue = byId.get("VFes")!;
    const calibrated = applyGeographicCalibration(esCentralValue, calibration);

    // 恒等変換(pppValue=1.0)のままなら133,650になってしまう、という回帰を防ぐ。
    expect(calibrated).not.toBeCloseTo(133_650, 0);
    expect(calibrated).toBeCloseTo(133_650 * 94.46, 2); // ≈ 12,624,579円
  });

  it("IFVI公式集計式(Eq.2: VFaccess + MAX(VFnutrition, VFdisease, VFes))との整合性", () => {
    const reconstructed = ifviWaterConsumptionPlugin.reconciliation!.reconstruct(outputs);
    expect(reconstructed).toBeCloseTo(45_000 * 2.97, 6);
  });
});
