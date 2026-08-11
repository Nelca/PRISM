/**
 * M1:ENCORE依存・影響レーティング(materiality rating)→基準のboolean化。
 * 参照元: docs/data/encore-materiality-notes.md、docs/data/acquisition-runbook.md §3.8
 *
 * water-stress.tsと同様、`criteria.ts`の構造的既定はENCOREの5段階レーティング(文字列)には
 * そのまま使えないため、閾値でのboolean化をこの専用関数に集約する。
 */

/** ENCORE知識ベースが使う5段階のmateriality rating。N/A=依存・圧力の関連なし、ND=未確定。 */
export type EncoreMaterialityRating = "VH" | "H" | "M" | "L" | "VL" | "N/A" | "ND";

/**
 * 依存度(dependency)・圧力(pressure)のいずれかでHigh以上のレーティングが1件でもあれば、
 * 「依存・影響が大きい可能性がある」とする。ENCORE自身は特定の閾値を推奨していない
 * (Explanatory Note 2.6:「これらのレーティングはあくまで初期スクリーニングの参考であり、
 * 空間的・企業固有の詳細評価に進むべき」)ため、この閾値はPRISM側の判断
 * (docs/data/encore-materiality-notes.md §3)。
 */
export function hasHighMaterialityRating(ratings: EncoreMaterialityRating[]): boolean {
  return ratings.some((r) => r === "H" || r === "VH");
}
