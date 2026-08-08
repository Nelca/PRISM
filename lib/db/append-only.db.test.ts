/**
 * M8 D-5「既存のAssumptionEntryを編集・削除する経路は用意しない」の実装上の担保を検証する。
 *
 * これはアプリケーションコードの約束ではなく **DBの権限** で守られていることを確認するテスト。
 * 通常系より先に書く(build-plan §9.1「テストを先に書かせる範囲」に M8 のハッシュ再現性と並ぶ
 * 位置づけの不変条件であるため)。
 *
 * 実行前提: `npm run db:up && npm run db:migrate`。実行は `npm run test:db`。
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { APPEND_ONLY_TABLES } from "./schema";

const TENANT = "append-only-test";

let app: Client;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL が未設定です。`cp .env.example .env` と `npm run db:up` を先に実行してください。");
  }
  app = new Client({ connectionString: url });
  await app.connect();
});

afterAll(async () => {
  await app?.end();
});

describe("追記のみの強制(M8 D-5)", () => {
  it("アプリ用ロールは assumption_entry を INSERT できる", async () => {
    const runId = `run-${TENANT}-${Date.now()}`;
    await expect(
      app.query(
        `INSERT INTO assumption_entry (run_id, tenant_id, id, source_module, related_record_id, payload)
         VALUES ($1, $2, $3, 'M1', 'mi-1', $4)`,
        [runId, TENANT, `ae-${Date.now()}`, JSON.stringify({ module: "M1", kind: "exclusion", reason: "テスト" })]
      )
    ).resolves.toBeDefined();
  });

  it("アプリ用ロールは assumption_entry を UPDATE できない", async () => {
    await expect(app.query(`UPDATE assumption_entry SET related_record_id = 'tampered'`)).rejects.toThrow(
      /permission denied/i
    );
  });

  it("アプリ用ロールは assumption_entry を DELETE できない", async () => {
    await expect(app.query(`DELETE FROM assumption_entry`)).rejects.toThrow(/permission denied/i);
  });

  it("APPEND_ONLY_TABLES に挙げた全テーブルで UPDATE / DELETE 権限がない", async () => {
    const { rows } = await app.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type
         FROM information_schema.table_privileges
        WHERE grantee = current_user
          AND privilege_type IN ('UPDATE', 'DELETE')
          AND table_name = ANY($1)`,
      [[...APPEND_ONLY_TABLES]]
    );

    // 1件でも残っていれば、そのテーブルは追記のみになっていない
    expect(rows).toEqual([]);
  });

  it("取込のやり直しがある site テーブルは、意図的に UPDATE / DELETE を許可している", async () => {
    const { rows } = await app.query<{ privilege_type: string }>(
      `SELECT privilege_type
         FROM information_schema.table_privileges
        WHERE grantee = current_user AND table_name = 'site' AND privilege_type IN ('UPDATE', 'DELETE')`
    );
    expect(rows.map((r) => r.privilege_type).sort()).toEqual(["DELETE", "UPDATE"]);
  });

  it("APPEND_ONLY_TABLES の一覧が、実際にDBへ作られたテーブルと食い違っていない", async () => {
    const { rows } = await app.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const actual = rows.map((r) => r.table_name);

    // 一覧に書いたテーブルが実在すること(綴り違い・作り忘れの検出)
    for (const table of APPEND_ONLY_TABLES) {
      expect(actual).toContain(table);
    }

    // 逆方向:新しいテーブルを足したのに一覧へ追加し忘れていないこと。
    // 追記対象外だと分かっているものだけを明示的に除外する。
    const intentionallyMutable = ["site", "schema_migrations"];
    const missing = actual.filter(
      (t) => !intentionallyMutable.includes(t) && !(APPEND_ONLY_TABLES as readonly string[]).includes(t)
    );
    expect(missing).toEqual([]);
  });
});
