/**
 * M1:Locate(拠点座標×保護区・生態系レイヤの空間突合)。
 * 参照元: docs/requirements/m1-target-definition.md §0
 *
 * 実際のWDPA/IBAT/Aqueduct/ENCORE等への照会は外部サービス・有償ライセンスを要し、
 * この実装環境では実行できない(ライセンス契約未締結、docs/data/licensing.md)。
 * このモジュールは「注入されたlookup関数を呼び出し、結果をNatureInterfaceの形に
 * 組み立てる」オーケストレーションのみを担う(M3のモンテカルロがrngを注入可能に
 * した設計、design-rationale-log D-82と同じパターン)。
 */

import type { LicenseMode } from "../types/common";
import type { NatureInterface, NatureInterfaceLayerType, Site } from "../types/site";

export interface LayerLookup {
  layerType: NatureInterfaceLayerType;
  dataSource: string;
  licenseMode: LicenseMode;
  /** nullを返した場合、そのレイヤは対象外(NatureInterfaceを生成しない)。 */
  lookup: (site: Site) => (boolean | number) | null;
}

export function buildNatureInterfaces(site: Site, layerLookups: LayerLookup[]): NatureInterface[] {
  const results: NatureInterface[] = [];
  let sequence = 0;

  for (const layer of layerLookups) {
    const rawResult = layer.lookup(site);
    if (rawResult === null) {
      continue;
    }

    results.push({
      id: `${site.id}-ni-${sequence++}`,
      siteId: site.id,
      layerType: layer.layerType,
      rawResult,
      dataSource: layer.dataSource,
      licenseMode: layer.licenseMode,
    });
  }

  return results;
}
