/**
 * 拠点(site テーブル)の読み書き。
 * テナントIDは必ず引数で受け取る。既定値をこの層に埋め込まない(D-111・D-15)。
 */

import { asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { site } from "../schema";
import type { UserSiteDeepDiveParams, UserSiteEntry } from "@/lib/demo/site-entry";
import type { SiteRow } from "@core/site/ingest";

function toEntry(row: typeof site.$inferSelect): UserSiteEntry {
  const siteRow: SiteRow = {
    id: row.id,
    name: row.name,
    siteType: row.siteType,
    industrySector: row.industrySector,
    ...(row.lat !== null ? { lat: row.lat } : {}),
    ...(row.lng !== null ? { lng: row.lng } : {}),
    ...(row.address !== null ? { address: row.address } : {}),
  };
  return { row: siteRow, deepDive: row.deepDiveParams as UserSiteDeepDiveParams };
}

export async function listSiteEntries(tenantId: string): Promise<UserSiteEntry[]> {
  const rows = await getDb().select().from(site).where(eq(site.tenantId, tenantId)).orderBy(asc(site.createdAt));
  return rows.map(toEntry);
}

/**
 * 取り込んだ拠点で置き換える(CSV取込のやり直しを想定)。
 * `site` は追記のみの対象外(取込のやり直しがあるため、0001_append_only_role.sqlで
 * UPDATE/DELETEを許可している唯一のテーブル)。
 *
 * **過去のrun・台帳・判定件数は消えない。**それらは追記のみで、拠点を入れ替えても
 * 「その時点で何を根拠に何を判定したか」の記録は残る。
 */
export async function replaceSiteEntries(tenantId: string, entries: UserSiteEntry[]): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(site).where(eq(site.tenantId, tenantId));
    if (entries.length === 0) {
      return;
    }
    await tx.insert(site).values(
      entries.map((entry) => ({
        tenantId,
        id: entry.row.id,
        name: entry.row.name,
        siteType: entry.row.siteType,
        industrySector: entry.row.industrySector,
        lat: entry.row.lat ?? null,
        lng: entry.row.lng ?? null,
        address: entry.row.address ?? null,
        deepDiveParams: entry.deepDive,
      }))
    );
  });
}

export async function addSiteEntry(
  tenantId: string,
  row: Omit<SiteRow, "id">,
  deepDive: UserSiteDeepDiveParams
): Promise<SiteRow> {
  const db = getDb();
  // IDはプロセス内カウンタではなく既存件数から採番する(再起動でIDが巻き戻らないようにするため)。
  const existing = await db.select({ id: site.id }).from(site).where(eq(site.tenantId, tenantId));
  const sequence = existing.filter((r) => r.id.startsWith("site-user-")).length + 1;
  const id = `site-user-${sequence}`;

  await db.insert(site).values({
    tenantId,
    id,
    name: row.name,
    siteType: row.siteType,
    industrySector: row.industrySector,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    address: row.address ?? null,
    deepDiveParams: deepDive,
  });

  return { ...row, id };
}
