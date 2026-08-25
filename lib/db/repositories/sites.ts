/**
 * 拠点(site テーブル)の読み書き。
 * テナントIDは必ず引数で受け取る。既定値をこの層に埋め込まない(D-111・D-15)。
 */

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import type { DbExecutor } from "../client";
import { site } from "../schema";
import type { UserSiteDeepDiveParams, UserSiteEntry } from "@/lib/demo/site-entry";
import type { SiteRow } from "@core/site/ingest";

/**
 * 画面から1件ずつ登録した拠点のIDの接頭辞。
 *
 * 編集・削除を許すのはこの接頭辞を持つ拠点だけに限る。理由は2つある:
 *   - デモ既定拠点(site-042等)は `lib/demo/company.ts` の固定データでDBに行が存在せず、
 *     DB操作では変更できない(画面には出るがUPDATE/DELETEの対象がない)
 *   - CSVで取り込んだ拠点はCSVのIDをそのまま使う。取込のやり直し(replaceSiteEntries)が
 *     正規の修正経路であり、1件だけDBを書き換えると元CSVと画面が食い違う
 */
const USER_SITE_ID_PREFIX = "site-user-";

/** 画面から編集・削除してよい拠点か。ページ側の操作列の出し分けもこの判定を使う。 */
export function isUserSiteId(id: string): boolean {
  return id.startsWith(USER_SITE_ID_PREFIX);
}

function assertUserSiteId(id: string): void {
  if (!isUserSiteId(id)) {
    throw new Error("この拠点は画面から編集・削除できません(デモ既定拠点、またはCSVで取り込んだ拠点です)。");
  }
}

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

export async function listSiteEntries(tenantId: string, db: DbExecutor = getDb()): Promise<UserSiteEntry[]> {
  const rows = await db.select().from(site).where(eq(site.tenantId, tenantId)).orderBy(asc(site.createdAt));
  return rows.map(toEntry);
}

/** 1件だけ読む(編集フォームのプリフィル・更新時の既定値の引き継ぎに使う)。 */
export async function getSiteEntry(tenantId: string, id: string, db: DbExecutor = getDb()): Promise<UserSiteEntry | null> {
  const rows = await db
    .select()
    .from(site)
    .where(and(eq(site.tenantId, tenantId), eq(site.id, id)))
    .limit(1);
  return rows[0] ? toEntry(rows[0]) : null;
}

/**
 * 取り込んだ拠点で置き換える(CSV取込のやり直しを想定)。
 * `site` は追記のみの対象外(取込のやり直しがあるため、0001_append_only_role.sqlで
 * UPDATE/DELETEを許可している唯一のテーブル)。
 *
 * **過去のrun・台帳・判定件数は消えない。**それらは追記のみで、拠点を入れ替えても
 * 「その時点で何を根拠に何を判定したか」の記録は残る。
 */
export async function replaceSiteEntries(
  tenantId: string,
  entries: UserSiteEntry[],
  db?: DbExecutor
): Promise<void> {
  const replace = async (executor: DbExecutor) => {
    await executor.delete(site).where(eq(site.tenantId, tenantId));
    if (entries.length === 0) return;
    await executor.insert(site).values(entries.map((entry) => ({
      tenantId,
      id: entry.row.id,
      name: entry.row.name,
      siteType: entry.row.siteType,
      industrySector: entry.row.industrySector,
      lat: entry.row.lat ?? null,
      lng: entry.row.lng ?? null,
      address: entry.row.address ?? null,
      deepDiveParams: entry.deepDive,
    })));
  };
  if (db) await replace(db);
  else await getDb().transaction(replace);
}

export async function addSiteEntry(
  tenantId: string,
  row: Omit<SiteRow, "id">,
  deepDive: UserSiteDeepDiveParams,
  db: DbExecutor = getDb()
): Promise<SiteRow> {
  // UUIDなら同時追加でも読取→採番の競合がなく、削除後に過去のIDを再利用することもない。
  // 既存の site-user-<連番> は監査履歴との参照を保つため、そのまま有効とする。
  const id = `${USER_SITE_ID_PREFIX}${crypto.randomUUID()}`;

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

/**
 * 画面から登録した拠点1件を書き換える。
 *
 * 所在地は「座標」と「住所」の一方だけを持つ形に必ず正規化する(座標→住所に変更したのに
 * 古い緯度経度が残ると、パイプラインは座標を優先してしまい、画面の表示と評価が食い違う)。
 *
 * **過去のrun・台帳・判定件数は消えない。**変更後の姿は次のrunから反映され、
 * 「その時点で何を根拠に何を判定したか」の記録は追記されたまま残る。
 */
export async function updateSiteEntry(
  tenantId: string,
  id: string,
  row: Omit<SiteRow, "id">,
  deepDive: UserSiteDeepDiveParams,
  db: DbExecutor = getDb()
): Promise<SiteRow> {
  assertUserSiteId(id);

  const updated = await db
    .update(site)
    .set({
      name: row.name,
      siteType: row.siteType,
      industrySector: row.industrySector,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      address: row.address ?? null,
      deepDiveParams: deepDive,
    })
    .where(and(eq(site.tenantId, tenantId), eq(site.id, id)))
    .returning({ id: site.id });

  if (updated.length === 0) {
    throw new Error("対象の拠点が見つかりません。");
  }
  return { ...row, id };
}

/**
 * 画面から登録した拠点1件を一覧から取り除く。
 *
 * 消えるのは「これから評価する対象」としての登録だけで、**過去のrun・台帳・監査証跡は残る**
 * (それらは追記のみのテーブルにあり、アプリ用ロールにDELETE権限がない)。
 */
export async function removeSiteEntry(tenantId: string, id: string, db: DbExecutor = getDb()): Promise<void> {
  assertUserSiteId(id);

  const deleted = await db
    .delete(site)
    .where(and(eq(site.tenantId, tenantId), eq(site.id, id)))
    .returning({ id: site.id });

  if (deleted.length === 0) {
    throw new Error("対象の拠点が見つかりません。");
  }
}
