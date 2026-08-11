/**
 * 手法プラグインの登録。
 * 参照元: docs/requirements/m3-monetization-engine.md §3(手法プラグインのインターフェース)
 */

import type { ImpactCategory } from "../types/common";
import type { MonetizationMethodPlugin } from "../types/valuation";
import { replacementCostPlugin } from "./plugins/replacement-cost";
import { lime3WaterPlugin } from "./plugins/lime3-water";
import { ifviWaterConsumptionPlugin } from "./plugins/ifvi-water-consumption";
import { ghgCarbonPriceConversionPlugin } from "./plugins/ghg-carbon-price-conversion";

/** MVP水パイロット(build-plan §5.2)の3手法 + 気候カテゴリ変換(GAP-14)。 */
export const ALL_PLUGINS: MonetizationMethodPlugin[] = [
  replacementCostPlugin,
  lime3WaterPlugin,
  ifviWaterConsumptionPlugin,
  ghgCarbonPriceConversionPlugin,
];

export function getPluginsForCategory(category: ImpactCategory): MonetizationMethodPlugin[] {
  return ALL_PLUGINS.filter((plugin) => plugin.supportedCategories.includes(category));
}
