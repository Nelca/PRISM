import type { DecisionRecord } from "@core/types/decision";
import type { DisclosureClaim } from "@core/types/disclosure";
import { METRIC_BY_ID, TARGET_STATUS, evaluateTarget, type EnvironmentalTarget } from "./metrics";
export interface ResourceInvestment {
  linkedDecision?: { id: string; fingerprint: string };
  horizon: number; discountRatePercent: number; approvalThreshold: number; rationale: string;
}
export interface ResourceCostCase {
  investment?: ResourceInvestment;
  name: string; baselineUnitCost: number; alternativeUnitCost: number; alternativeQuantity: number;
  additionalAnnualCost: number; initialInvestment: number; evidence: string;
  sourceFingerprint: string; confirmedAt: string;
}
export interface TargetDisclosureNote {
  linkedClaim?: { id: string; fingerprint: string; sourceDocument: string; sourcePageOrSection: string };
  siteName: string; text: string; reason: string; sourceFingerprint: string; confirmedAt: string;
}
export function targetFingerprint(record: EnvironmentalTarget): string {
  return JSON.stringify([record.id, record.siteId, record.metricId, record.reportingYear, record.boundary,
    record.current, record.baseline, record.target, record.direction, record.measuredOn, record.evidence, record.targetBasis]);
}
export function supportsResourceCosts(record: EnvironmentalTarget): boolean {
  return ["biological_procurement", "virgin_mineral_input"].includes(record.metricId);
}
export function resourceCostComparison(record: EnvironmentalTarget, scenario: ResourceCostCase) {
  if (!supportsResourceCosts(record) || record.current === null) return null;
  const currentAnnualCost = record.current * scenario.baselineUnitCost;
  const alternativeAnnualCost = scenario.alternativeQuantity * scenario.alternativeUnitCost + scenario.additionalAnnualCost;
  const annualSavings = currentAnnualCost - alternativeAnnualCost;
  const firstYearSavings = annualSavings - scenario.initialInvestment;
  if ([currentAnnualCost, alternativeAnnualCost, annualSavings, firstYearSavings].some((value) => !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) return null;
  return { currentAnnualCost, alternativeAnnualCost, annualSavings, firstYearSavings };
}
/** Initial payment at t=0; constant incremental savings at each year-end. */
export function resourceInvestmentComparison(record: EnvironmentalTarget, scenario: ResourceCostCase, decisions: DecisionRecord[] = []) {
  const annual = resourceCostComparison(record, scenario);
  const input = scenario.investment;
  if (!annual || !input || !decisionLinkCurrent(input, decisions) || record.archived || scenario.sourceFingerprint !== targetFingerprint(record)) return null;
  if (!Number.isInteger(input.horizon) || input.horizon < 1 || input.horizon > 50 ||
      !Number.isFinite(input.discountRatePercent) || input.discountRatePercent < 0 || input.discountRatePercent > 100 ||
      !Number.isFinite(input.approvalThreshold) || Math.abs(input.approvalThreshold) > Number.MAX_SAFE_INTEGER) return null;
  const cashflows = Array.from({ length: input.horizon }, (_, index) => ({
    year: index + 1, savings: annual.annualSavings,
    presentValue: annual.annualSavings / (1 + input.discountRatePercent / 100) ** (index + 1),
  }));
  const npv = cashflows.reduce((total, row) => total + row.presentValue, -scenario.initialInvestment);
  if (!Number.isFinite(npv) || Math.abs(npv) > Number.MAX_SAFE_INTEGER) return null;
  return { npv, cashflows, meetsThreshold: npv >= input.approvalThreshold };
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function decisionFingerprint(record: DecisionRecord): string {
  return canonicalJson([record.id, record.decisionTarget, record.baselineNpv, record.approvalThreshold, record.relatedValuationRecordIds, record.natureAdjustedNpv, record.bindingMechanism, record.verdict]);
}
export function decisionLinkCurrent(input: ResourceInvestment | undefined, decisions: DecisionRecord[]): boolean {
  return !input?.linkedDecision || decisions.some((record) => record.id === input.linkedDecision!.id && decisionFingerprint(record) === input.linkedDecision!.fingerprint);
}
export function targetReviewNeeds(record: EnvironmentalTarget, siteName: string | undefined, claims: DisclosureClaim[] = [], decisions: DecisionRecord[] = []): string[] {
  const signature = targetFingerprint(record);
  const needs: string[] = [];
  if (record.costCase && record.costCase.sourceFingerprint !== signature) needs.push("費用前提");
  if (record.disclosureNote && (record.disclosureNote.sourceFingerprint !== signature || record.disclosureNote.siteName !== siteName)) needs.push("開示文案");
  if (!claimLinkCurrent(record.disclosureNote, claims)) needs.push("既存主張との対応");
  if (!decisionLinkCurrent(record.costCase?.investment, decisions)) needs.push("投資案件との対応");
  return needs;
}
export function suggestedPhysicalDisclosure(record: EnvironmentalTarget, siteName: string): string {
  const metric = METRIC_BY_ID.get(record.metricId)!;
  const actual = record.current === null ? "未測定" : `${record.current} ${metric.unit}`;
  return `${siteName}の${record.reportingYear}年・${record.boundary}について、${metric.label}は${actual}です。` +
    (record.target === null ? "目標値は未設定です。" : `目標は${record.target} ${metric.unit}${record.direction === "at_most" ? "以下" : "以上"}で、入力値との比較は「${TARGET_STATUS[evaluateTarget(record)]}」です。`);
}
export function claimFingerprint(claim: DisclosureClaim): string { return canonicalJson(claim); }
export function claimLinkCurrent(note: TargetDisclosureNote | undefined, claims: DisclosureClaim[]): boolean {
  return !note?.linkedClaim || claims.some((claim) => claim.id === note.linkedClaim!.id && claimFingerprint(claim) === note.linkedClaim!.fingerprint);
}
export function physicalDisclosureBundle(records: EnvironmentalTarget[], siteNames: Map<string, string>, claims: DisclosureClaim[] = []) {
  const reviewed: string[] = [];
  const pending: string[] = [];
  for (const record of records.filter((item) => !item.archived)) {
    const label = `${siteNames.get(record.siteId) ?? record.siteId} / ${METRIC_BY_ID.get(record.metricId)!.label} / ${record.reportingYear}年 / ${record.boundary}`;
    const note = record.disclosureNote;
    if (!siteNames.has(record.siteId) || !note || !claimLinkCurrent(note, claims) || (note.sourceFingerprint !== targetFingerprint(record) || note.siteName !== siteNames.get(record.siteId)) || record.current === null) { pending.push(label); continue; }
    reviewed.push([note.text, ...(note.linkedClaim ? [`確認した既存主張: ${note.linkedClaim.id} / ${note.linkedClaim.sourceDocument} / ${note.linkedClaim.sourcePageOrSection}`] : []), `対象: ${label}`, `実測根拠: ${record.evidence}`, `目標根拠: ${record.targetBasis || "目標未設定"}`,
      `確認日: ${record.measuredOn}`, `文案確認: ${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(note.confirmedAt))}（日本時間）`, `確認理由: ${note.reason}`, `根拠レコード: ${record.id} / 版: ${record.revision}`].join("\n"));
  }
  return { text: reviewed.join("\n\n"), count: reviewed.length, pending };
}
