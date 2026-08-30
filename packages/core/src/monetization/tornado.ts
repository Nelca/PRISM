/**
 * M3:トルネード図(要因別の不確実性寄与のランキング)。
 * 参照元: docs/requirements/m3-monetization-engine.md(MVP範囲としてトルネード図を明記)
 *
 * 実装経緯(2026-08-02): M6の深掘り推奨(D-3)は「M3のトルネード図をそのまま流用する」設計
 * だったが、当初M3の実装(uncertainty.ts・fitness.ts)はMonte Carloで層i×層iiを合成した
 * quantileRangeを返すのみで、どちらの層がレンジを支配しているかを外部に公開していなかった。
 * これはM6の実装検討で発覧し、レビュー(ユーザー指摘)により「M6側で穴埋めするのではなく、
 * 本来M3が持つべき機能としてM3に実装する」方針に修正した。
 *
 * ValuationRecord単体の不確実性は層i(パラメータ不確実性)と層ii(移転誤差、tierが
 * "not_applicable"の場合は寄与ゼロ)の2つで完全に決まる(uncertainty.tsのcombineUncertainty
 * が採用する分布はこの2層のみ)。したがってこの2要因を対数正規sigmaの尺度で比較し、
 * 降順にランキングしたものが、1レコード分の最小限のトルネード図となる。
 */

import type { ValuationRecord } from "../types/valuation";
import { cvToLognormalSigma } from "./uncertainty";
import { errorBandCvForTier } from "./fitness";

export type TornadoFactor = "parameterUncertainty" | "transferFitness";

export interface TornadoChartEntry {
  factor: TornadoFactor;
  /** 対数正規分布のsigma(層i・層iiを同じ尺度で比較するための指標)。 */
  sigma: number;
  /** 読み下し用の日本語ラベル。 */
  label: string;
}

function layerISigma(record: ValuationRecord): number {
  if (record.parameterUncertainty.kind === "not_available") {
    throw new Error(`ValuationRecord ${record.id} は不確実性分布が未取得のためトルネード図を作成できません。`);
  }
  return record.parameterUncertainty.sigma;
}

function layerIISigma(record: ValuationRecord): number {
  return record.transferFitness.tier === "not_applicable"
    ? 0
    : cvToLognormalSigma(errorBandCvForTier(record.transferFitness.tier));
}

/**
 * 1件のValuationRecordについて、層i・層iiのsigmaを降順にランキングする。
 * 先頭要素がそのレコードのレンジを最も支配している要因。
 */
export function computeTornadoChart(record: ValuationRecord): TornadoChartEntry[] {
  const sigmaI = layerISigma(record);
  const sigmaII = layerIISigma(record);

  const entries: TornadoChartEntry[] = [
    {
      factor: "parameterUncertainty",
      sigma: sigmaI,
      label: `パラメータ不確実性(層i、sigma≈${sigmaI.toFixed(3)})`,
    },
    {
      factor: "transferFitness",
      sigma: sigmaII,
      label:
        record.transferFitness.tier === "not_applicable"
          ? "移転誤差(層ii、該当なし)"
          : `適合度ティア${record.transferFitness.tier}由来の移転誤差(層ii、sigma≈${sigmaII.toFixed(3)})`,
    },
  ];

  return entries.sort((a, b) => b.sigma - a.sigma);
}
