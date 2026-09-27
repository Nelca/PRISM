/**
 * 物理指標に紐づく「人の確認」の扱い: 資源対策の費用前提と、開示文案。
 *
 * 確認時点の入力値を指紋(fingerprint)として保存し、実測値・根拠・拠点名・関連する
 * 主張や投資案件が変わったら、以前の確認を現在の結果として使わない(再確認待ちにする)。
 */
import type { DecisionRecord } from "@core/types/decision";
import type { DisclosureClaim } from "@core/types/disclosure";
import { formatJstDateTime } from "@/lib/datetime";
import {
  DIRECTION_LABEL,
  METRIC_BY_ID,
  TARGET_STATUS,
  evaluateTarget,
  type EnvironmentalTarget,
  type ResourceCostCase,
  type ResourceInvestment,
  type TargetDisclosureNote,
} from "./metrics";

export type { ResourceCostCase, ResourceInvestment, TargetDisclosureNote } from "./metrics";

const RESOURCE_COST_METRICS = new Set(["biological_procurement", "virgin_mineral_input"]);

function withinSafeRange(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

/** JSONBの読み戻しでキー順が変わっても同じ内容なら同じ文字列にする。 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** 確認に影響する値だけを対象にする。担当・期限・対応メモの変更では再確認を求めない。 */
export function targetFingerprint(record: EnvironmentalTarget): string {
  return JSON.stringify([
    record.id,
    record.siteId,
    record.metricId,
    record.reportingYear,
    record.boundary,
    record.current,
    record.baseline,
    record.target,
    record.direction,
    record.measuredOn,
    record.evidence,
    record.targetBasis,
  ]);
}

export function decisionFingerprint(record: DecisionRecord): string {
  return canonicalJson([
    record.id,
    record.decisionTarget,
    record.baselineNpv,
    record.approvalThreshold,
    record.relatedValuationRecordIds,
    record.natureAdjustedNpv,
    record.bindingMechanism,
    record.verdict,
  ]);
}

export function claimFingerprint(claim: DisclosureClaim): string {
  return canonicalJson(claim);
}

export function decisionLinkCurrent(input: ResourceInvestment | undefined, decisions: DecisionRecord[]): boolean {
  const link = input?.linkedDecision;
  return !link || decisions.some((record) => record.id === link.id && decisionFingerprint(record) === link.fingerprint);
}

export function claimLinkCurrent(note: TargetDisclosureNote | undefined, claims: DisclosureClaim[]): boolean {
  const link = note?.linkedClaim;
  return !link || claims.some((claim) => claim.id === link.id && claimFingerprint(claim) === link.fingerprint);
}

/** 費用前提を確認した時点から、実測値・根拠が変わっていない。 */
export function costCaseCurrent(record: EnvironmentalTarget): boolean {
  return record.costCase?.sourceFingerprint === targetFingerprint(record);
}

/** 文案を確認した時点から、実測値・根拠・拠点名が変わっていない(関連主張は別に確認する)。 */
export function disclosureNoteMatchesTarget(record: EnvironmentalTarget, siteName: string | undefined): boolean {
  const note = record.disclosureNote;
  return Boolean(note) && note!.sourceFingerprint === targetFingerprint(record) && note!.siteName === siteName;
}

/** 下書きへ出力してよい状態(文案・拠点名・関連主張がすべて確認時点のまま)。 */
export function disclosureNoteCurrent(record: EnvironmentalTarget, siteName: string | undefined, claims: DisclosureClaim[]): boolean {
  return disclosureNoteMatchesTarget(record, siteName) && claimLinkCurrent(record.disclosureNote, claims);
}

export function supportsResourceCosts(record: EnvironmentalTarget): boolean {
  return RESOURCE_COST_METRICS.has(record.metricId);
}

export function resourceCostComparison(record: EnvironmentalTarget, scenario: ResourceCostCase) {
  if (!supportsResourceCosts(record) || record.current === null) return null;
  const currentAnnualCost = record.current * scenario.baselineUnitCost;
  const alternativeAnnualCost = scenario.alternativeQuantity * scenario.alternativeUnitCost + scenario.additionalAnnualCost;
  const annualSavings = currentAnnualCost - alternativeAnnualCost;
  const firstYearSavings = annualSavings - scenario.initialInvestment;
  if (![currentAnnualCost, alternativeAnnualCost, annualSavings, firstYearSavings].every(withinSafeRange)) return null;
  return { currentAnnualCost, alternativeAnnualCost, annualSavings, firstYearSavings };
}

function validInvestment(input: ResourceInvestment): boolean {
  return (
    Number.isInteger(input.horizon) &&
    input.horizon >= 1 &&
    input.horizon <= 50 &&
    Number.isFinite(input.discountRatePercent) &&
    input.discountRatePercent >= 0 &&
    input.discountRatePercent <= 100 &&
    withinSafeRange(input.approvalThreshold)
  );
}

/**
 * 対策単体のNPV。初期費用は開始時(t=0)に一度だけ控除し、一定の年間削減額を各年末で割り引く。
 * 実測値・根拠・関連案件が確認時点から変わっていれば null(再確認まで判定を出さない)。
 */
export function resourceInvestmentComparison(record: EnvironmentalTarget, scenario: ResourceCostCase, decisions: DecisionRecord[] = []) {
  const annual = resourceCostComparison(record, scenario);
  const input = scenario.investment;
  if (!annual || !input || record.archived || scenario.sourceFingerprint !== targetFingerprint(record)) return null;
  if (!decisionLinkCurrent(input, decisions) || !validInvestment(input)) return null;
  const cashflows = Array.from({ length: input.horizon }, (_, index) => ({
    year: index + 1,
    savings: annual.annualSavings,
    presentValue: annual.annualSavings / (1 + input.discountRatePercent / 100) ** (index + 1),
  }));
  const npv = cashflows.reduce((total, row) => total + row.presentValue, -scenario.initialInvestment);
  if (!withinSafeRange(npv)) return null;
  return { npv, cashflows, meetsThreshold: npv >= input.approvalThreshold };
}

/** 統合管理で「再確認」として示す項目。 */
export function targetReviewNeeds(
  record: EnvironmentalTarget,
  siteName: string | undefined,
  claims: DisclosureClaim[] = [],
  decisions: DecisionRecord[] = []
): string[] {
  const needs: string[] = [];
  if (record.costCase && !costCaseCurrent(record)) needs.push("費用前提");
  if (record.disclosureNote && !disclosureNoteMatchesTarget(record, siteName)) needs.push("開示文案");
  if (!claimLinkCurrent(record.disclosureNote, claims)) needs.push("既存主張との対応");
  if (!decisionLinkCurrent(record.costCase?.investment, decisions)) needs.push("投資案件との対応");
  return needs;
}

export function suggestedPhysicalDisclosure(record: EnvironmentalTarget, siteName: string): string {
  const metric = METRIC_BY_ID.get(record.metricId)!;
  const actual = record.current === null ? "未測定" : `${record.current} ${metric.unit}`;
  const target =
    record.target === null
      ? "目標値は未設定です。"
      : `目標は${record.target} ${metric.unit}${DIRECTION_LABEL[record.direction]}で、入力値との比較は「${TARGET_STATUS[evaluateTarget(record)]}」です。`;
  return `${siteName}の${record.reportingYear}年・${record.boundary}について、${metric.label}は${actual}です。${target}`;
}

/** 開示の下書きへ出す物理指標の文案。確認時点から変わったものは pending に回す。 */
export function physicalDisclosureBundle(records: EnvironmentalTarget[], siteNames: Map<string, string>, claims: DisclosureClaim[] = []) {
  const reviewed: string[] = [];
  const pending: string[] = [];
  for (const record of records.filter((item) => !item.archived)) {
    const siteName = siteNames.get(record.siteId);
    const label = `${siteName ?? record.siteId} / ${METRIC_BY_ID.get(record.metricId)!.label} / ${record.reportingYear}年 / ${record.boundary}`;
    const note = record.disclosureNote;
    if (!note || siteName === undefined || record.current === null || !disclosureNoteCurrent(record, siteName, claims)) {
      pending.push(label);
      continue;
    }
    const linkedClaim = note.linkedClaim
      ? [`確認した既存主張: ${note.linkedClaim.id} / ${note.linkedClaim.sourceDocument} / ${note.linkedClaim.sourcePageOrSection}`]
      : [];
    reviewed.push(
      [
        note.text,
        ...linkedClaim,
        `対象: ${label}`,
        `実測根拠: ${record.evidence}`,
        `目標根拠: ${record.targetBasis || "目標未設定"}`,
        `確認日: ${record.measuredOn}`,
        `文案確認: ${formatJstDateTime(note.confirmedAt)}（日本時間）`,
        `確認理由: ${note.reason}`,
        `根拠レコード: ${record.id} / 版: ${record.revision}`,
      ].join("\n")
    );
  }
  return { text: reviewed.join("\n\n"), count: reviewed.length, pending };
}
