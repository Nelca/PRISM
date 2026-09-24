/** Research-only factors. Never import this module into the production valuation registry. */
export const CE_AIR = [
  { id: "PM10", lower: 29.7, central: 44.3, upper: 73.3 },
  { id: "SO2", lower: 16.9, central: 26.6, upper: 45.3 },
  { id: "NH3", lower: 17.4, central: 25.2, upper: 39.5 },
  { id: "NMVOC", lower: 1.53, central: 2.16, upper: 3.49 },
] as const;
// IFVI air methodology Table 5: visibility ONLY, US source value, USD2011/tonne.
export const IFVI_VISIBILITY = [
  { id: "PM2.5", value: 21.2 }, { id: "PM10", value: 63.6 }, { id: "SO2", value: 10.43 },
  { id: "VOC", value: 68.74 }, { id: "NOx", value: 37.83 }, { id: "NH3", value: 7.71 },
] as const;
function finite(value: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error("入力値が計算範囲外です。");
  return value;
}
export function ceAirImpact(pollutant: string, kg: number, region: string) {
  if (region !== "EU27") throw new Error("EU27平均条件の試算です。地域の異なる値へ自動移転しません。");
  const factor = CE_AIR.find((item) => item.id === pollutant);
  if (!factor) throw new Error("未対応の物質です。");
  finite(kg);
  return { lower: finite(kg * factor.lower), central: finite(kg * factor.central), upper: finite(kg * factor.upper), unit: "EUR2021" };
}
export function ifviVisibility(pollutant: string, tonnes: number) {
  const factor = IFVI_VISIBILITY.find((item) => item.id === pollutant);
  if (!factor) throw new Error("未対応の物質です。");
  return finite(finite(tonnes) * factor.value);
}
export function esvdAreaIllustration(value: number | null, hectares: number) {
  if (value === null) throw new Error("原本に標準化値がありません。");
  finite(value, -Number.MAX_SAFE_INTEGER);
  return finite(value * finite(hectares), -Number.MAX_SAFE_INTEGER);
}
export interface PollinationInput {
  yieldTonnes: number; pricePerKg: number; dependencyPercent: number; declinePercent: number;
  avoidancePercent: number; annualCost: number; initialCost: number; horizon: number; discountPercent: number;
}
export function pollinationScenario(input: PollinationInput) {
  Object.values(input).forEach((value) => finite(value));
  for (const key of ["dependencyPercent", "declinePercent", "avoidancePercent", "discountPercent"] as const) finite(input[key], 0, 100);
  if (!Number.isInteger(input.horizon) || input.horizon < 1 || input.horizon > 50) throw new Error("期間は1〜50年です。");
  const revenue = finite(input.yieldTonnes * 1000 * input.pricePerKg);
  const dependentRevenue = revenue * input.dependencyPercent / 100;
  const exposedRevenue = dependentRevenue * input.declinePercent / 100;
  const avoidedRevenueLoss = exposedRevenue * input.avoidancePercent / 100;
  const incrementalCash = avoidedRevenueLoss - input.annualCost;
  const npv = finite(Array.from({ length: input.horizon }, (_, i) => incrementalCash / (1 + input.discountPercent / 100) ** (i + 1)).reduce((sum, value) => sum + value, -input.initialCost), -Number.MAX_SAFE_INTEGER);
  return { revenue, dependentRevenue, exposedRevenue, avoidedRevenueLoss, incrementalCash, npv };
}
export function observationRate(count: number, observerHours: number) {
  finite(count); finite(observerHours);
  if (!Number.isInteger(count) || observerHours <= 0) throw new Error("観察数は整数、観察者時間は0より大きい数で入力してください。");
  return finite(count / observerHours);
}
