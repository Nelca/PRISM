/**
 * 外部データソースの帰属表示(ENCORE・WRI Aqueduct 4.0・World Bank)。
 * 参照元: docs/data/licensing.md、docs/data/aqueduct-water-stress-notes.md §1、
 * docs/data/encore-materiality-notes.md §2
 *
 * ENCORE(CC BY-SA 4.0)・WRI Aqueduct(CC BY 4.0)・World Bank(CC BY 4.0)はいずれも
 * 帰属表示が利用条件の必須要件(`licensing.md`)。TNFD LEAP L3の5基準のうち`waterStress`は
 * Aqueduct、`likelySignificantDependencyImpact`はENCOREのデータに基づき、地理較正
 * (PPP・GNI per capita・GDPデフレータ)はWorld Bank(World Development Indicators)の
 * データに基づくため、これらを評価に使う画面には帰属表示を付す。
 */

export const DATA_SOURCE_ATTRIBUTION: Record<string, string> = {
  "WRI Aqueduct 4.0": "Source: WRI Aqueduct, accessed on 2026-08-10.",
  ENCORE:
    "ENCORE Partners (Global Canopy, UNEP FI, and UNEP-WCMC) (2026). ENCORE: Exploring Natural Capital Opportunities, Risks and Exposure. [On-line], May/2026, Cambridge, UK: the ENCORE Partners. Available at: https://encorenature.org.",
  "World Bank":
    "Data source: World Bank, World Development Indicators. License: CC BY-4.0 (https://creativecommons.org/licenses/by/4.0/). Indicators used: PA.NUS.PPP, NY.GNP.PCAP.PP.CD, NY.GDP.DEFL.ZS.",
};

/** `dataSource`名の配列から、帰属表示が必要なものだけを1行にまとめて表示する。 */
export function DataSourceAttribution({ sources }: { sources: string[] }) {
  const lines = [...new Set(sources)]
    .map((s) => DATA_SOURCE_ATTRIBUTION[s])
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return null;
  }

  return <p className="footer-note footer-note--attribution">{lines.join(" ")}</p>;
}
