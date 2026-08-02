/**
 * M1:拠点データ(CSV/スプレッドシート相当)の取込。
 * 参照元: docs/requirements/m1-target-definition.md §0(MVP範囲:拠点・サプライヤーの取込)
 *
 * CSV文字列自体のパース(区切り文字・引用符処理)はスコープ外とし、既に構造化された
 * 行データ(SiteRow[])を受け取るところから開始する(plan file参照)。
 *
 * D-3の「座標・住所ともに不明」なケースは、SiteLocation型がaddressバリアントで
 * 文字列を必須にしているため、Siteとして構築される前のこの段階で弾く。
 */

import type { Site, SiteType } from "../types/site";

export interface SiteRow {
  id: string;
  name: string;
  siteType: string;
  industrySector: string;
  lat?: number;
  lng?: number;
  address?: string;
}

export interface SiteIngestionError {
  rowId: string;
  reason: string;
}

const VALID_SITE_TYPES: SiteType[] = ["own_site", "supplier_site"];

function isValidSiteType(value: string): value is SiteType {
  return (VALID_SITE_TYPES as string[]).includes(value);
}

export function buildSitesFromRows(rows: SiteRow[]): { sites: Site[]; errors: SiteIngestionError[] } {
  const sites: Site[] = [];
  const errors: SiteIngestionError[] = [];

  for (const row of rows) {
    if (!row.name.trim()) {
      errors.push({ rowId: row.id, reason: "拠点名(name)が空です。" });
      continue;
    }
    if (!isValidSiteType(row.siteType)) {
      errors.push({ rowId: row.id, reason: `siteTypeが不正な値です("${row.siteType}")。own_site/supplier_siteのいずれかである必要があります。` });
      continue;
    }
    if (!row.industrySector.trim()) {
      errors.push({ rowId: row.id, reason: "業種(industrySector)が空です。" });
      continue;
    }

    const hasCoordinates = row.lat !== undefined && row.lng !== undefined;
    const hasPartialCoordinates = !hasCoordinates && (row.lat !== undefined || row.lng !== undefined);
    const hasAddress = row.address !== undefined && row.address.trim() !== "";

    // 緯度・経度の片方だけが欠けていて、フォールバック先の住所もない場合は、
    // 「座標・住所ともに不明」とは異なる、より具体的な理由を記録する。
    if (hasPartialCoordinates && !hasAddress) {
      errors.push({
        rowId: row.id,
        reason: `座標が緯度・経度の片方しか指定されておらず、住所もありません(lat=${row.lat}, lng=${row.lng})。両方指定するか、住所を指定してください。`,
      });
      continue;
    }

    if (!hasCoordinates && !hasAddress) {
      errors.push({ rowId: row.id, reason: "座標・住所ともに不明です(M1 D-3)。" });
      continue;
    }

    sites.push({
      id: row.id,
      name: row.name,
      siteType: row.siteType,
      industrySector: row.industrySector,
      location: hasCoordinates
        ? { kind: "coordinates", lat: row.lat!, lng: row.lng! }
        : { kind: "address", address: row.address!.trim(), geocoded: false },
    });
  }

  return { sites, errors };
}
