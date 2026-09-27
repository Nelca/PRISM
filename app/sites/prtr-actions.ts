"use server";

import { revalidatePath } from "next/cache";
import { SITE_ROWS } from "@/lib/demo/company";
import { getDb, getTenantId, lockTenantForWrite } from "@/lib/db/client";
import { appendPhysicalInputBatch } from "@/lib/db/repositories/physical-inputs";
import { listSiteEntries } from "@/lib/db/repositories/sites";
import { loadPrtrDataset, type PrtrSourceFile } from "@/lib/intake/prtr";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";

const ACTOR = "宮里";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES = 45 * 1024 * 1024;

export interface PrtrImportFormState {
  errors?: string[];
  batchId?: string;
  importedRecordCount?: number;
  eligibleRecordCount?: number;
  transferOnlyRecordCount?: number;
  notReportedRecordCount?: number;
}

async function readFile(formData: FormData, field: string, label: string): Promise<{ file?: PrtrSourceFile; error?: string }> {
  const value = formData.get(field);
  if (!(value instanceof File) || value.size === 0) return { error: `${label}が選択されていません。` };
  if (value.size > MAX_FILE_BYTES) return { error: `${label}は15MB以下にしてください。対象施設行へ絞ってから取り込んでください。` };
  return { file: { name: value.name, bytes: new Uint8Array(await value.arrayBuffer()) } };
}

function parseReportingYear(formData: FormData): number | null {
  const value = String(formData.get("reportingYear") ?? "").trim();
  return /^\d{4}$/.test(value) ? Number(value) : null;
}

/** Server Actionは直接POST可能なので、テナント解決とsite所有範囲の照合を必ずサーバー側で行う。 */
export async function importPrtrDatasetAction(
  _previousState: PrtrImportFormState,
  formData: FormData
): Promise<PrtrImportFormState> {
  const [honshi, besshi, otherIndustries, facilityCrosswalk] = await Promise.all([
    readFile(formData, "honshiFile", "本紙.txt"),
    readFile(formData, "besshiFile", "別紙.txt"),
    readFile(formData, "otherIndustriesFile", "他業種.txt"),
    readFile(formData, "facilityCrosswalkFile", "facility-crosswalk.csv"),
  ]);
  const fileErrors = [honshi.error, besshi.error, otherIndustries.error, facilityCrosswalk.error].filter(
    (error): error is string => error !== undefined
  );
  const totalBytes = [honshi.file, besshi.file, otherIndustries.file, facilityCrosswalk.file]
    .reduce((sum, file) => sum + (file?.bytes.byteLength ?? 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) fileErrors.push("4ファイルの合計は45MB以下にしてください。対象施設行へ絞ってから取り込んでください。");
  const reportingYear = parseReportingYear(formData);
  if (reportingYear === null) fileErrors.push("排出年度は西暦4桁で入力してください。");
  const prtrListVersion = String(formData.get("prtrListVersion") ?? "").trim();
  if (!prtrListVersion) fileErrors.push("PRTR対象物質リスト版を入力してください。");
  if (fileErrors.length > 0 || reportingYear === null) return { errors: fileErrors };

  const tenantId = await getTenantId();
  const userSites = await listSiteEntries(tenantId);
  const validSiteIds = new Set([...SITE_ROWS.map((site) => site.id), ...userSites.map((entry) => entry.row.id)]);
  const result = loadPrtrDataset({
    honshi: honshi.file!,
    besshi: besshi.file!,
    otherIndustries: otherIndustries.file!,
    facilityCrosswalk: facilityCrosswalk.file!,
    reportingYear,
    prtrListVersion,
    sourceKind: "public_prtr",
    validSiteIds,
  });
  if (!result.batch) return { errors: result.errors };

  try {
    await getDb().transaction(async (tx) => {
      // 同じテナントの入力切替とrun保存を直列化し、算定されていない有効バッチを残さない。
      await lockTenantForWrite(tx, tenantId);
      const currentSites = await listSiteEntries(tenantId, tx);
      const currentSiteIds = new Set([...SITE_ROWS.map((site) => site.id), ...currentSites.map((entry) => entry.row.id)]);
      const removedSiteIds = [...new Set(result.batch!.records.map((record) => record.siteId))].filter(
        (siteId) => !currentSiteIds.has(siteId)
      );
      if (removedSiteIds.length > 0) {
        throw new Error("PRTR検証後に対象拠点が変更されました。");
      }
      await appendPhysicalInputBatch(tenantId, result.batch!, { actor: ACTOR }, tx);
      await executeAndPersistRun(tenantId, tx);
    });
  } catch (cause) {
    console.error("[prtr-import] 検証済みPRTRバッチを保存できませんでした:", cause);
    return { errors: ["PRTRデータを保存できませんでした。データは一件も保存していません。時間を置いて再度お試しください。"] };
  }

  revalidatePath("/", "layout");
  return {
    batchId: result.batch.id,
    importedRecordCount: result.batch.records.length,
    eligibleRecordCount: result.batch.records.filter((record) => record.calculationEligibility === "eligible").length,
    transferOnlyRecordCount: result.batch.records.filter((record) => record.calculationEligibility === "transfer_only").length,
    notReportedRecordCount: result.batch.records.filter((record) => record.measurementStatus === "not_reported").length,
  };
}
