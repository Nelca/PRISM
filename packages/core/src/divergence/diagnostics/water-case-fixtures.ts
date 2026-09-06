/**
 * M4完成 T-10a/T-11:水既定ケースの診断用フィクスチャ。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §7.2.1・T-10a・T-11
 *
 * `lib/demo/company.ts` の `DEEP_DIVE_*` と同じ実値を packages/core だけで再現する。
 * 係数は一次資料由来(AIST-IDEA Ver.4.0 / IFVI Appendix D Table D1 / World Bank ICP)であり、
 * **物理量 45,000 m³ と代替調達単価 620 円/m³ はデモ既定値(実測値ではない)** である。
 * この区別は診断結果の `provenance` にそのまま残し、状態B(実データ実証)の件数へ算入しない。
 */

import type { ComparisonSubject } from "../../types/comparison";
import type {
  GeographicCalibrationRecord,
  IfviWaterValueFactorSource,
  Lime3WaterCoefficientComponents,
  MethodConfig,
  PhysicalQuantityInput,
  ValuationRecord,
} from "../../types/valuation";
import { buildValuationRecords } from "../../monetization/build-valuation-records";
import { getPluginsForCategory } from "../../monetization/registry";
import { createSeededRng } from "../../monetization/rng";
import {
  LIME3_WATER_GROUND_CONSUMPTION_JAPAN,
  LIME3_WATER_GROUND_CONSUMPTION_WORLD_AVERAGE,
  LIME3_WATER_SURFACE_CONSUMPTION_JAPAN,
  LIME3_WATER_SURFACE_CONSUMPTION_WORLD_AVERAGE,
} from "../../monetization/data/lime3-water-coefficients";
import { buildComparisonSubject } from "../subject";
import { WATER_CASE_VERSIONS } from "./baseline-water-case";

export const WATER_PHYSICAL_QUANTITY_ID = "pq-site042-water-2027";

/** lib/demo/company.ts DEEP_DIVE_INPUT と同値。物理量はデモ既定値(実測値ではない)。 */
export const BASELINE_INPUT: PhysicalQuantityInput = {
  category: "water",
  physicalQuantity: 45_000,
  unit: "m3",
  siteId: "site-042",
  sourceRegion: "JP",
  targetRegion: "JP",
};

/** lib/demo/company.ts DEEP_DIVE_CALIBRATION と同値(PPP 94.46 円/国際ドル、World Bank ICP 2024)。 */
export const BASELINE_CALIBRATION: Omit<GeographicCalibrationRecord, "sourceRegion" | "targetRegion"> = {
  pppSource: "世界銀行ICP 2024年版(PA.NUS.PPP、docs/data/calibration-parameters-v1.md §1)",
  pppValue: 94.46,
  incomeElasticity: 0.7,
  sourceIncomeLevel: 100,
  targetIncomeLevel: 100,
  deflator: 1.0,
  relativePriceEscalationRate: 1.0,
  elapsedYears: 0,
  areaScaling: 1.0,
};

/** lib/demo/company.ts DEEP_DIVE_IFVI_WATER_VALUE_FACTOR_SOURCE と同値(ゼロ意味の出典)。 */
export const IFVI_WATER_VALUE_FACTOR_SOURCE: IfviWaterValueFactorSource = {
  country: "JP",
  table: "Appendix D Table D1",
  perspective: "global",
  priceYear: 2024,
  currency: "USD",
  coefficientSetVersion: "ifvi-water-consumption-2026-03-final:jp-table-d1-v1",
  nationalBiodiversityPressure: 3.59,
  nationalWaterStress: 1.97,
  evidence: [
    {
      source: "IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf(最終承認版)",
      locator: "Appendix D Table D1、日本(Japan)の行",
      version: "2026年3月",
      tier: "primary",
      note: "docs/data/acquisition-runbook.md §3.4で取得・確認済み(取得日2026-08-10)",
    },
  ],
};

/**
 * LIME3 の採用列を差し替えた `MethodConfig` を作る。単一係数
 * (`externalValueFactors["lime3-water"]`)と構成要素(`lime3WaterCoefficient`)は必ず同じ列から取る
 * (食い違うとトレース評価器が `expectedOutput` 検証で例外にする)。
 */
export function buildWaterConfig(coefficient: Lime3WaterCoefficientComponents): MethodConfig {
  return {
    depth: "deep_dive",
    unitReplacementCost: 620,
    externalValueFactors: {
      "lime3-water": coefficient.integratedUsdPerM3,
      "ifvi-vfnutrition": 0.0,
      "ifvi-vfdisease": 0.0,
      "ifvi-vfes": 2.97,
      "ifvi-vfaccess": 0.0,
    },
    lime3WaterCoefficient: coefficient,
    ifviWaterValueFactorSource: IFVI_WATER_VALUE_FACTOR_SOURCE,
    vfesFitnessDimensions: {
      ecologicalFit: 0.75,
      socioeconomicFit: 0.68,
      serviceDefinitionFit: 0.85,
      temporalDistance: 0.6,
      spatialScaleFit: 0.7,
    },
  };
}

/** lib/demo/company.ts DEEP_DIVE_CONFIG と同値(表層水・消費国=日本)。 */
export const BASELINE_CONFIG: MethodConfig = buildWaterConfig(LIME3_WATER_SURFACE_CONSUMPTION_JAPAN);

export function buildWaterRecords(config: MethodConfig = BASELINE_CONFIG): ValuationRecord[] {
  return buildValuationRecords({
    physicalQuantityId: WATER_PHYSICAL_QUANTITY_ID,
    input: BASELINE_INPUT,
    config,
    calibration: BASELINE_CALIBRATION,
    plugins: getPluginsForCategory("water"),
    versions: WATER_CASE_VERSIONS.valuation,
    rng: createSeededRng(42),
  }).flatMap((group) => group.records);
}

/** LIME3 の1本だけを、指定した採用列で組み立てる(同一手法の内部変種の比較に使う)。 */
export function buildLime3Record(coefficient: Lime3WaterCoefficientComponents): ValuationRecord {
  const record = buildWaterRecords(buildWaterConfig(coefficient)).find((candidate) => candidate.methodId === "lime3-water");
  if (!record) throw new Error("LIME3 水のレコードが生成されませんでした。");
  return { ...record, id: `vr-lime3-${coefficient.sourceFlowId}-${coefficient.perspective}` };
}

export const LIME3_SURFACE_JAPAN = LIME3_WATER_SURFACE_CONSUMPTION_JAPAN;
export const LIME3_SURFACE_WORLD_AVERAGE = LIME3_WATER_SURFACE_CONSUMPTION_WORLD_AVERAGE;
export const LIME3_GROUND_JAPAN = LIME3_WATER_GROUND_CONSUMPTION_JAPAN;
export const LIME3_GROUND_WORLD_AVERAGE = LIME3_WATER_GROUND_CONSUMPTION_WORLD_AVERAGE;

/** デモ既定値の比較対象。水源種別は拠点データに無いため "unknown"(推定しない)。 */
export function buildWaterSubject(): ComparisonSubject {
  return buildComparisonSubject({
    input: BASELINE_INPUT,
    physicalQuantityId: WATER_PHYSICAL_QUANTITY_ID,
    provenance: "demo_default",
  });
}

/**
 * 水源種別が判明している場合の比較対象(T-03 の負例に使う)。
 * 実際の拠点データには水源種別が無い。表層水/地下水の別が**分かっている**という仮定を明示するための
 * 診断専用のフィクスチャであり、本番の取込経路がこの値を作ることはない。
 */
export function buildWaterSubjectWithSource(waterSource: "surface" | "ground"): ComparisonSubject {
  const base = buildWaterSubject();
  if (base.flow.kind !== "water") throw new Error("水の比較対象ではありません。");
  return {
    ...base,
    id: `${base.id}:${waterSource}`,
    flow: { ...base.flow, waterSource },
    sourceHash: `${base.sourceHash}:${waterSource}(診断用の仮定)`,
  };
}
