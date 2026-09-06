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
     *
     * `.claude/worktrees/` 配下は同一リポジトリの別チェックアウト(gitignore 済み)であり、
     * 本体の設定で走らせると `@core`/`@` エイリアスが本体側へ解決され、旧コードと新コアの
     * 組合せで偽の失敗を出す(2026-09-06)。本体の合否判定から除外する。
     */
    exclude: ["**/node_modules/**", "**/.next/**", "**/*.db.test.ts", "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@core": path.resolve(import.meta.dirname, "./packages/core/src"),
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
