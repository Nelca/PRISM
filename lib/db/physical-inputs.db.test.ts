import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "./client";
import {
  appendCalculationLineItems,
  appendCustomerCategoryInputBatch,
  appendPhysicalInputBatch,
  getActiveInputBatch,
  listActiveInputBatches,
  listActivePhysicalInputRecords,
  listCalculationLineItems,
  listInputBatches,
} from "./repositories/physical-inputs";
import type { PrtrImportBatch, PrtrNormalizedRecord } from "@/lib/intake/prtr";
import type { WasteQuantityInput } from "@core/types/valuation";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";
import { getLatestRun } from "./repositories/runs";
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";

const TENANT = `physical-input-test-${Date.now()}`;

function record(id: string, quantityKg: number): PrtrNormalizedRecord {
  return {
    id,
    physicalQuantityId: id,
    siteId: "site-042",
    reportingYear: 2024,
    prtrListVersion: "2023-515",
    facilityId: "FAC-1",
    businessEntityName: "Example",
    facilityName: "Plant",
    prefecture: "Aichi",
    municipality: "Nagoya",
    prtrSubstanceCode: "438",
    substanceName: "Test",
    casRns: [],
    releaseMedium: "air",
    quantityKg,
    originalQuantity: quantityKg,
    originalUnit: "kg",
    measurementStatus: "reported",
    calculationEligibility: "eligible",
    sourceKind: "public_prtr",
    sourceRecordId: "FAC-1:1",
    sourceRecordHash: "a".repeat(64),
    sourceLineNumber: 1,
  };
}

function batch(id: string, records: PrtrNormalizedRecord[]): PrtrImportBatch {
  return {
    id,
    category: "pollution",
    sourceKind: "public_prtr",
    schemaVersion: "env-prtr-official-2023-v1",
    dataVersion: "PRTR-2024",
    reportingYear: 2024,
    sourceManifest: [],
    records,
  };
}

afterAll(async () => closeDb());

describe("追記専用の物理入力バッチ", () => {
  it("追加カテゴリ未登録時は架空サンプル3カテゴリをrunへ入れ、DBの入力行とは混同しない", async () => {
    const tenantId = `${TENANT}-demo-fallback`;
    const result = await executeAndPersistRun(tenantId);

    expect(result.valuation.valuationRecordsByMaterialIssue["site-042-mi-pollution"]).toHaveLength(2);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-042-mi-waste"]).toHaveLength(2);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-042-mi-land_use"]).toHaveLength(4);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-070-mi-pollution"]).toHaveLength(1);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-070-mi-waste"]).toHaveLength(1);
    expect(result.valuation.valuationRecordsByMaterialIssue["site-070-mi-land_use"]).toHaveLength(2);
    expect(result.valuation.coverageByMaterialIssue["site-042-mi-pollution"].sourceKind).toBe("demo_sample");
    expect(await listActiveInputBatches(tenantId)).toEqual([]);
    const latest = await getLatestRun(tenantId);
    expect(await listCalculationLineItems(tenantId, latest!.id)).toEqual([]);
  });

  it("カテゴリごとの最新activationだけを現在入力として読む", async () => {
    const first = batch(`batch-first-${Date.now()}`, [record(`record-first-${Date.now()}`, 1)]);
    const second = batch(`batch-second-${Date.now()}`, [record(`record-second-${Date.now()}`, 2)]);
    await appendPhysicalInputBatch(TENANT, first, { actor: "test", createdAt: new Date("2026-08-29T00:00:00Z") });
    await appendPhysicalInputBatch(TENANT, second, { actor: "test", createdAt: new Date("2026-08-29T00:00:01Z") });

    expect((await getActiveInputBatch(TENANT, "pollution"))?.id).toBe(second.id);
    expect((await listActiveInputBatches(TENANT)).map((value) => value.id)).toEqual([second.id]);
    expect((await listInputBatches(TENANT, "pollution")).map((value) => value.id)).toEqual([second.id, first.id]);
    const active = await listActivePhysicalInputRecords(TENANT, "pollution");
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ batchId: second.id, physicalQuantity: 2 });
  });

  it("途中の行INSERTが失敗した場合はbatchとactivationも全件rollbackする", async () => {
    const batchId = `batch-rollback-${Date.now()}`;
    const duplicateId = `record-duplicate-${Date.now()}`;
    await expect(
      appendPhysicalInputBatch(TENANT, batch(batchId, [record(duplicateId, 1), record(duplicateId, 2)]), { actor: "test" })
    ).rejects.toThrow();
    expect((await listInputBatches(TENANT)).some((value) => value.id === batchId)).toBe(false);
  });

  it("算定済み以外の行ステータスもrun単位で追記・読出できる", async () => {
    const runId = `run-line-${Date.now()}`;
    await appendCalculationLineItems(TENANT, runId, [
      { id: "line-calculated", inputRecordId: "input-1", methodId: "lime3-pollution", status: "calculated", amount: 1200 },
      { id: "line-unmapped", inputRecordId: "input-2", methodId: "lime3-pollution", status: "unmapped", reason: "mapping_not_found" },
      { id: "line-transfer", inputRecordId: "input-3", methodId: "lime3-pollution", status: "transfer_only" },
    ]);
    expect((await listCalculationLineItems(TENANT, runId)).map((value) => value.status).sort()).toEqual([
      "calculated",
      "transfer_only",
      "unmapped",
    ]);
  });

  it("顧客廃棄物入力も原本ではなくmanifestと正規化行だけを保存する", async () => {
    const input: WasteQuantityInput = {
      category: "waste", physicalQuantity: 100, unit: "kg", siteId: "site-042", sourceRegion: "JP", targetRegion: "JP",
      reportingPeriod: "2025", wasteTypeCode: "industrial_unspecified", hazardous: false, treatmentRoute: "landfill",
      treatmentLocation: "offsite", weightBasis: "wet", sourceRecordId: "waste-source-1", sourceRecordHash: "b".repeat(64),
      internalTreatmentCost: 25_000,
    };
    const id = `batch-waste-${Date.now()}`;
    await appendCustomerCategoryInputBatch(TENANT, {
      id,
      category: "waste",
      sourceKind: "customer_csv",
      schemaVersion: "customer-waste-csv-v1",
      dataVersion: "waste-test-v1",
      sourceManifest: { fileName: "waste.csv", sha256: "c".repeat(64), rowCount: 1, encoding: "UTF-8" },
      records: [{ id: `waste-row-${Date.now()}`, sourceLineNumber: 2, input }],
    }, { actor: "test" });

    expect((await getActiveInputBatch(TENANT, "waste"))?.sourceManifest).toMatchObject({ sha256: "c".repeat(64), rowCount: 1 });
    const [stored] = await listActivePhysicalInputRecords(TENANT, "waste");
    expect(stored).toMatchObject({ physicalQuantity: 100, unit: "kg", data: { internalTreatmentCost: 25_000 } });
    expect(JSON.stringify(stored)).not.toContain("rawFile");
  });

  it("入力有効化・M1〜M8算定・算定明細を同じトランザクションで保存できる", async () => {
    const tenantId = `${TENANT}-pipeline`;
    const input: WasteQuantityInput = {
      category: "waste", physicalQuantity: 50, unit: "kg", siteId: "site-042", sourceRegion: "JP", targetRegion: "JP",
      reportingPeriod: "2025", wasteTypeCode: "industrial_unspecified", hazardous: false, treatmentRoute: "landfill",
      treatmentLocation: "offsite", weightBasis: "wet", sourceRecordId: "waste-e2e", sourceRecordHash: "d".repeat(64),
    };
    await getDb().transaction(async (tx) => {
      await appendCustomerCategoryInputBatch(tenantId, {
        id: `batch-e2e-${Date.now()}`,
        category: "waste",
        sourceKind: "customer_csv",
        schemaVersion: "customer-waste-csv-v1",
        dataVersion: "waste-e2e-v1",
        sourceManifest: { fileName: "waste.csv", sha256: "e".repeat(64), rowCount: 1, encoding: "UTF-8" },
        records: [{ id: "waste-e2e-row", sourceLineNumber: 2, input }],
      }, { actor: "test" }, tx);
      await executeAndPersistRun(tenantId, tx);
    });

    const latest = await getLatestRun(tenantId);
    expect(latest?.result.valuation.valuationRecordsByMaterialIssue["site-042-mi-waste"]).toHaveLength(1);
    // 既存の交換価値による判断は維持し、廃棄物の厚生価値はNPV/ROIへ入れない。
    expect(latest?.result.decisions.some((decision) => decision.materialIssueId === "site-042-mi-waste")).toBe(false);
    const lines = await listCalculationLineItems(tenantId, latest!.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ inputRecordId: "waste-e2e-row", methodId: "lime3-waste", status: "calculated" });

    const interaction = await tryRunAndPersist(tenantId, {
      label: "継続算定テスト",
      events: [{
        actor: "test",
        kind: "intentional_decision",
        subjectId: "site-042-mi-water",
        payload: { reason: "E2Eテスト", logMessage: "E2Eテスト操作" },
      }],
    });
    expect(interaction).toEqual({ ok: true });
    const afterInteraction = await getLatestRun(tenantId);
    expect(afterInteraction?.result.valuation.valuationRecordsByMaterialIssue["site-042-mi-waste"]).toHaveLength(1);
    expect(await listCalculationLineItems(tenantId, afterInteraction!.id)).toHaveLength(1);
  });
});
