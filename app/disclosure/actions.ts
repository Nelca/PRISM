"use server";

import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import { appendInteractionEvent } from "@/lib/db/repositories/interactions";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";
import { extractPdfText } from "@/lib/pdf/extract-pdf-text";
import { extractDisclosureClaims } from "@/lib/ai/extract-disclosure-claims";

const REVALIDATE_PATHS = ["/", "/sites", "/assessment", "/disclosure", "/ledger"];

const ACTOR = "宮里";

export interface DisclosureActionFormState {
  error?: string;
}

export interface PdfIntakeFormState {
  error?: string;
  extractedCount?: number;
  lowConfidenceCount?: number;
  failedPages?: number[];
}

/**
 * M7段階1・2:過去の統合報告書PDFからDisclosureClaimを抽出する(GAP-05)。
 * AIの役割は抽出に限定される(段階3・4はこの結果を既存のルールベース処理でそのまま評価する)。
 */
export async function extractDisclosurePdfAction(
  _prevState: PdfIntakeFormState,
  formData: FormData
): Promise<PdfIntakeFormState> {
  const file = formData.get("disclosurePdf");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "PDFファイルが選択されていません。" };
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const extraction = await extractPdfText(data);

  if (extraction.combinedText.trim().length === 0) {
    return {
      error:
        "PDFからテキストを抽出できませんでした(スキャン画像等でテキスト層が無い可能性があります)。" +
        (extraction.failedPages.length > 0
          ? `抽出できなかったページ: ${extraction.failedPages.join(", ")}`
          : ""),
    };
  }

  let claims;
  try {
    claims = await extractDisclosureClaims(file.name, `claim-pdf-${Date.now()}`, extraction.combinedText);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "AIによる抽出に失敗しました。" };
  }

  const tenantId = await getTenantId();
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "disclosure_pdf_extracted",
    subjectId: file.name,
    payload: {
      claims,
      logMessage: `PDF「${file.name}」からAIが${claims.length}件の主張を抽出`,
    },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);

  return {
    extractedCount: claims.length,
    lowConfidenceCount: claims.filter((c) => c.extractionConfidence === "low").length,
    failedPages: extraction.failedPages.length > 0 ? extraction.failedPages : undefined,
  };
}

/** ①主張を弱める(M7 D-4)。 */
export async function weakenClaimAction(
  _prevState: DisclosureActionFormState,
  formData: FormData
): Promise<DisclosureActionFormState> {
  const claimId = String(formData.get("claimId") ?? "");
  const newText = String(formData.get("newText") ?? "").trim();
  if (!claimId || !newText) {
    return { error: "修正後の記載内容を入力してください。" };
  }

  const tenantId = await getTenantId();
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "disclosure_claim_override",
    subjectId: claimId,
    payload: { text: newText, logMessage: `記載内容を弱める表現に修正(claim: ${claimId})` },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}

/** ②根拠を追加取得する(深掘りへの導線)。M2の深度を手動昇格させる。 */
export async function acquireEvidenceAction(
  _prevState: DisclosureActionFormState,
  formData: FormData
): Promise<DisclosureActionFormState> {
  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) {
    return { error: "対象拠点を指定してください。" };
  }

  const tenantId = await getTenantId();
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "depth_override",
    subjectId: `${siteId}-mi-water`,
    payload: {
      mode: "promote",
      logMessage: `開示内容の確認への対応として、${siteId}の評価を詳細評価キューへ追加`,
    },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}

/** ③意図的判断として記録する(理由は必須。デフォルトを設けない。M7 D-4)。 */
export async function recordIntentionalDecisionAction(
  _prevState: DisclosureActionFormState,
  formData: FormData
): Promise<DisclosureActionFormState> {
  const claimId = String(formData.get("claimId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!claimId || !reason) {
    return { error: "判断の理由を入力してください。" };
  }

  const tenantId = await getTenantId();
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "intentional_decision",
    subjectId: claimId,
    payload: { reason, logMessage: `判断の理由を記録(claim: ${claimId}):${reason}` },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}
