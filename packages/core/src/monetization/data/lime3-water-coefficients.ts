/**
 * LIME3(AIST-IDEA Ver.4.0)水消費(取水)係数の構成要素。完成実装 T-05。
 * 出典: docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv
 *       (基本フローコード 001511000 資源・表層水・水圏・取水 / 001515000 資源・地下水・水圏・取水)
 * 参照: docs/data/lime3-coefficients-notes.md §3.1〜3.2(選定根拠)・§5.1(元Excel全件照合・SHA-256)
 *
 * 2026-09-06(T-10a/T-11):`lib/data/lime3/water-coefficients.ts` から packages/core へ移した。
 * 分解エンジン側の診断(`divergence/diagnostics/*`)と実データ比較レシピのテストが、
 * lib(画面・デモ層)へ依存せずに4列すべてを参照できるようにするため(§2-1)。
 * 値・版・出典・ハッシュは移動前と同一で、再計算ハッシュに影響しない。
 * 旧パスは再エクスポートとして残す。
 *
 * `plugins/lime3-water.ts` が `MethodConfig.lime3WaterCoefficient` を通じて受け取り、
 * 物理量→人間健康DALY→US$統合化の2段トレースを、保存済み最終値ではなく公表列から
 * 復元できるようにする(T-05)。単一係数(`externalValueFactors["lime3-water"]`)と
 * `evaluate()`が返す`centralValue`の数値は変更しない。
 *
 * 水関連フローは「生産国」視点の列がすべて空欄のため「消費国」視点のみを持つ
 * (docs/data/lime3-coefficients-notes.md §3.2-1)。表層水/地下水・世界平均/日本の4通りを定数化する。
 */

import type { Availability } from "../../types/trace";
import type { EvidenceRef } from "../../types/comparison";
import type { Lime3WaterCoefficientComponents } from "../../types/valuation";

/** リリース日2026-05-15のAIST-IDEA Ver.4.0標準版。 */
const COEFFICIENT_SET_VERSION = "aist-idea-v4.0-lime3-2026-05-15";

/** docs/data/lime3-coefficients-notes.md §5.1で確認済みの抽出CSVのSHA-256(元Excel全980行と差分0)。 */
const CSV_SOURCE_HASH = "63e1744476fc33fb741e176bcea94f0e9dbd5c757a48e9aa620f70d22a959844";
const CSV_SOURCE_PATH = "docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv";

function csvEvidence(rowCode: string, column: string): EvidenceRef {
  return {
    source: CSV_SOURCE_PATH,
    locator: `row ${rowCode}, 列「${column}」`,
    version: "AIST-IDEA Ver.4.0 標準版(リリース日2026-05-15)",
    hash: CSV_SOURCE_HASH,
    tier: "primary",
    note: "docs/data/lime3-coefficients-notes.md §5.1(元Excel全980行との差分0行を確認済み)",
  };
}

/**
 * Yamasaki, Ikaga & Itsubo (2020) Table 2により、水消費の損害は100%人間健康に配分され、
 * 社会資産・生物多様性・一次生産への配分はゼロ(CSVでも該当列が空欄)であることを確認済み。
 * 値を0として扱わず、"not_applicable"(概念が適用されない)として明示する(§5.6)。
 */
const OTHER_ENDPOINT_NOT_APPLICABLE: Availability = {
  status: "not_applicable",
  reason:
    "Yamasaki, Ikaga & Itsubo (2020) Table 2(42カ国×影響カテゴリ×保護対象のクロス集計)により、" +
    "水消費(Water consumption)の損害は100%人間健康エンドポイントに配分され、社会資産・生物多様性・" +
    "一次生産への配分はゼロと確認済み(CSV該当列も空欄)。",
  evidence: [
    {
      source: "Yamasaki, Ikaga & Itsubo (2020)「国際対応型LCIA手法LIME3の枠組みに基づく世界42カ国の行政区域の年間環境影響評価」",
      locator: "Table 2",
      version: "doi:10.3130/aije.85.67",
      tier: "primary",
      note: "docs/data/aop-mapping-v1.md §2.1・docs/data/method-recalculability.md §3.3 経由で確認",
    },
  ],
};

function otherEndpoints(): Lime3WaterCoefficientComponents["otherEndpoints"] {
  return {
    socialAssets: OTHER_ENDPOINT_NOT_APPLICABLE,
    biodiversity: OTHER_ENDPOINT_NOT_APPLICABLE,
    primaryProduction: OTHER_ENDPOINT_NOT_APPLICABLE,
  };
}

const DALY_WORLD_AVERAGE_COLUMN = "利子率2%、消費国、世界平均 / 人間健康 / DALY";
const DALY_JAPAN_COLUMN = "利子率2%、消費国、日本 / 人間健康 / DALY";
const USD_WORLD_AVERAGE_COLUMN = "利子率2%、消費国、世界平均 / 統合化 / US$";
const USD_JAPAN_COLUMN = "利子率2%、消費国、日本 / 統合化 / US$";

function buildComponents(params: {
  sourceFlowId: "001511000" | "001515000";
  sourceFlowName: string;
  waterSource: "surface" | "ground";
  perspective: "consumption_world_average" | "consumption_japan";
  humanHealthDalyPerM3: number;
  integratedUsdPerM3: number;
  dalyColumn: string;
  usdColumn: string;
}): Lime3WaterCoefficientComponents {
  return {
    sourceFlowId: params.sourceFlowId,
    sourceFlowName: params.sourceFlowName,
    waterSource: params.waterSource,
    perspective: params.perspective,
    interestRate: 0.02,
    humanHealthDalyPerM3: params.humanHealthDalyPerM3,
    integratedUsdPerM3: params.integratedUsdPerM3,
    // 検算値(docs/data/lime3-coefficients-notes.md §3.2・directive §7.2.1):
    // 統合化US$/m³ ÷ 人間健康DALY/m³。4通りすべてで有効数字8桁 23,696.265 US$/DALYに一致(T-05)。
    integrationUsdPerDaly: params.integratedUsdPerM3 / params.humanHealthDalyPerM3,
    otherEndpoints: otherEndpoints(),
    // ファイル内に価格基準年の明記を発見できなかった(lime3-coefficients-notes.md §3.2-4)。推定で埋めない(D-15)。
    priceYear: null,
    currency: "USD",
    coefficientSetVersion: COEFFICIENT_SET_VERSION,
    evidence: [csvEvidence(params.sourceFlowId, params.dalyColumn), csvEvidence(params.sourceFlowId, params.usdColumn)],
  };
}

/** 表層水・世界平均(消費国視点)。 */
export const LIME3_WATER_SURFACE_CONSUMPTION_WORLD_AVERAGE: Lime3WaterCoefficientComponents = buildComponents({
  sourceFlowId: "001511000",
  sourceFlowName: "資源, 表層水, 水圏, 取水",
  waterSource: "surface",
  perspective: "consumption_world_average",
  humanHealthDalyPerM3: 1.47160489e-6,
  integratedUsdPerM3: 0.0348715398,
  dalyColumn: DALY_WORLD_AVERAGE_COLUMN,
  usdColumn: USD_WORLD_AVERAGE_COLUMN,
});

/**
 * 表層水・日本(消費国視点)。`lime3-water.ts`の単一係数
 * (`externalValueFactors["lime3-water"]`)と同じ値(0.0135886259)。
 */
export const LIME3_WATER_SURFACE_CONSUMPTION_JAPAN: Lime3WaterCoefficientComponents = buildComponents({
  sourceFlowId: "001511000",
  sourceFlowName: "資源, 表層水, 水圏, 取水",
  waterSource: "surface",
  perspective: "consumption_japan",
  humanHealthDalyPerM3: 5.73450112e-7,
  integratedUsdPerM3: 0.0135886259,
  dalyColumn: DALY_JAPAN_COLUMN,
  usdColumn: USD_JAPAN_COLUMN,
});

/** 地下水・世界平均(消費国視点)。 */
export const LIME3_WATER_GROUND_CONSUMPTION_WORLD_AVERAGE: Lime3WaterCoefficientComponents = buildComponents({
  sourceFlowId: "001515000",
  sourceFlowName: "資源, 地下水, 水圏, 取水",
  waterSource: "ground",
  perspective: "consumption_world_average",
  humanHealthDalyPerM3: 3.80164597e-6,
  integratedUsdPerM3: 0.0900848111,
  dalyColumn: DALY_WORLD_AVERAGE_COLUMN,
  usdColumn: USD_WORLD_AVERAGE_COLUMN,
});

/** 地下水・日本(消費国視点)。表層水・日本の約2.5833倍(docs/data/acquisition-runbook.md §7.2.1)。 */
export const LIME3_WATER_GROUND_CONSUMPTION_JAPAN: Lime3WaterCoefficientComponents = buildComponents({
  sourceFlowId: "001515000",
  sourceFlowName: "資源, 地下水, 水圏, 取水",
  waterSource: "ground",
  perspective: "consumption_japan",
  humanHealthDalyPerM3: 1.48141279e-6,
  integratedUsdPerM3: 0.0351039504,
  dalyColumn: DALY_JAPAN_COLUMN,
  usdColumn: USD_JAPAN_COLUMN,
});
