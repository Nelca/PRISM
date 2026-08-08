/**
 * サーバーコンポーネントからも呼べる純粋関数。"use client"境界を持つui.tsxには
 * 置かない(サーバーからクライアント側の関数を直接呼ぶことはできないため)。
 */
export type TagVariant = "tierA" | "tierB" | "tierC" | "exchange" | "welfare" | "warn" | "ok" | "neutral";

export function tierTagVariant(tier: string): TagVariant {
  if (tier === "A") return "tierA";
  if (tier === "B") return "tierB";
  return "tierC";
}
