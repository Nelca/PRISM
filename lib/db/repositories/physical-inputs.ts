/** 追記専用の物理入力バッチ、現在有効なバッチ、算定行ステータスの読み書き。 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type {
  LandConversionInput,
  LandOccupationInput,
  PhysicalQuantityInput,
  PollutionReleaseInput,
  WasteQuantityInput,
} from "@core/types/valuation";
import type { PrtrImportBatch, PrtrNormalizedRecord } from "@/lib/intake/prtr";
import { getDb } from "../client";
import type { DbExecutor } from "../client";
import { calculationLineItem, inputBatch, interactionEvent, physicalInputRecord } from "../schema";

export type CalculationLineStatus = "calculated" | "unmapped" | "transfer_only" | "blocked";

export interface AppendCalculationLineItemInput {
  id: string;
  inputRecordId: string;
  materialIssueId?: string;
  methodId: string;
  status: CalculationLineStatus;
  factorId?: string;
  mappingId?: string;
  valuationRecordId?: string;
  amount?: number;
  reason?: string;
  data?: Record<string, unknown>;
}

export interface StoredInputBatch {
  id: string;
  category: string;
  sourceKind: string;
  schemaVersion: string;
  dataVersion: string;
  reportingYear: number | null;
  sourceManifest: unknown;
  createdAt: string;
}

export interface StoredPhysicalInputRecord {
  batchId: string;
  id: string;
  siteId: string;
  category: string;
  physicalQuantity: number | null;
  unit: string;
  calculationEligibility: "eligible" | "transfer_only" | "blocked";
  sourceRecordHash: string;
  sourceLineNumber: number;
  data: Record<string, unknown>;
}

export interface CustomerCategoryInputBatch {
  id: string;
  category: "waste" | "land_use";
  sourceKind: "customer_csv";
  schemaVersion: "customer-waste-csv-v1" | "customer-land-use-csv-v1";
  dataVersion: string;
  sourceManifest: Record<string, unknown>;
  records: Array<{
    id: string;
    sourceLineNumber: number;
    input: WasteQuantityInput | LandConversionInput | LandOccupationInput;
  }>;
}

const INSERT_CHUNK_SIZE = 500;

function chunks<T>(values: T[], size = INSERT_CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function toStoredBatch(row: typeof inputBatch.$inferSelect): StoredInputBatch {
  return {
    id: row.id,
    category: row.category,
    sourceKind: row.sourceKind,
    schemaVersion: row.schemaVersion,
    dataVersion: row.dataVersion,
    reportingYear: row.reportingYear,
    sourceManifest: row.sourceManifest,
    createdAt: row.createdAt.toISOString(),
  };
}

function toStoredRecord(row: typeof physicalInputRecord.$inferSelect): StoredPhysicalInputRecord {
  return {
    batchId: row.batchId,
    id: row.id,
    siteId: row.siteId,
    category: row.category,
    physicalQuantity: row.physicalQuantity,
    unit: row.unit,
    calculationEligibility: row.calculationEligibility as StoredPhysicalInputRecord["calculationEligibility"],
    sourceRecordHash: row.sourceRecordHash,
    sourceLineNumber: row.sourceLineNumber,
    data: row.data as Record<string, unknown>,
  };
}

/**
 * 検証済みPRTRバッチと正規化行を保存し、同じトランザクションで有効化イベントを追記する。
 * parserが1件でもエラーを返した場合はこの関数を呼ばない。DBエラー時も全行がrollbackされる。
 */
export async function appendPhysicalInputBatch(
  tenantId: string,
  batch: PrtrImportBatch,
  options: { actor: string; createdAt?: Date },
  db?: DbExecutor
): Promise<string> {
  const write = async (executor: DbExecutor) => {
    await executor.insert(inputBatch).values({
      id: batch.id,
      tenantId,
      category: batch.category,
      sourceKind: batch.sourceKind,
      schemaVersion: batch.schemaVersion,
      dataVersion: batch.dataVersion,
      reportingYear: batch.reportingYear,
      sourceManifest: batch.sourceManifest,
      createdAt: options.createdAt,
    });

    const rows = batch.records.map((record) => ({
      batchId: batch.id,
      tenantId,
      id: record.id,
      siteId: record.siteId,
      category: batch.category,
      physicalQuantity: record.quantityKg,
      unit: "kg",
      calculationEligibility: record.calculationEligibility,
      sourceRecordHash: record.sourceRecordHash,
      sourceLineNumber: record.sourceLineNumber,
      data: record,
      createdAt: options.createdAt,
    }));
    for (const group of chunks(rows)) {
      if (group.length > 0) await executor.insert(physicalInputRecord).values(group);
    }

    await executor.insert(interactionEvent).values({
      id: `ie-${crypto.randomUUID()}`,
      tenantId,
      createdAt: options.createdAt,
      actor: options.actor,
      kind: "input_batch_activation",
      subjectId: batch.category,
      payload: {
        batchId: batch.id,
        dataVersion: batch.dataVersion,
        sourceKind: batch.sourceKind,
        recordCount: batch.records.length,
        logMessage: `PRTR物理入力バッチ${batch.dataVersion}を有効化(${batch.records.length}行)`,
      },
    });
  };

  if (db) await write(db);
  else await getDb().transaction(write);
  return batch.id;
}

/** 検証済みの顧客提供廃棄物・土地利用CSVを原本なしで追記し、有効化する。 */
export async function appendCustomerCategoryInputBatch(
  tenantId: string,
  batch: CustomerCategoryInputBatch,
  options: { actor: string; createdAt?: Date },
  db?: DbExecutor
): Promise<string> {
  if (batch.records.some((record) => record.input.category !== batch.category)) {
    throw new Error("入力バッチのカテゴリと物理入力のカテゴリが一致しません。");
  }
  const recordIds = new Set(batch.records.map((record) => record.id));
  if (recordIds.size !== batch.records.length) throw new Error("入力バッチ内のレコードIDが重複しています。");

  const write = async (executor: DbExecutor) => {
    await executor.insert(inputBatch).values({
      id: batch.id,
      tenantId,
      category: batch.category,
      sourceKind: batch.sourceKind,
      schemaVersion: batch.schemaVersion,
      dataVersion: batch.dataVersion,
      reportingYear: null,
      sourceManifest: batch.sourceManifest,
      createdAt: options.createdAt,
    });
    const rows = batch.records.map(({ id, sourceLineNumber, input }) => ({
      batchId: batch.id,
      tenantId,
      id,
      siteId: input.siteId,
      category: batch.category,
      physicalQuantity: input.physicalQuantity,
      unit: input.unit,
      calculationEligibility: "eligible",
      sourceRecordHash: input.sourceRecordHash,
      sourceLineNumber,
      data: input,
      createdAt: options.createdAt,
    }));
    for (const group of chunks(rows)) {
      if (group.length > 0) await executor.insert(physicalInputRecord).values(group);
    }
    const label = batch.category === "waste" ? "廃棄物" : "土地利用";
    await executor.insert(interactionEvent).values({
      id: `ie-${crypto.randomUUID()}`,
      tenantId,
      createdAt: options.createdAt,
      actor: options.actor,
      kind: "input_batch_activation",
      subjectId: batch.category,
      payload: {
        batchId: batch.id,
        dataVersion: batch.dataVersion,
        sourceKind: batch.sourceKind,
        recordCount: batch.records.length,
        logMessage: `${label}物理入力バッチ${batch.dataVersion}を有効化(${batch.records.length}行)`,
      },
    });
  };

  if (db) await write(db);
  else await getDb().transaction(write);
  return batch.id;
}

export async function listInputBatches(
  tenantId: string,
  category?: string,
  db: DbExecutor = getDb()
): Promise<StoredInputBatch[]> {
  const condition = category
    ? and(eq(inputBatch.tenantId, tenantId), eq(inputBatch.category, category))
    : eq(inputBatch.tenantId, tenantId);
  const rows = await db.select().from(inputBatch).where(condition).orderBy(desc(inputBatch.createdAt));
  return rows.map(toStoredBatch);
}

export async function getActiveInputBatch(
  tenantId: string,
  category: string,
  db: DbExecutor = getDb()
): Promise<StoredInputBatch | null> {
  const activations = await db
    .select({ payload: interactionEvent.payload })
    .from(interactionEvent)
    .where(
      and(
        eq(interactionEvent.tenantId, tenantId),
        eq(interactionEvent.kind, "input_batch_activation"),
        eq(interactionEvent.subjectId, category)
      )
    )
    .orderBy(desc(interactionEvent.createdAt), desc(interactionEvent.id))
    .limit(1);
  const batchId = (activations[0]?.payload as { batchId?: unknown } | undefined)?.batchId;
  if (typeof batchId !== "string") return null;
  const rows = await db
    .select()
    .from(inputBatch)
    .where(and(eq(inputBatch.tenantId, tenantId), eq(inputBatch.id, batchId), eq(inputBatch.category, category)))
    .limit(1);
  return rows[0] ? toStoredBatch(rows[0]) : null;
}

/** 全カテゴリについて、最新activationが指すバッチを1件ずつ返す。 */
export async function listActiveInputBatches(
  tenantId: string,
  db: DbExecutor = getDb()
): Promise<StoredInputBatch[]> {
  const events = await db
    .select({ subjectId: interactionEvent.subjectId, payload: interactionEvent.payload })
    .from(interactionEvent)
    .where(and(eq(interactionEvent.tenantId, tenantId), eq(interactionEvent.kind, "input_batch_activation")))
    .orderBy(desc(interactionEvent.createdAt), desc(interactionEvent.id));
  const batchIds: string[] = [];
  const seenCategories = new Set<string>();
  for (const event of events) {
    const batchId = (event.payload as { batchId?: unknown }).batchId;
    if (!seenCategories.has(event.subjectId) && typeof batchId === "string") {
      seenCategories.add(event.subjectId);
      batchIds.push(batchId);
    }
  }
  if (batchIds.length === 0) return [];
  const rows = await db
    .select()
    .from(inputBatch)
    .where(and(eq(inputBatch.tenantId, tenantId), inArray(inputBatch.id, batchIds)));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return batchIds.flatMap((id) => {
    const row = rowById.get(id);
    return row ? [toStoredBatch(row)] : [];
  });
}

/** category省略時は、カテゴリごとの最新activationから有効行だけを合成する。 */
export async function listActivePhysicalInputRecords(
  tenantId: string,
  category?: string,
  db: DbExecutor = getDb()
): Promise<StoredPhysicalInputRecord[]> {
  if (category) {
    const active = await getActiveInputBatch(tenantId, category, db);
    if (!active) return [];
    const rows = await db
      .select()
      .from(physicalInputRecord)
      .where(and(eq(physicalInputRecord.tenantId, tenantId), eq(physicalInputRecord.batchId, active.id)))
      .orderBy(asc(physicalInputRecord.sourceLineNumber), asc(physicalInputRecord.id));
    return rows.map(toStoredRecord);
  }

  const batchIds = (await listActiveInputBatches(tenantId, db)).map((batch) => batch.id);
  if (batchIds.length === 0) return [];
  const rows = await db
    .select()
    .from(physicalInputRecord)
    .where(and(eq(physicalInputRecord.tenantId, tenantId), inArray(physicalInputRecord.batchId, batchIds)))
    .orderBy(asc(physicalInputRecord.siteId), asc(physicalInputRecord.sourceLineNumber), asc(physicalInputRecord.id));
  return rows.map(toStoredRecord);
}

function storedPrtrToCore(record: StoredPhysicalInputRecord): PollutionReleaseInput | null {
  if (record.category !== "pollution" || record.physicalQuantity === null) return null;
  const data = record.data as unknown as PrtrNormalizedRecord;
  return {
    category: "pollution",
    physicalQuantity: record.physicalQuantity,
    unit: "kg",
    siteId: record.siteId,
    sourceRegion: "JP",
    targetRegion: "JP",
    reportingYear: data.reportingYear,
    prtrListVersion: data.prtrListVersion,
    facilityId: data.facilityId,
    prtrSubstanceCode: data.prtrSubstanceCode,
    casRns: data.casRns,
    releaseMedium: data.releaseMedium,
    sourceKind: data.sourceKind,
    sourceRecordId: data.sourceRecordId,
    sourceRecordHash: data.sourceRecordHash,
  };
}

/** パイプライン入力へ渡せる数値行。transferは媒体で識別し、coverage側で算定対象外にする。 */
export async function listActivePhysicalQuantityInputs(
  tenantId: string,
  db: DbExecutor = getDb()
): Promise<PhysicalQuantityInput[]> {
  const records = await listActivePhysicalInputRecords(tenantId, undefined, db);
  return records.map(storedPrtrToCore).filter((value): value is PollutionReleaseInput => value !== null);
}

export async function appendCalculationLineItems(
  tenantId: string,
  runId: string,
  items: AppendCalculationLineItemInput[],
  db: DbExecutor = getDb()
): Promise<void> {
  const rows = items.map((item) => ({
    runId,
    tenantId,
    id: item.id,
    inputRecordId: item.inputRecordId,
    materialIssueId: item.materialIssueId ?? null,
    methodId: item.methodId,
    status: item.status,
    factorId: item.factorId ?? null,
    mappingId: item.mappingId ?? null,
    valuationRecordId: item.valuationRecordId ?? null,
    amount: item.amount ?? null,
    reason: item.reason ?? null,
    data: item.data ?? {},
  }));
  for (const group of chunks(rows)) {
    if (group.length > 0) await db.insert(calculationLineItem).values(group);
  }
}

export async function listCalculationLineItems(
  tenantId: string,
  runId: string,
  db: DbExecutor = getDb()
): Promise<Array<AppendCalculationLineItemInput & { runId: string }>> {
  const rows = await db
    .select()
    .from(calculationLineItem)
    .where(and(eq(calculationLineItem.tenantId, tenantId), eq(calculationLineItem.runId, runId)))
    .orderBy(asc(calculationLineItem.createdAt), asc(calculationLineItem.id));
  return rows.map((row) => ({
    runId: row.runId,
    id: row.id,
    inputRecordId: row.inputRecordId,
    ...(row.materialIssueId ? { materialIssueId: row.materialIssueId } : {}),
    methodId: row.methodId,
    status: row.status as CalculationLineStatus,
    ...(row.factorId ? { factorId: row.factorId } : {}),
    ...(row.mappingId ? { mappingId: row.mappingId } : {}),
    ...(row.valuationRecordId ? { valuationRecordId: row.valuationRecordId } : {}),
    ...(row.amount !== null ? { amount: row.amount } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
    data: row.data as Record<string, unknown>,
  }));
}
