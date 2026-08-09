/**
 * 取込の通し検証(GAP-02)。
 * 記入例テンプレート3ファイル → 検証 → 拠点として永続化 → パイプライン実行までを確認する。
 *
 * サーバーアクション自体(HTTPのフォーム送信)はここでは通さない。検証・変換・永続化・
 * 実行という中身をすべて通し、UIはその薄い呼び出しに留める。
 *
 * 実行前提: `npm run db:up && npm run db:migrate`。実行は `npm run test:db`。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "./client";
import { listSiteEntries, replaceSiteEntries } from "./repositories/sites";
import { loadCompanyDataset } from "@/lib/intake/load-company-dataset";
import { toSiteEntries } from "@/lib/intake/to-site-entries";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";

const TENANT = "intake-test";
const templateDir = path.resolve(import.meta.dirname, "../intake/templates");
const read = (file: string) => readFileSync(path.join(templateDir, file), "utf8");

afterAll(async () => {
  await closeDb();
});

describe("実データ受け入れテンプレートの取込", () => {
  it("記入例3ファイルを取り込むと、拠点が永続化されパイプラインが通る", async () => {
    const { dataset, errors } = loadCompanyDataset(
      read("sites.csv"),
      read("nature-interfaces.csv"),
      read("engagement-config.json")
    );
    expect(errors).toEqual([]);

    const { entries } = toSiteEntries(dataset!);
    await replaceSiteEntries(TENANT, entries);

    const stored = await listSiteEntries(TENANT);
    expect(stored).toHaveLength(entries.length);
    // CSVのIDがそのまま使われる(自動採番で上書きしない)
    expect(stored.map((s) => s.row.id).sort()).toEqual(entries.map((e) => e.row.id).sort());

    const result = await executeAndPersistRun(TENANT);
    for (const entry of entries) {
      expect(result.assessment.sites.map((s) => s.id)).toContain(entry.row.id);
    }
  });

  it("取込をやり直すと拠点は置き換わるが、過去のrun・台帳は残る(追記のみ)", async () => {
    const { dataset } = loadCompanyDataset(
      read("sites.csv"),
      read("nature-interfaces.csv"),
      read("engagement-config.json")
    );
    const { entries } = toSiteEntries(dataset!);

    await replaceSiteEntries(TENANT, entries.slice(0, 1));
    expect(await listSiteEntries(TENANT)).toHaveLength(1);

    await replaceSiteEntries(TENANT, entries);
    expect(await listSiteEntries(TENANT)).toHaveLength(entries.length);
  });
});
