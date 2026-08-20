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

/**
 * マネージドPostgres(Neon等)はTLS必須なのに、接続URLに `sslmode` が無いと
 * node-postgres は平文で繋ごうとして失敗する。ホスト名がローカルでなければTLSを既定にする。
 * URLに `sslmode` が書かれている場合はそちらを尊重する(node-postgresが解釈する)。
 */
function sslOption(url: string): boolean | { rejectUnauthorized: boolean } | undefined {
  if (/[?&]sslmode=/.test(url)) {
    return undefined;
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return undefined;
  }
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "db";
  return isLocal ? undefined : { rejectUnauthorized: true };
}

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
