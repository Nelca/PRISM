/**
 * M1 D-3:座標がない拠点は住所ジオコーディングを試み、それでも不能な場合は
 * 除外理由を記録して除外する。
 * 参照元: docs/requirements/m1-target-definition.md §3
 *
 * 実際のジオコーディングサービス呼び出しは注入する(plan file参照)。この関数は
 * 「座標がある/ジオコーディングに成功/失敗」の3分岐と、除外理由の記録のみを担う。
 * 「住所自体がない」場合(D-3の3番目のケース)は、SiteLocation型が
 * addressバリアントで文字列を必須にしているため、Siteとして構築される前の
 * 取込段階(ingest.ts)で弾かれる想定であり、この関数の対象外。
 */

import type { Site } from "../types/site";

export type Geocode = (address: string) => { lat: number; lng: number } | null;

export interface SiteLocationResolution {
  site: Site;
  excluded: boolean;
  exclusionReason?: string;
}

export function resolveSiteLocation(site: Site, geocode: Geocode): SiteLocationResolution {
  if (site.location.kind === "coordinates") {
    return { site, excluded: false };
  }

  const resolved = geocode(site.location.address);

  if (!resolved) {
    return {
      site: { ...site, location: { ...site.location, geocoded: false } },
      excluded: true,
      exclusionReason: `住所「${site.location.address}」のジオコーディングに失敗しました。座標を伴わない住所情報だけではLocate(空間突合)が実行できません。`,
    };
  }

  return {
    site: {
      ...site,
      location: { ...site.location, geocoded: true, lat: resolved.lat, lng: resolved.lng },
    },
    excluded: false,
  };
}
