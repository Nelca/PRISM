import { defineConfig } from "drizzle-kit";

/**
 * マイグレーションはスキーマ所有者(prism_migrator)で実行する。
 * アプリ接続用のロール(prism_app)は台帳テーブルへのUPDATE/DELETE権限を持たないため、
 * そのロールではマイグレーションを流せない(M8 D-5を権限で担保している副作用)。
 *
 * 生成されたSQLはリポジトリにコミットする(版管理の対象。M8の思想と一致)。
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL_MIGRATOR ?? "",
  },
  strict: true,
  verbose: true,
});
