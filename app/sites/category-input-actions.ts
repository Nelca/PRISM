"use server";

import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { PhysicalQuantityInput, WasteQuantityInput } from "@core/types/valuation";
import { getDb, getTenantId } from "@/lib/db/client";
import {
  appendCustomerCategoryInputBatch,
  listActivePhysicalInputRecords,
  type CustomerCategoryInputBatch,
  type StoredPhysicalInputRecord,
} from "@/lib/db/repositories/physical-inputs";
import { listSiteEntries } from "@/lib/db/repositories/sites";
import { SITE_ROWS } from "@/lib/demo/company";
import { parseLandUseCsv, parseWasteCsv } from "@/lib/intake/category-inputs";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";

const ACTOR = "宮里";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
export interface CategoryInputImportState {
  errors?: string[];
  batchId?: string;
  importedRecordCount?: number;
}

type CustomerInput = Extract<PhysicalQuantityInput, { category: "waste" | "land_use" }>;

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function activeTransferLinks(records: StoredPhysicalInputRecord[]): Map<string, { siteId: string; medium: string }> {
  const links = new Map<string, { siteId: string; medium: string }>();
  for (const record of records) {
    const data = record.data as Record<string, unknown>;
    if (data.releaseMedium !== "sewer" && data.releaseMedium !== "offsite_waste") continue;
    const target = { siteId: record.siteId, medium: data.releaseMedium };
    links.set(record.id, target);
    // 元PRTRの行ID単独はsewer/offsite_wasteで重複するため、媒体を必須にした監査用キーだけを許可する。
    if (typeof data.sourceRecordId === "string") {
      links.set(`${data.sourceRecordId}:${data.releaseMedium}`, target);
    }
  }
  return links;
}

function contextErrors(
  inputs: CustomerInput[],
  validSiteIds: ReadonlySet<string>,
  pollutionRecords: StoredPhysicalInputRecord[]
): string[] {
  const errors: string[] = [];
  inputs.forEach((input, index) => {
    if (!validSiteIds.has(input.siteId)) errors.push(`${index + 2}行目: site_id "${input.siteId}" は登録済み拠点ではありません。`);
  });
  const wasteInputs = inputs.filter((input): input is WasteQuantityInput => input.category === "waste");
  const validTransfers = activeTransferLinks(pollutionRecords);
  const seenLinks = new Map<string, number>();
  wasteInputs.forEach((input, index) => {
    const link = input.linkedPrtrTransferInputId;
    if (!link) return;
    const transfer = validTransfers.get(link);
    if (!transfer) {
      errors.push(`${index + 2}行目: linked_prtr_transfer_input_id "${link}" は現在有効なPRTR移動量に一致しません。`);
    } else if (transfer.siteId !== input.siteId) {
      errors.push(`${index + 2}行目: linked_prtr_transfer_input_id "${link}" は別の拠点のPRTR移動量です。`);
    }
    const firstLine = seenLinks.get(link);
    if (firstLine !== undefined) errors.push(`${index + 2}行目: PRTR移動量 "${link}" は${firstLine}行目でも使用されています。`);
    else seenLinks.set(link, index + 2);
  });
  return errors;
}

async function importCategoryCsv(
  formData: FormData,
  category: "waste" | "land_use"
): Promise<CategoryInputImportState> {
  const value = formData.get("categoryFile");
  if (!(value instanceof File) || value.size === 0) return { errors: ["CSVファイルが選択されていません。"] };
  if (value.size > MAX_FILE_BYTES) return { errors: ["CSVファイルは20MB以下にしてください。"] };

  let bytes: Uint8Array;
  let text: string;
  try {
    bytes = new Uint8Array(await value.arrayBuffer());
    text = decodeUtf8(bytes);
  } catch {
    return { errors: ["CSVファイルをUTF-8として読み取れませんでした。文字コードをUTF-8にして保存し直してください。"] };
  }
  const parsed = category === "waste" ? parseWasteCsv(text) : parseLandUseCsv(text);
  if (!parsed.inputs) return { errors: parsed.errors };
  const inputs = parsed.inputs as CustomerInput[];
  const tenantId = await getTenantId();
  const fileHash = sha256(bytes);
  const batchId = `input-batch-${randomUUID()}`;
  const batch: CustomerCategoryInputBatch = {
    id: batchId,
    category,
    sourceKind: "customer_csv",
    schemaVersion: category === "waste" ? "customer-waste-csv-v1" : "customer-land-use-csv-v1",
    dataVersion: `${category}-${fileHash.slice(0, 16)}`,
    sourceManifest: {
      role: category,
      fileName: value.name,
      sha256: fileHash,
      rowCount: inputs.length,
      encoding: "UTF-8",
    },
    records: inputs.map((input, index) => ({
      id: `physical-input-${randomUUID()}`,
      sourceLineNumber: index + 2,
      input,
    })),
  };

  try {
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`);
      const sites = await listSiteEntries(tenantId, tx);
      const pollutionRecords = await listActivePhysicalInputRecords(tenantId, "pollution", tx);
      const validSiteIds = new Set([...SITE_ROWS.map((site) => site.id), ...sites.map((entry) => entry.row.id)]);
      const errors = contextErrors(inputs, validSiteIds, pollutionRecords);
      if (errors.length > 0) throw new CategoryContextError(errors);
      await appendCustomerCategoryInputBatch(tenantId, batch, { actor: ACTOR }, tx);
      await executeAndPersistRun(tenantId, tx);
    });
  } catch (cause) {
    if (cause instanceof CategoryContextError) return { errors: cause.errors };
    console.error(`[category-input-import] ${category} CSVを保存・算定できませんでした:`, cause);
    return { errors: ["CSVを保存・算定できませんでした。データは一件も保存していません。時間を置いて再度お試しください。"] };
  }

  revalidatePath("/", "layout");
  return { batchId, importedRecordCount: inputs.length };
}

class CategoryContextError extends Error {
  constructor(readonly errors: string[]) {
    super("カテゴリ入力の参照整合性検証に失敗しました。");
  }
}

export async function importWasteCsvAction(
  _previousState: CategoryInputImportState,
  formData: FormData
): Promise<CategoryInputImportState> {
  return importCategoryCsv(formData, "waste");
}

export async function importLandUseCsvAction(
  _previousState: CategoryInputImportState,
  formData: FormData
): Promise<CategoryInputImportState> {
  return importCategoryCsv(formData, "land_use");
}
