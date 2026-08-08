import path from "node:path";
import { defineConfig } from "vitest/config";

// vitestは.envを自動では読まないため、ここで明示的に読み込む(接続情報はコミットしない)。
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, ".env"));
} catch {
  // .env がない場合はテスト側が「未設定」として失敗する。ここでは既定値を埋めない(D-15)。
}

/**
 * DBを必要とするテスト(*.db.test.ts)専用の設定。
 * 実行前に `npm run db:up && npm run db:migrate` が必要。
 *
 * 通常の `npm test`(vitest.config.mts)からは除外してあるため、
 * Postgresが立っていない環境でも既存のテストは緑のまま通る。
 */
export default defineConfig({
  test: {
    include: ["**/*.db.test.ts"],
    // DDL・権限を触るテストが並列に走ると互いを壊すため、直列実行にする。
    fileParallelism: false,
    env: {
      ...process.env,
    },
  },
  resolve: {
    alias: {
      "@core": path.resolve(import.meta.dirname, "./packages/core/src"),
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
