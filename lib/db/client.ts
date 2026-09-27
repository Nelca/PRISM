/**
 * DB接続。アプリは `prism_app` ロールで接続する(台帳テーブルへのUPDATE/DELETE権限を持たない)。
 * マイグレーションだけが `prism_migrator`(DATABASE_URL_MIGRATOR)を使う。
 *
 * 認証・セッションはこのリポジトリで扱わない(D-111)。テナントIDは呼び出し側が明示的に渡す。
 */

import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { headers } from "next/headers";
import * as schema from "./schema";
import { sslOption } from "./ssl";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL が設定されていません。ローカルでは `cp .env.example .env` と `npm run db:up`、" +
          "Vercelではプロジェクト設定の Environment Variables に設定してください(README「デプロイ」参照)。"
      );
    }
    pool = new Pool({
      connectionString: url,
      ssl: sslOption(url),
      /**
       * サーバーレス(Vercel)ではインスタンスが多数並ぶため、1インスタンスあたりの
       * コネクションを絞ってDB側の上限を食い潰さないようにする。
       */
      max: process.env.VERCEL ? 1 : 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    // 接続断でプロセスごと落とさない(サーバーレスでは接続が勝手に切られる)。
    pool.on("error", (error) => {
      console.error("[db] idle client error", error);
    });
  }
  return pool;
}

/** 遅延初期化。import しただけでは接続しない(DB不要のテストを壊さないため)。 */
export function getDb() {
  return drizzle(getPool(), { schema });
}

/** Repository が通常接続と同じ形で受け取れる、Drizzle のトランザクション実行器。 */
export type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export type DbExecutor = ReturnType<typeof getDb> | DbTransaction;

/**
 * 同じテナントの「読取→計算→追記(runの保存を含む)」を直列化する。トランザクション終了で自動解放。
 * 古い状態から計算したrunが、後から保存された操作を追い越して最新になることを防ぐ。
 * runを保存する経路はすべて、読取の前にこれを取る。
 */
export async function lockTenantForWrite(tx: DbTransaction, tenantId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`);
}

/**
 * 既定テナント。認証がないハーネスのための単一値であり、本番のテナント解決ではない。
 * 未設定を暗黙の既定値で埋めない(D-15)。
 */
export function getDefaultTenantId(): string {
  const tenantId = process.env.PRISM_DEFAULT_TENANT_ID;
  if (!tenantId) {
    throw new Error("PRISM_DEFAULT_TENANT_ID が設定されていません(.env.example を参照)。");
  }
  return tenantId;
}

/**
 * サブドメインからテナントIDを解決する(GAP-15)。middleware.tsがHostヘッダーの
 * サブドメインを `x-tenant-id` に設定する。サブドメインが無い場合(ルートドメイン・
 * ローカル開発でサブドメインを使っていない場合)は既定テナントにフォールバックする。
 */
export async function getTenantId(): Promise<string> {
  const requestHeaders = await headers();
  const tenantId = requestHeaders.get("x-tenant-id");
  return tenantId ?? getDefaultTenantId();
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
