/**
 * M1:任意の拠点座標から`EcologicalIntegrityTrend`を引くための、事前集計済みグローバル
 * グリッド(0.5度=約55km四方)のルックアップ。
 * 参照元: docs/data/ecosystem-integrity-trend-notes.md §8
 *
 * 元データは1km解像度(Sun, Hughes, He, Yu 2026、Zenodo record 15598796、CC BY 4.0)だが、
 * 全世界分をアプリに同梱するには大きすぎる(9年分・1km・GeoTIFFで合計8GB超)。
 * 2015年・2023年の2時点のみを0.5度格子に平均集計し(GDAL Resampling.average、
 * この調査作業限りのオフラインスクリプト)、数MBのJSONとして同梱した。
 * 拠点固有の1km精度ではなく、約55km四方の地域平均値になる(D-15に抵触しない範囲での
 * 精度の妥協。IFVIの国別minimum optionと同種の判断)。
 */

import gridData from "./data/ecological-integrity-grid-0.5deg.json";
import type { EcologicalIntegrityTrend } from "./ecosystem-integrity-trend";

interface EcologicalIntegrityGrid {
  resolutionDeg: number;
  nRows: number;
  nCols: number;
  latTop: number;
  lngLeft: number;
  startYear: number;
  endYear: number;
  startValues: number[];
  endValues: number[];
}

const GRID = gridData as EcologicalIntegrityGrid;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 緯度経度から、含まれる格子セルの`EcologicalIntegrityTrend`を返す。
 * グリッドは全球を格子で覆っているため、有効な緯度経度であれば常に値を返す
 * (国・大陸単位で存在しないケースは無い)。
 */
export function lookupEcologicalIntegrityTrend(lat: number, lng: number): EcologicalIntegrityTrend {
  const row = clamp(Math.floor((GRID.latTop - lat) / GRID.resolutionDeg), 0, GRID.nRows - 1);
  const normalizedLng = ((lng - GRID.lngLeft) % 360 + 360) % 360;
  const col = clamp(Math.floor(normalizedLng / GRID.resolutionDeg), 0, GRID.nCols - 1);
  const index = row * GRID.nCols + col;

  return {
    startValue: GRID.startValues[index],
    startYear: GRID.startYear,
    endValue: GRID.endValues[index],
    endYear: GRID.endYear,
  };
}
