/**
 * マイグレーション実行。`npm run db:migrate`(node --env-file=.env)。
 *
 * drizzle-kit の migrate ではなく自前の実行器にしている理由:
 * 権限設定(0001_append_only_role.sql)のような手書きSQLを、生成物と同じ列に並べて
 * 適用順を1本にしたいため。drizzle-kit の journal に手書きファイルを載せる運用より、
 * 「ディレクトリ内のSQLをファイル名順に適用し、適用済みを記録する」方が読んで分かる。
 *
 * 接続は必ずスキーマ所有者(DATABASE_URL_MIGRATOR)で行う。アプリ用ロール(prism_app)は
 * 台帳テーブルへのUPDATE/DELETE権限を持たないため、そもそもマイグレーションを流せない。
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "migrations");

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRATOR;
  if (!url) {
    throw new Error("DATABASE_URL_MIGRATOR が設定されていません(.env.example を参照)。");
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await client.query<{ filename: string }>("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename)
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    let appliedCount = 0;
    for (const filename of files) {
      if (applied.has(filename)) {
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, filename), "utf8");
      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // 1ファイル=1トランザクション。途中で失敗したらそのファイルは丸ごと適用されない。
      await client.query("BEGIN");
      try {
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`マイグレーション ${filename} の適用に失敗しました: ${(error as Error).message}`);
      }

      console.log(`applied: ${filename}`);
      appliedCount++;
    }

    console.log(appliedCount === 0 ? "適用済み。新しいマイグレーションはありません。" : `${appliedCount}件のマイグレーションを適用しました。`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
