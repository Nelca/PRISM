/**
 * 実データ受け入れ②(PRISM運用チームが調査):NatureInterfaceの生の照会結果CSV。
 *
 * このCSVは顧客が記入するものではなく、PRISM運用チームがWDPA/IBAT・WRI Aqueduct・ENCORE等
 * (ライセンス契約締結前は手動でのGIS確認・文献参照)を拠点ごとに調べた結果を記録する。
 * M1の`buildNatureInterfaces()`(`site/locate.ts`)にそのまま渡せる`LayerLookup[]`
 * (拠点IDごと)に変換する。
 *
 * 期待するヘッダー: site_id,layer_type,data_source,raw_result,license_mode
 * raw_resultが空の行は「照会したが対象外/未評価」を意味し、そのレイヤは生成されない
 * (site/locate.tsのbuildNatureInterfaces()が空文字列相当をnullとして扱う仕様と合わせる)。
 * "#"で始まる行はコメントとして無視する。
 */

import { parseCsv } from "./csv";
import type { LayerLookup } from "@core/site/locate";
import type { LicenseMode } from "@core/types/common";
import type { NatureInterfaceLayerType } from "@core/types/site";

const VALID_LAYER_TYPES: NatureInterfaceLayerType[] = [
  "protected_area",
  "kba",
  "water_stress",
  "ecosystem_integrity",
  "dependency_impact",
];
const VALID_LICENSE_MODES: LicenseMode[] = ["embedded", "reference_only", "bring_your_own_license", "pending_review"];

export interface NatureInterfacesCsvParseResult {
  lookupsBySite: Record<string, LayerLookup[]>;
  errors: string[];
}

function parseRawResult(value: string): boolean | number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  if (trimmed.toLowerCase() === "true") {
    return true;
  }
  if (trimmed.toLowerCase() === "false") {
    return false;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseNatureInterfacesCsv(text: string): NatureInterfacesCsvParseResult {
  const table = parseCsv(text).filter((row) => row.length > 0 && !(row[0]?.trim().startsWith("#")));

  if (table.length === 0) {
    return { lookupsBySite: {}, errors: ["nature-interfaces.csvが空です。"] };
  }

  const [header, ...dataRows] = table;
  const columnIndex = new Map(header.map((col, i) => [col.trim(), i]));

  const requiredHeaders = ["site_id", "layer_type", "data_source", "raw_result", "license_mode"];
  const headerErrors = requiredHeaders
    .filter((h) => !columnIndex.has(h))
    .map((h) => `nature-interfaces.csvに必須列 "${h}" がありません。`);
  if (headerErrors.length > 0) {
    return { lookupsBySite: {}, errors: headerErrors };
  }

  const errors: string[] = [];
  const lookupsBySite: Record<string, LayerLookup[]> = {};

  dataRows.forEach((cells, rowIndex) => {
    if (cells.every((cell) => cell.trim() === "")) {
      return;
    }

    const lineNumber = rowIndex + 2;
    const get = (col: string) => cells[columnIndex.get(col)!]?.trim() ?? "";

    const siteId = get("site_id");
    const layerType = get("layer_type");
    const dataSource = get("data_source");
    const rawResultText = get("raw_result");
    const licenseMode = get("license_mode");

    if (!siteId) {
      errors.push(`nature-interfaces.csv ${lineNumber}行目: site_idが空です。`);
      return;
    }
    if (!VALID_LAYER_TYPES.includes(layerType as NatureInterfaceLayerType)) {
      errors.push(`nature-interfaces.csv ${lineNumber}行目(${siteId}): layer_typeが不正です("${layerType}")。`);
      return;
    }
    if (!VALID_LICENSE_MODES.includes(licenseMode as LicenseMode)) {
      errors.push(`nature-interfaces.csv ${lineNumber}行目(${siteId}): license_modeが不正です("${licenseMode}")。`);
      return;
    }
    if (rawResultText !== "" && parseRawResult(rawResultText) === null) {
      errors.push(
        `nature-interfaces.csv ${lineNumber}行目(${siteId}): raw_resultがtrue/false/数値のいずれでもありません("${rawResultText}")。`
      );
      return;
    }

    const rawResult = parseRawResult(rawResultText);
    const lookup: LayerLookup = {
      layerType: layerType as NatureInterfaceLayerType,
      dataSource,
      licenseMode: licenseMode as LicenseMode,
      lookup: () => rawResult,
    };

    lookupsBySite[siteId] = [...(lookupsBySite[siteId] ?? []), lookup];
  });

  return { lookupsBySite, errors };
}
