/**
 * DB接続。アプリは `prism_app` ロールで接続する(台帳テーブルへのUPDATE/DELETE権限を持たない)。
 * マイグレーションだけが `prism_migrator`(DATABASE_URL_MIGRATOR)を使う。
 *
 * 認証・セッションはこのリポジトリで扱わない(D-111)。テナントIDは呼び出し側が明示的に渡す。
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { headers } from "next/headers";
import * as schema from "./schema";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL が設定されていません。`cp .env.example .env` を実行し、`npm run db:up` でDBを起動してください。"
      );
    }
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

/** 遅延初期化。import しただけでは接続しない(DB不要のテストを壊さないため)。 */
export function getDb() {
  return drizzle(getPool(), { schema });
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
