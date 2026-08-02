/**
 * M5 D-6:非GAAPラベルの共通ヘルパー。
 * 参照元: docs/requirements/m5-financial-bridge.md §6
 *
 * M5の全出力(ブリッジ1・ブリッジ2・自然債務・比較先)がこれを通してnonGaapLabelを
 * 付与する。ラベル文字列("非GAAP指標")をモジュール内に重複記述しないためのヘルパー。
 */

import type { NonGaapLabel } from "../types/financial-bridge";

export function buildNonGaapLabel(appliesTo: string[]): NonGaapLabel {
  return { label: "非GAAP指標", appliesTo };
}
