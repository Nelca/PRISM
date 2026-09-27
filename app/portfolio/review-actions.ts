"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { allSiteRows } from "@/lib/demo/company";
import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { parseRequiredNumber } from "@/lib/forms/number";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import type { EnvironmentalTarget, ResourceCostCase, TargetDisclosureNote } from "@/lib/environment/metrics";
import {
  claimFingerprint,
  decisionFingerprint,
  resourceCostComparison,
  resourceInvestmentComparison,
  supportsResourceCosts,
  targetFingerprint,
} from "@/lib/environment/review";
import { ACTOR, listAllSiteRows, parseReason } from "./action-support";

export interface ReviewState {
  error?: string;
  saved?: boolean;
}

type Parsed<T> = { value: T } | { error: string };

const COST_FIELDS = [
  ["baselineUnitCost", "現在の単価"],
  ["alternativeUnitCost", "対策後の単価"],
  ["alternativeQuantity", "対策後の年間数量"],
  ["additionalAnnualCost", "追加年間費用"],
  ["initialInvestment", "初期費用"],
] as const;

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function lengthWithin(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max;
}

function findDecision(result: DemoPipelineResult, siteId: string, decisionId: string) {
  return result.decisions.find((entry) => entry.siteId === siteId && entry.decision.decisionRecord.id === decisionId)?.decision.decisionRecord;
}

/** 資源対策の費用前提(任意で複数年の判定と既存の投資案件への対応付け)。 */
async function parseCostCase(
  form: FormData,
  existing: EnvironmentalTarget,
  base: Pick<ResourceCostCase, "sourceFingerprint" | "confirmedAt">,
  latestResult: () => Promise<DemoPipelineResult>
): Promise<Parsed<ResourceCostCase>> {
  if (!supportsResourceCosts(existing)) return { error: "調達量または一次鉱物投入量の指標で利用してください。" };
  const values = {} as Record<(typeof COST_FIELDS)[number][0], number>;
  for (const [key, label] of COST_FIELDS) {
    const parsed = parseRequiredNumber(form.get(key), { label, min: 0, max: Number.MAX_SAFE_INTEGER });
    if ("error" in parsed) return parsed;
    values[key] = parsed.value;
  }
  const name = text(form, "name");
  const evidence = text(form, "evidence");
  if (!lengthWithin(name, 1, 200) || !lengthWithin(evidence, 8, 4000)) {
    return { error: "対策案名（200文字以内）と単価・数量・費用の根拠（8〜4000文字）を入力してください。" };
  }
  const scenario: ResourceCostCase = { name, ...values, evidence, ...base };

  if (form.get("investmentEnabled") === "on") {
    const horizon = parseRequiredNumber(form.get("horizon"), { label: "評価期間", min: 1, max: 50, integer: true });
    if ("error" in horizon) return horizon;
    const rate = parseRequiredNumber(form.get("discountRatePercent"), { label: "割引率", min: 0, max: 100 });
    if ("error" in rate) return rate;
    const threshold = parseRequiredNumber(form.get("approvalThreshold"), {
      label: "承認ライン",
      min: -Number.MAX_SAFE_INTEGER,
      max: Number.MAX_SAFE_INTEGER,
    });
    if ("error" in threshold) return threshold;
    const rationale = text(form, "investmentRationale");
    if (!lengthWithin(rationale, 8, 4000) || form.get("investmentConfirmed") !== "on") {
      return { error: "期間・割引率・承認ラインの根拠と、費用の重複がないことを確認してください。" };
    }
    scenario.investment = { horizon: horizon.value, discountRatePercent: rate.value, approvalThreshold: threshold.value, rationale };
    if (!resourceInvestmentComparison(existing, scenario)) return { error: "複数年の試算が計算範囲を超えています。" };

    const decisionId = text(form, "decisionId");
    if (decisionId) {
      const decision = findDecision(await latestResult(), existing.siteId, decisionId);
      if (!decision || decisionFingerprint(decision) !== text(form, "decisionFingerprint") || form.get("decisionConfirmed") !== "on") {
        return { error: "案件の前提が変更されたか未確認です。再読込し、年度・範囲・二重計上の扱いを確認してください。" };
      }
      scenario.investment.linkedDecision = { id: decision.id, fingerprint: decisionFingerprint(decision) };
    }
  }
  if (!resourceCostComparison(existing, scenario)) return { error: "計算可能な金額の範囲を超えています。単位と入力値を確認してください。" };
  return { value: scenario };
}

/** 物理指標の開示文案(任意でPDF取込等の既存主張への対応付け)。 */
async function parseDisclosureNote(
  form: FormData,
  base: Pick<TargetDisclosureNote, "siteName" | "reason" | "sourceFingerprint" | "confirmedAt">,
  latestResult: () => Promise<DemoPipelineResult>
): Promise<Parsed<TargetDisclosureNote>> {
  const disclosureText = text(form, "disclosureText");
  if (!lengthWithin(disclosureText, 8, 4000)) return { error: "文案を8〜4000文字で記入してください。" };
  const note: TargetDisclosureNote = { ...base, text: disclosureText };

  const claimId = text(form, "claimId");
  if (claimId) {
    const claim = (await latestResult()).disclosureClaims.find((item) => item.id === claimId);
    if (!claim || claimFingerprint(claim) !== text(form, "claimFingerprint") || form.get("claimConfirmed") !== "on") {
      return { error: "既存主張が変更されたか未確認です。再読込し、原文・期間・範囲・単位との対応を確認してください。" };
    }
    note.linkedClaim = {
      id: claim.id,
      fingerprint: claimFingerprint(claim),
      sourceDocument: claim.sourceDocument,
      sourcePageOrSection: claim.sourcePageOrSection,
    };
  }
  return { value: note };
}

/**
 * 今回確認した関連案件・主張が、書込直前(ロック下で再計算した結果)でも変わっていないか。
 * もう一方の確認記録は今回の保存対象ではないため検証しない(古ければ再確認待ちとして表示される)。
 */
function assertLinkUnchanged(kind: "cost" | "disclosure", record: EnvironmentalTarget, candidate: DemoPipelineResult): void {
  if (kind === "cost") {
    const link = record.costCase?.investment?.linkedDecision;
    const decision = link && findDecision(candidate, record.siteId, link.id);
    if (link && (!decision || decisionFingerprint(decision) !== link.fingerprint)) throw new Error("投資案件の前提が更新されました。");
  } else {
    const link = record.disclosureNote?.linkedClaim;
    if (link && !candidate.disclosureClaims.some((claim) => claim.id === link.id && claimFingerprint(claim) === link.fingerprint)) {
      throw new Error("確認対象の主張が更新されました。");
    }
  }
}

export async function saveTargetReviewAction(_state: ReviewState, form: FormData): Promise<ReviewState> {
  const kind = form.get("kind");
  if (kind !== "cost" && kind !== "disclosure") return { error: "保存する内容が不正です。" };

  const tenantId = await getTenantId();
  const state = await loadInteractionState(tenantId);
  const existing = state.environmentalTargets.get(text(form, "targetId"));
  if (!existing || existing.archived || existing.revision !== text(form, "revision")) {
    return { error: "対象が更新されたか、保管されています。画面を再読込してください。" };
  }
  if (existing.current === null) return { error: "実測値と根拠を先に登録してください。" };
  const reason = parseReason(form, "確認理由");
  if ("error" in reason || form.get("confirmed") !== "on") {
    return { error: "範囲・期間・根拠を確認し、確認理由を8〜2000文字で入力してください。" };
  }
  const site = (await listAllSiteRows(tenantId)).find((row) => row.id === existing.siteId);
  if (!site) return { error: "対象拠点が存在しません。" };

  const confirmedAt = new Date().toISOString();
  const sourceFingerprint = targetFingerprint(existing);
  let cachedResult: Promise<DemoPipelineResult> | undefined;
  const latestResult = () => (cachedResult ??= getOrCreateLatestResult(tenantId));

  let record: EnvironmentalTarget = { ...existing, revision: randomUUID(), updatedAt: confirmedAt };
  if (kind === "cost") {
    const costCase = await parseCostCase(form, existing, { sourceFingerprint, confirmedAt }, latestResult);
    if ("error" in costCase) return costCase;
    record = { ...record, costCase: costCase.value };
  } else {
    const note = await parseDisclosureNote(form, { siteName: site.name, reason: reason.value, sourceFingerprint, confirmedAt }, latestResult);
    if ("error" in note) return note;
    record = { ...record, disclosureNote: note.value };
  }

  const outcome = await tryRunAndPersist(tenantId, {
    label: "環境指標の根拠確認",
    validateResult: (candidate) => assertLinkUnchanged(kind, record, candidate),
    userSites: (sites) => {
      // 文案は拠点名を含むため、確認中に拠点名が変わった場合も保存しない。
      const current = allSiteRows(sites).find((row) => row.id === record.siteId);
      if (!current || (kind === "disclosure" && current.name !== site.name)) throw new Error("対象拠点が存在しません。");
      return sites;
    },
    events: [
      {
        actor: ACTOR,
        kind: "environmental_target_update",
        subjectId: record.id,
        payload: {
          record,
          expectedRevision: existing.revision,
          reason: reason.value,
          logMessage: `${kind === "cost" ? "資源の対策費用" : "物理指標の開示文案"}を根拠と関連付けて確認。理由: ${reason.value}`,
        },
      },
    ],
  });
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath("/", "layout");
  return { saved: true };
}
