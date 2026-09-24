import { METRIC_BY_ID, type EnvironmentalTarget } from "./metrics";
import { parseRequiredNumber } from "@/lib/forms/number";

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function parseTargetForm(form: FormData): Omit<EnvironmentalTarget, "id" | "revision" | "updatedAt"> | { error: string } {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const siteId = text("siteId");
  const metricId = text("metricId");
  const metric = METRIC_BY_ID.get(metricId);
  if (!siteId || !metric) return { error: "拠点と指標を選択してください。" };
  const boundary = text("boundary");
  if (!boundary || boundary.length > 250) return { error: "測定範囲を250文字以内で記入してください。" };
  const year = parseRequiredNumber(form.get("reportingYear"), { label: "対象年", min: 1900, max: 2200 });
  if ("error" in year || !Number.isInteger(year.value)) return { error: "対象年を1900〜2200の整数で入力してください。" };
  const values: Record<string, number | null> = {};
  for (const key of ["current", "baseline", "target"]) {
    if (!text(key)) { values[key] = null; continue; }
    const value = parseRequiredNumber(form.get(key), { label: { current: "実測値", baseline: "比較基準値", target: "目標値" }[key]!, min: 0, max: metric.maximum, integer: metric.integer });
    if ("error" in value) return value;
    values[key] = value.value;
  }
  const direction = text("direction");
  if (direction !== "at_most" && direction !== "at_least") return { error: "目標の向きを選択してください。" };
  const measuredOn = text("measuredOn");
  const dueDate = text("dueDate");
  if ((measuredOn && !validDate(measuredOn)) || (dueDate && !validDate(dueDate))) return { error: "日付が正しくありません。" };
  const evidence = text("evidence");
  const targetBasis = text("targetBasis");
  if ((values.current !== null || values.baseline !== null) && (!measuredOn || evidence.length < 8)) return { error: "実測値・比較基準値には確認日と根拠（8文字以上）が必要です。比較基準値の期間・範囲も記録してください。" };
  if (values.target !== null && targetBasis.length < 8) return { error: "目標値の根拠を8文字以上で記入してください。社内方針・対象期間を含めてください。" };
  if ([evidence, targetBasis, text("actionPlan")].some((value) => value.length > 4000) || text("owner").length > 100) return { error: "根拠・対応メモは4000文字以内、担当は100文字以内で入力してください。" };
  return { siteId, metricId, boundary, reportingYear: year.value, current: values.current, baseline: values.baseline, target: values.target, direction, measuredOn, evidence, targetBasis, owner: text("owner"), dueDate, actionPlan: text("actionPlan"), archived: form.get("archived") === "on" };
}
