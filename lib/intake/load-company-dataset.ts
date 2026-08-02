/**
 * 実データ受け入れの統合ローダー。
 * sites.csv・nature-interfaces.csv・engagement-config.jsonの3つを読み込み、検証し、
 * packages/core/src/pipeline/*にそのまま渡せる検証済みデータセットを組み立てる。
 *
 * 拠点間の相互参照(nature-interfaces.csvやengagement-config.jsonが参照するsite_idが
 * sites.csvに実在するか)は、個々のテンプレートパーサでは検証できない(それぞれ単独の
 * ファイルしか見ていないため)。この統合ローダーでのみ検証できる。
 */

import { parseSitesCsv } from "./sites-template";
import { parseNatureInterfacesCsv } from "./nature-interfaces-template";
import { parseEngagementConfig } from "./engagement-config";
import type { EngagementConfig } from "./engagement-config";
import type { SiteRow } from "@core/site/ingest";
import type { LayerLookup } from "@core/site/locate";

export interface CompanyDataset {
  siteRows: SiteRow[];
  natureInterfaceLookupsBySite: Record<string, LayerLookup[]>;
  engagementConfig: EngagementConfig;
}

export interface LoadCompanyDatasetResult {
  dataset: CompanyDataset | null;
  errors: string[];
}

export function loadCompanyDataset(
  sitesCsvText: string,
  natureInterfacesCsvText: string,
  engagementConfigJsonText: string
): LoadCompanyDatasetResult {
  const errors: string[] = [];

  const sitesResult = parseSitesCsv(sitesCsvText);
  errors.push(...sitesResult.errors);

  const natureResult = parseNatureInterfacesCsv(natureInterfacesCsvText);
  errors.push(...natureResult.errors);

  const engagementResult = parseEngagementConfig(engagementConfigJsonText);
  errors.push(...engagementResult.errors);

  const siteIds = new Set(sitesResult.rows.map((r) => r.id));

  for (const siteId of Object.keys(natureResult.lookupsBySite)) {
    if (!siteIds.has(siteId)) {
      errors.push(`nature-interfaces.csvのsite_id "${siteId}" はsites.csvに存在しません。`);
    }
  }

  if (engagementResult.config) {
    const config = engagementResult.config;
    if (!siteIds.has(config.deepDive.siteId)) {
      errors.push(`engagement-config.jsonのdeepDive.siteId "${config.deepDive.siteId}" はsites.csvに存在しません。`);
    }
    for (const countermeasure of config.countermeasures) {
      if (!siteIds.has(countermeasure.targetSiteId)) {
        errors.push(
          `engagement-config.jsonのcountermeasure.targetSiteId "${countermeasure.targetSiteId}" はsites.csvに存在しません。`
        );
      }
    }
  }

  if (errors.length > 0 || !engagementResult.config) {
    return { dataset: null, errors };
  }

  return {
    dataset: {
      siteRows: sitesResult.rows,
      natureInterfaceLookupsBySite: natureResult.lookupsBySite,
      engagementConfig: engagementResult.config,
    },
    errors: [],
  };
}
