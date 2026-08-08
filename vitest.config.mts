import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * tsconfig.jsonのpathsエイリアス(@core/* → packages/core/src/*、@/* → リポジトリルート)を
 * vitestにも認識させる。vitestはtsconfigのpathsを自動では読まないため、テスト実行時に
 * `Cannot find package '@core/...'`で失敗する(lib/demo/がpackages/core外からこれらの
 * エイリアスで参照するために追加した)。
 */
export default defineConfig({
  test: {
    /**
     * *.db.test.ts は起動中のPostgresを必要とするため、既定の`npm test`からは除外する。
     * DBありのテストは `npm run test:db`(vitest.db.config.mts)で実行する。
     */
    exclude: ["**/node_modules/**", "**/.next/**", "**/*.db.test.ts"],
  },
  resolve: {
    alias: {
      "@core": path.resolve(import.meta.dirname, "./packages/core/src"),
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
