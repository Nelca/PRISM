import type { EnvironmentalTarget } from "@/lib/environment/metrics";
import { observationRate } from "./calculations";
export const SYNTHETIC_NOTICE = "合成データ・研究用。公開事例は調査設計の参考であり、数量・金額・目標・地点はPRISMが設定した架空値です。実在企業の実績ではありません。";
export const RESEARCH_SOURCES = [
  { label: "農研機構：花粉媒介昆虫の調査方法", url: "https://www.naro.go.jp/publicity_report/publication/laboratory/niaes/139079.html", use: "訪花昆虫を調査する設計の参考。サンプルの観察回数や依存度の出典ではない。" },
  { label: "サントリー：植生・鳥類調査", url: "https://www.suntory.co.jp/eco/forest/protect/field-survey.html", use: "定点・経路をそろえて鳥類を観察する設計の参考。サンプルの個体数の出典ではない。" },
  { label: "キリン：紅茶農園の環境調査", url: "https://www.kirinholdings.com/jp/newsroom/release/2025/1110_03.html", use: "調達地の生態系も調べる業務の参考。リンゴの送粉依存度や収量へは転用しない。" },
];
export const DEFAULT_POLLINATION = { yieldTonnes: 120, pricePerKg: 250, dependencyPercent: 65, declinePercent: 20, avoidancePercent: 50, annualCost: 500000, initialCost: 2000000, horizon: 5, discountPercent: 5 };
export function syntheticTargets(siteId: string): EnvironmentalTarget[] {
  const base: EnvironmentalTarget = { id: "", revision: "", siteId, metricId: "", boundary: "", reportingYear: 2026, current: null, baseline: null, target: null, direction: "at_least", measuredOn: "2026-09-21", evidence: SYNTHETIC_NOTICE, targetBasis: "合成データ：機能検証用に設定した2026年の仮目標。専門家の推奨閾値ではない。", owner: "研究担当（架空）", dueDate: "2026-12-31", actionPlan: "仮定を変えて判定・費用・開示連携を検証する", archived: false, updatedAt: "" };
  return [
    { ...base, metricId: "pollinator_visits_per_hour", boundary: "研究用・架空リンゴ園A／同一開花期・観察区画", current: observationRate(72, 24), baseline: observationRate(60, 20), target: 4, evidence: `${SYNTHETIC_NOTICE} 2025年60回/20観察者時間、2026年72回/24観察者時間。同じ100花・日中晴天・開花期という仮定。観察頻度は両年3回/観察者時間。${RESEARCH_SOURCES[0].url}` },
    { ...base, metricId: "species_observed_count", boundary: "研究用・架空森林B／Parus minor／固定1km経路", current: 12, baseline: 10, target: 15, evidence: `${SYNTHETIC_NOTICE} 2025年10個体、2026年12個体。各年同季節・同経路・同観察者2時間、同一個体を重複除外という仮定。個体群の推定ではない。${RESEARCH_SOURCES[1].url}` },
    { ...base, metricId: "biological_procurement", boundary: "研究用・架空木材C／国内人工林材", direction: "at_most", current: 100, baseline: 110, target: 80, evidence: `${SYNTHETIC_NOTICE} 年間調達100t。実製品から天然資源採取への変換は未設定。` },
    { ...base, metricId: "virgin_mineral_input", boundary: "研究用・架空アルミ工程D／一次材", direction: "at_most", current: 200, baseline: 220, target: 160, evidence: `${SYNTHETIC_NOTICE} 年間投入200t。金属量と鉱石採取量を同一とはみなさない。` },
  ];
}
