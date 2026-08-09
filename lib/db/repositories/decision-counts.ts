/**
 * 判定件数のカウンタ(M6 D-8、design-rationale-log D-30・D-42)。従量課金の唯一の根拠。
 *
 * `shouldCountDecision()`(packages/core)が「この時点でカウント対象か」を判定し、
 * ここが「契約単位で1件として積む」永続化を担う。core側はDBを知らない(D-108)。
 *
 * **DecisionRecord 1件につき1行。**runは操作のたびに作り直されるため、run単位で数えると
 * 同じ判定が何度も課金対象になる。主キー(tenantId, decisionRecordId)で重複を防ぎ、
 * 2回目以降のrunでは何もしない(D-117)。
 */

import { asc, eq, sql } from "drizzle-orm";
import { shouldCountDecision } from "@core/decision/decision-count";
import type { DecisionRecord } from "@core/types/decision";
import { getDb } from "../client";
import { decisionCountEntry } from "../schema";

export interface CountableDecision {
  decisionRecord: DecisionRecord;
  siteId?: string;
}

/**
 * カウント対象の行を組み立てる。**挿入はしない。**
 * 実際のINSERTは run の永続化と同じトランザクションで行う(repositories/runs.ts)。
 * 「どの判定を数えるか」の判断をこのファイル1箇所に置くための関数。
 */
export function buildDecisionCountRows(
  tenantId: string,
  runId: string,
  decisions: CountableDecision[]
): (typeof decisionCountEntry.$inferInsert)[] {
  return decisions
    .filter((entry) => shouldCountDecision(entry.decisionRecord.verdict))
    .map((entry) => ({
      tenantId,
      decisionRecordId: entry.decisionRecord.id,
      runId,
      verdict: entry.decisionRecord.verdict,
      siteId: entry.siteId ?? null,
    }));
}

export interface DecisionCountEntryView {
  decisionRecordId: string;
  countedAt: string;
  verdict: string;
  siteId: string | null;
}

/** 課金の発生根拠を顧客に説明できるようにするための明細(構想書6.4)。 */
export async function listDecisionCounts(tenantId: string): Promise<DecisionCountEntryView[]> {
  const rows = await getDb()
    .select()
    .from(decisionCountEntry)
    .where(eq(decisionCountEntry.tenantId, tenantId))
    .orderBy(asc(decisionCountEntry.countedAt));

  return rows.map((row) => ({
    decisionRecordId: row.decisionRecordId,
    countedAt: row.countedAt.toISOString(),
    verdict: row.verdict,
    siteId: row.siteId,
  }));
}

export async function countDecisions(tenantId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(decisionCountEntry)
    .where(eq(decisionCountEntry.tenantId, tenantId));
  return row?.count ?? 0;
}
