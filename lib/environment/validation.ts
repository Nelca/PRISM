import { parseRequiredNumber } from "@/lib/forms/number";
import { MAX_REPORTING_YEAR, METRIC_BY_ID, type TargetValues } from "./metrics";

const MIN_EVIDENCE_LENGTH = 8;
const MAX_TEXT_LENGTH = 4000;
const MAX_OWNER_LENGTH = 100;
const MAX_BOUNDARY_LENGTH = 250;

const VALUE_LABELS = { current: "実測値", baseline: "比較基準値", target: "目標値" } as const;

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** フォーム・CSVの1行を検証する。空欄は未入力(null)、0は実測値のゼロとして区別する。 */
export function parseTargetForm(form: FormData): TargetValues | { error: string } {
  const text = (name: string) => String(form.get(name) ?? "").trim();

  const siteId = text("siteId");
  const metricId = text("metricId");
  const metric = METRIC_BY_ID.get(metricId);
  if (!siteId || !metric) return { error: "拠点と指標を選択してください。" };

  const boundary = text("boundary");
  if (!boundary || boundary.length > MAX_BOUNDARY_LENGTH) return { error: `測定範囲を${MAX_BOUNDARY_LENGTH}文字以内で記入してください。` };

  const year = parseRequiredNumber(form.get("reportingYear"), { label: "対象年", min: 1900, max: MAX_REPORTING_YEAR });
  if ("error" in year || !Number.isInteger(year.value)) return { error: `対象年を1900〜${MAX_REPORTING_YEAR}の整数で入力してください。` };

  const values: Record<keyof typeof VALUE_LABELS, number | null> = { current: null, baseline: null, target: null };
  for (const key of Object.keys(VALUE_LABELS) as (keyof typeof VALUE_LABELS)[]) {
    if (!text(key)) continue;
    const value = parseRequiredNumber(form.get(key), { label: VALUE_LABELS[key], min: 0, max: metric.maximum, integer: metric.integer });
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
  const owner = text("owner");
  const actionPlan = text("actionPlan");
  if ((values.current !== null || values.baseline !== null) && (!measuredOn || evidence.length < MIN_EVIDENCE_LENGTH)) {
    return { error: "実測値・比較基準値には確認日と根拠（8文字以上）が必要です。比較基準値の期間・範囲も記録してください。" };
  }
  if (values.target !== null && targetBasis.length < MIN_EVIDENCE_LENGTH) {
    return { error: "目標値の根拠を8文字以上で記入してください。社内方針・対象期間を含めてください。" };
  }
  if ([evidence, targetBasis, actionPlan].some((value) => value.length > MAX_TEXT_LENGTH) || owner.length > MAX_OWNER_LENGTH) {
    return { error: "根拠・対応メモは4000文字以内、担当は100文字以内で入力してください。" };
  }

  return {
    siteId,
    metricId,
    boundary,
    reportingYear: year.value,
    ...values,
    direction,
    measuredOn,
    evidence,
    targetBasis,
    owner,
    dueDate,
    actionPlan,
    archived: form.get("archived") === "on",
  };
}
