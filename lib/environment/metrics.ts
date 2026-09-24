import type { ResourceCostCase, TargetDisclosureNote } from "./review";
/** 物理指標の管理カタログ。貨幣化カテゴリ・係数レジストリとは分離する。 */
export const TARGET_CATEGORIES = {
  climate: "気候・GHG", water: "水", pollution: "汚染物質", waste: "廃棄物", land_use: "土地利用",
  biological_resources: "生物資源", mineral_resources: "鉱物資源", ecosystem: "生態系の状態",
} as const;
export type TargetCategory = keyof typeof TARGET_CATEGORIES;
export interface MetricDefinition {
  id: string; category: TargetCategory; label: string; unit: string; maximum?: number; integer?: boolean; hint: string;
}
export const METRICS: MetricDefinition[] = [
  { id: "pollinator_visits_per_hour", category: "ecosystem", label: "訪花昆虫の観察頻度", unit: "回/観察者時間", hint: "作物・開花期・観察区画・観察花数・天候・調査方法を根拠に記録。同じ条件で観察回数÷観察者の合計時間を比較します。受粉成功率とは異なります。" },
  { id: "species_observed_count", category: "ecosystem", label: "対象種の観察個体数", unit: "個体", integer: true, hint: "対象種の学名、調査地点・経路、季節、調査努力量、重複個体の扱いを記録。同条件の調査だけを比較し、未検出を地域内の不在とはみなしません。" },
  ...[1, 2, 3].map((scope) => ({ id: `ghg_scope${scope}`, category: "climate" as const, label: `Scope ${scope} 排出量`, unit: "tCO2e", hint: "算定済みの年間排出量を入力してください。Scope 2の算定方式、Scope 3の対象範囲は測定範囲に記録します。" })),
  { id: "water_consumption", category: "water", label: "年間水消費量", unit: "m³", hint: "取水量と消費量は異なります。消費量の集計根拠を記録してください。" },
  { id: "pollutant_release", category: "pollution", label: "直接排出量", unit: "kg", hint: "測定範囲に物質名と排出媒体を記入してください。移動量とは分けます。" },
  { id: "waste_generated", category: "waste", label: "廃棄物発生量", unit: "t", hint: "測定範囲に廃棄物の種類と対象施設を記入してください。" },
  { id: "land_converted", category: "land_use", label: "土地改変面積", unit: "ha", hint: "転換前後の土地の種類と案件範囲を記録してください。" },
  { id: "biological_procurement", category: "biological_resources", label: "生物資源の調達量", unit: "t", hint: "木材・農産物・水産物など、資源の種類と調達範囲ごとに登録します。異なる資源を合算しません。" },
  { id: "certified_procurement_share", category: "biological_resources", label: "認証済み調達の割合", unit: "%", maximum: 100, hint: "認証制度、分母となる調達量、対象品目を根拠資料に記録してください。" },
  { id: "virgin_mineral_input", category: "mineral_resources", label: "一次鉱物資源の投入量", unit: "t", hint: "鉱物・金属の種類と対象工程を記入してください。再生材は含めません。" },
  { id: "recycled_material_share", category: "mineral_resources", label: "再生材の投入割合", unit: "%", maximum: 100, hint: "分母と再生材の定義・対象材料を根拠資料に記録してください。" },
  { id: "habitat_area", category: "ecosystem", label: "対象生息地の面積", unit: "ha", hint: "生息地の種類・位置・調査方法を記録してください。土地改変面積とは別の指標です。" },
  { id: "ecosystem_condition", category: "ecosystem", label: "生態系の状態指数", unit: "点（0–100）", maximum: 100, hint: "調査で用いた指数名・算出方法・調査範囲を必ず記録してください。PRISM共通の生態系スコアではありません。" },
];
export const METRIC_BY_ID = new Map(METRICS.map((metric) => [metric.id, metric]));
export const TARGET_STATUS = { missing_measurement: "実測値待ち", missing_target: "目標未設定", met: "目標達成", not_met: "目標未達" } as const;
export type TargetStatus = keyof typeof TARGET_STATUS;
export interface EnvironmentalTarget {
  costCase?: ResourceCostCase;
  disclosureNote?: TargetDisclosureNote;
  carriedFrom?: { id: string; revision: string; year: number };
  id: string; revision: string; siteId: string; metricId: string; boundary: string; reportingYear: number;
  current: number | null; baseline: number | null; target: number | null; direction: "at_most" | "at_least";
  measuredOn: string; evidence: string; targetBasis: string; owner: string; dueDate: string; actionPlan: string;
  archived: boolean; updatedAt: string;
}
export function evaluateTarget(record: EnvironmentalTarget): TargetStatus {
  if (record.current === null) return "missing_measurement";
  if (record.target === null) return "missing_target";
  return (record.direction === "at_most" ? record.current <= record.target : record.current >= record.target) ? "met" : "not_met";
}
export function targetDelta(record: EnvironmentalTarget): number | null {
  return record.current === null || record.baseline === null ? null : record.current - record.baseline;
}
export function isOverdue(record: EnvironmentalTarget, today: string): boolean {
  return !record.archived && Boolean(record.dueDate) && record.dueDate < today && evaluateTarget(record) !== "met";
}
export function targetIdentity(record: EnvironmentalTarget): string {
  return JSON.stringify([record.siteId, record.metricId, record.reportingYear, record.boundary.trim().normalize("NFKC").toLowerCase()]);
}
