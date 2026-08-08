/**
 * サーバーコンポーネントからも呼べる純粋関数。"use client"境界を持つui.tsxには
 * 置かない(サーバーからクライアント側の関数を直接呼ぶことはできないため)。
 */

import type { TransferFitnessTier } from "@core/types/valuation";

export type TagVariant = "tierA" | "tierB" | "tierC" | "exchange" | "welfare" | "warn" | "ok" | "neutral";

/**
 * 適合度ティアの表示。
 *
 * `not_applicable`(便益移転という行為自体が発生していない手法)を A/B/C のいずれかに
 * 読み替えてはならない(M3要件定義 §4.2:「『移転していない』ケースを無理にティアA
 * (移転はしたが精度が高い)に押し込めない。理由が違うものを同じラベルにすると、
 * 監査時に『なぜこの評価はAなのか』を正しく説明できなくなる」)。
 * したがって第4の表示状態として neutral を割り当てる。
 */
export function tierTagVariant(tier: TransferFitnessTier): TagVariant {
  if (tier === "A") return "tierA";
  if (tier === "B") return "tierB";
  if (tier === "C") return "tierC";
  return "neutral";
}

/** 画面に出す短いラベル。`not_applicable` をそのまま表示しない。 */
export function tierLabel(tier: TransferFitnessTier): string {
  return tier === "not_applicable" ? "移転なし" : tier;
}
