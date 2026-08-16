/**
 * 算定方法(M3のプラグインID)の表示名(指示03・06)。
 *
 * 以前は valuation/page.tsx と decomposition/page.tsx に同じ定数が二重に定義されていた。
 * 画面統合にあわせて1箇所に集約する。
 */

export const METHOD_LABEL: Record<string, string> = {
  "replacement-cost": "代替費用法(浄水コスト)",
  "lime3-water": "LIME3(水消費統合指標)",
  "ifvi-water-consumption": "IFVI 水ストレス係数",
  "ghg-carbon-price-conversion.ghg-social-cost": "炭素の社会的費用(IFVI GHG方法論)",
  "ghg-carbon-price-conversion.ghg-gx-ets-price": "GX-ETS調整基準取引価格",
};

/** 未知の手法IDはそのまま返す(黙って消さない)。 */
export function methodLabel(methodId: string | undefined | null): string {
  if (!methodId) return "—";
  return METHOD_LABEL[methodId] ?? methodId;
}
