/**
 * 実データ受け入れ①(顧客提供):拠点一覧CSV。
 *
 * このCSVは顧客(サステナビリティ/IR部門等)が直接記入する想定のデータ。
 * ここではCSV形式としての妥当性(必須列の有無、lat/lngが数値であること等)のみを検証し、
 * ビジネスルール上の妥当性(座標・住所ともに不明な行の扱い等)はM1の既存関数
 * `buildSitesFromRows()`(`packages/core/src/site/ingest.ts`)にそのまま委ねる
 * (検証ロジックを重複実装しない)。
 *
 * 期待するヘッダー: site_id,name,site_type,industry_sector,lat,lng,address
 * (lat・lng・addressは列自体はあってもよいが、行ごとに値が空でもよい。M1 D-3の通り
 * 座標か住所のどちらかがあればよい)
 * "#"で始まる行はコメントとして無視する。
 */

import { parseCsv } from "./csv";
import type { SiteRow } from "@core/site/ingest";

export interface SitesCsvParseResult {
  rows: SiteRow[];
  errors: string[];
}

const REQUIRED_HEADERS = ["site_id", "name", "site_type", "industry_sector"];
const HEADER_ALIASES: Record<string, string> = {
  拠点ID: "site_id",
  拠点名: "name",
  拠点区分: "site_type",
  業種: "industry_sector",
  緯度: "lat",
  経度: "lng",
  住所: "address",
};

export function parseSitesCsv(text: string): SitesCsvParseResult {
  const table = parseCsv(text).filter((row) => row.length > 0 && !(row[0]?.trim().startsWith("#")));

  if (table.length === 0) {
    return { rows: [], errors: ["sites.csvが空です。"] };
  }

  const [header, ...dataRows] = table;
  const columnIndex = new Map(header.map((col, i) => [HEADER_ALIASES[col.trim()] ?? col.trim(), i]));

  const headerErrors: string[] = [];
  for (const required of REQUIRED_HEADERS) {
    if (!columnIndex.has(required)) {
      headerErrors.push(`sites.csvに必須列 "${required}" がありません。`);
    }
  }
  if (headerErrors.length > 0) {
    return { rows: [], errors: headerErrors };
  }

  const errors: string[] = [];
  const rows: SiteRow[] = [];

  dataRows.forEach((cells, rowIndex) => {
    if (cells.every((cell) => cell.trim() === "")) {
      return; // 完全な空行は無視する
    }

    const lineNumber = rowIndex + 2; // ヘッダー行を1行目として数える
    const get = (col: string): string | undefined => {
      const idx = columnIndex.get(col);
      const value = idx === undefined ? undefined : cells[idx];
      return value?.trim();
    };

    const id = get("site_id");
    if (!id) {
      errors.push(`sites.csv ${lineNumber}行目: site_idが空です。`);
      return;
    }

    const latRaw = get("lat");
    const lngRaw = get("lng");
    let lat: number | undefined;
    let lng: number | undefined;

    if (latRaw) {
      const parsed = Number(latRaw);
      if (Number.isNaN(parsed)) {
        errors.push(`sites.csv ${lineNumber}行目(${id}): latが数値ではありません("${latRaw}")。`);
      } else {
        lat = parsed;
      }
    }
    if (lngRaw) {
      const parsed = Number(lngRaw);
      if (Number.isNaN(parsed)) {
        errors.push(`sites.csv ${lineNumber}行目(${id}): lngが数値ではありません("${lngRaw}")。`);
      } else {
        lng = parsed;
      }
    }

    rows.push({
      id,
      name: get("name") ?? "",
      siteType: get("site_type") ?? "",
      industrySector: get("industry_sector") ?? "",
      lat,
      lng,
      address: get("address") || undefined,
    });
  });

  return { rows, errors };
}
