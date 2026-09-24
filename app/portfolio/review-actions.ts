"use server";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import { listSiteEntries } from "@/lib/db/repositories/sites";
import { SITE_ROWS } from "@/lib/demo/company";
import { parseRequiredNumber } from "@/lib/forms/number";
import { decisionFingerprint, claimFingerprint, resourceCostComparison, resourceInvestmentComparison, supportsResourceCosts, targetFingerprint, type ResourceCostCase } from "@/lib/environment/review";
import type { EnvironmentalTarget } from "@/lib/environment/metrics";
export interface ReviewState { error?: string; saved?: boolean; }
export async function saveTargetReviewAction(_state: ReviewState, form: FormData): Promise<ReviewState> {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const tenantId = await getTenantId();
  const state = await loadInteractionState(tenantId);
  const existing = state.environmentalTargets.get(text("targetId"));
  if (!existing || existing.archived || existing.revision !== text("revision")) return { error: "対象が更新されたか、保管されています。画面を再読込してください。" };
  if (existing.current === null) return { error: "実測値と根拠を先に登録してください。" };
  const reason = text("reason");
  if (reason.length < 8 || reason.length > 2000 || form.get("confirmed") !== "on") return { error: "範囲・期間・根拠を確認し、確認理由を8〜2000文字で入力してください。" };
  const site = [...SITE_ROWS, ...(await listSiteEntries(tenantId)).map((entry) => entry.row)].find((site) => site.id === existing.siteId);
  if (!site) return { error: "対象拠点が存在しません。" };
  const confirmedAt = new Date().toISOString();
  const sourceFingerprint = targetFingerprint(existing);
  let record: EnvironmentalTarget = { ...existing, revision: randomUUID(), updatedAt: confirmedAt };
  if (form.get("kind") === "cost") {
    if (!supportsResourceCosts(existing)) return { error: "調達量または一次鉱物投入量の指標で利用してください。" };
    const values: Record<string, number> = {};
    for (const [key, label] of [["baselineUnitCost", "現在の単価"], ["alternativeUnitCost", "対策後の単価"], ["alternativeQuantity", "対策後の年間数量"], ["additionalAnnualCost", "追加年間費用"], ["initialInvestment", "初期費用"]]) {
      const parsed = parseRequiredNumber(form.get(key), { label, min: 0, max: Number.MAX_SAFE_INTEGER });
      if ("error" in parsed) return parsed;
      values[key] = parsed.value;
    }
    if (!text("name") || text("name").length > 200 || text("evidence").length < 8 || text("evidence").length > 4000) return { error: "対策案名（200文字以内）と単価・数量・費用の根拠（8〜4000文字）を入力してください。" };
    const scenario: ResourceCostCase = { name: text("name"), baselineUnitCost: values.baselineUnitCost, alternativeUnitCost: values.alternativeUnitCost, alternativeQuantity: values.alternativeQuantity, additionalAnnualCost: values.additionalAnnualCost, initialInvestment: values.initialInvestment, evidence: text("evidence"), confirmedAt, sourceFingerprint };
    if (form.get("investmentEnabled") === "on") {
      const horizon = parseRequiredNumber(form.get("horizon"), { label: "評価期間", min: 1, max: 50 });
      const rate = parseRequiredNumber(form.get("discountRatePercent"), { label: "割引率", min: 0, max: 100 });
      const threshold = parseRequiredNumber(form.get("approvalThreshold"), { label: "承認ライン", min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER });
      if ("error" in horizon) return horizon;
      if ("error" in rate) return rate;
      if ("error" in threshold) return threshold;
      if (!Number.isInteger(horizon.value)) return { error: "評価期間は1〜50年の整数で入力してください。" };
      if (text("investmentRationale").length < 8 || text("investmentRationale").length > 4000 || form.get("investmentConfirmed") !== "on") return { error: "期間・割引率・承認ラインの根拠と、費用の重複がないことを確認してください。" };
      scenario.investment = { horizon: horizon.value, discountRatePercent: rate.value, approvalThreshold: threshold.value, rationale: text("investmentRationale") };
      if (!resourceInvestmentComparison(existing, scenario)) return { error: "複数年の試算が計算範囲を超えています。" };
      if (text("decisionId")) {
        const entry = (await getOrCreateLatestResult(tenantId)).decisions.find((item) => item.siteId === existing.siteId && item.decision.decisionRecord.id === text("decisionId"));
        if (!entry || decisionFingerprint(entry.decision.decisionRecord) !== text("decisionFingerprint") || form.get("decisionConfirmed") !== "on") return { error: "案件の前提が変更されたか未確認です。再読込し、年度・範囲・二重計上の扱いを確認してください。" };
        scenario.investment.linkedDecision = { id: entry.decision.decisionRecord.id, fingerprint: decisionFingerprint(entry.decision.decisionRecord) };
      }
    }
    if (!resourceCostComparison(existing, scenario)) return { error: "計算可能な金額の範囲を超えています。単位と入力値を確認してください。" };
    record = { ...record, costCase: scenario };
  } else if (form.get("kind") === "disclosure") {
    if (text("disclosureText").length < 8 || text("disclosureText").length > 4000) return { error: "文案を8〜4000文字で記入してください。" };
    record = { ...record, disclosureNote: { siteName: site.name, text: text("disclosureText"), reason, confirmedAt, sourceFingerprint } };
    if (text("claimId")) {
      const claim = (await getOrCreateLatestResult(tenantId)).disclosureClaims.find((item) => item.id === text("claimId"));
      if (!claim || claimFingerprint(claim) !== text("claimFingerprint") || form.get("claimConfirmed") !== "on") return { error: "既存主張が変更されたか未確認です。再読込し、原文・期間・範囲・単位との対応を確認してください。" };
      record.disclosureNote!.linkedClaim = { id: claim.id, fingerprint: claimFingerprint(claim), sourceDocument: claim.sourceDocument, sourcePageOrSection: claim.sourcePageOrSection };
    }

  } else return { error: "保存する内容が不正です。" };
  const result = await tryRunAndPersist(tenantId, { label: "環境指標の根拠確認", validateResult: (candidate) => { const decisionLink = record.costCase?.investment?.linkedDecision; if (form.get("kind") === "cost" && decisionLink && !candidate.decisions.some((entry) => entry.siteId === record.siteId && entry.decision.decisionRecord.id === decisionLink.id && decisionFingerprint(entry.decision.decisionRecord) === decisionLink.fingerprint)) throw new Error("投資案件の前提が更新されました。"); const link = record.disclosureNote?.linkedClaim; if (form.get("kind") === "disclosure" && link && !candidate.disclosureClaims.some((claim) => claim.id === link.id && claimFingerprint(claim) === link.fingerprint)) throw new Error("確認対象の主張が更新されました。"); }, userSites: (sites) => { if (![...SITE_ROWS, ...sites.map((site) => site.row)].some((currentSite) => currentSite.id === record.siteId && (form.get("kind") !== "disclosure" || currentSite.name === site.name))) throw new Error("対象拠点が存在しません。"); return sites; }, events: [{ actor: "宮里", kind: "environmental_target_update", subjectId: record.id, payload: { record, expectedRevision: existing.revision, reason, logMessage: `${form.get("kind") === "cost" ? "資源の対策費用" : "物理指標の開示文案"}を根拠と関連付けて確認。理由: ${reason}` } }] });
  if (!result.ok) return { error: result.message };
  revalidatePath("/", "layout");
  return { saved: true };
}
