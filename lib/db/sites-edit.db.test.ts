/**
 * 登録済み拠点の編集・削除(指示B-03)。
 *
 * 確認すること:
 *   1. 画面から登録した拠点(site-user-*)を書き換えられる。所在地の指定方法を
 *      座標→住所に変えると、古い緯度経度が残らない
 *   2. デモ既定拠点(site-042等・DBに行がない)と取込済み拠点(CSVのID)は編集・削除できない
 *   3. 削除しても**過去のrun・台帳は残る**(追記のみの設計)。削除した拠点を含むrunは
 *      そのまま読み出せる
 *   4. 削除のあとに追加してもIDが再利用されない(過去のrunの拠点IDと衝突しない)
 *   5. 編集・削除が変更履歴(/ledger の actionLog)に人が読める形で残る
 *
 * 実行前提: `npm run db:up && npm run db:migrate`。実行は `npm run test:db`。
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "./client";
import { site } from "./schema";
import {
  addSiteEntry,
  getSiteEntry,
  listSiteEntries,
  removeSiteEntry,
  replaceSiteEntries,
  updateSiteEntry,
} from "./repositories/sites";
import { appendInteractionEvent, loadInteractionState } from "./repositories/interactions";
import { getLatestRun } from "./repositories/runs";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";
import { DEFAULT_DEEP_DIVE_PARAMS } from "@/lib/demo/user-site-defaults";
import type { UserSiteDeepDiveParams } from "@/lib/demo/site-entry";

const TENANT = "sites-edit-test";

const baseDeepDive: UserSiteDeepDiveParams = { ...DEFAULT_DEEP_DIVE_PARAMS };

beforeEach(async () => {
  // 追記テーブルはアプリ用ロールで消せないため、削除できる`site`だけを初期化する
  // (runと操作イベントは積み上がってよい。テナントIDで他のテストと分離している)。
  await getDb().delete(site).where(eq(site.tenantId, TENANT));
});

afterAll(async () => {
  await closeDb();
});

describe("拠点の編集", () => {
  it("登録した拠点の内容を書き換えられる", async () => {
    const added = await addSiteEntry(
      TENANT,
      { name: "名古屋第二工場", siteType: "own_site", industrySector: "chemicals", lat: 35.1, lng: 136.9 },
      baseDeepDive
    );

    await updateSiteEntry(
      TENANT,
      added.id,
      { name: "名古屋第三工場", siteType: "supplier_site", industrySector: "steel", lat: 34.7, lng: 135.5 },
      { ...baseDeepDive, physicalQuantity: 12345 }
    );

    const stored = await getSiteEntry(TENANT, added.id);
    expect(stored?.row).toEqual({
      id: added.id,
      name: "名古屋第三工場",
      siteType: "supplier_site",
      industrySector: "steel",
      lat: 34.7,
      lng: 135.5,
    });
    expect(stored?.deepDive.physicalQuantity).toBe(12345);
  });

  it("座標から住所に変えると、古い緯度経度が残らない", async () => {
    const added = await addSiteEntry(
      TENANT,
      { name: "拠点A", siteType: "own_site", industrySector: "chemicals", lat: 35.1, lng: 136.9 },
      baseDeepDive
    );

    await updateSiteEntry(
      TENANT,
      added.id,
      { name: "拠点A", siteType: "own_site", industrySector: "chemicals", address: "愛知県名古屋市" },
      baseDeepDive
    );

    const stored = await getSiteEntry(TENANT, added.id);
    expect(stored?.row.lat).toBeUndefined();
    expect(stored?.row.lng).toBeUndefined();
    expect(stored?.row.address).toBe("愛知県名古屋市");
  });

  it("デモ既定拠点のIDを渡すと編集・削除を拒む", async () => {
    // site-042 は lib/demo/company.ts の固定データでDBに行がない。
    await expect(
      updateSiteEntry(
        TENANT,
        "site-042",
        { name: "本社工場(改)", siteType: "own_site", industrySector: "chemicals", lat: 35.1, lng: 136.9 },
        baseDeepDive
      )
    ).rejects.toThrow(/編集・削除できません/);
    await expect(removeSiteEntry(TENANT, "site-042")).rejects.toThrow(/編集・削除できません/);
  });

  it("CSVで取り込んだ拠点も編集・削除の対象にしない(取込のやり直しが正規の経路)", async () => {
    await replaceSiteEntries(TENANT, [
      {
        row: { id: "site-001", name: "取込拠点", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 136 },
        deepDive: baseDeepDive,
      },
    ]);

    await expect(removeSiteEntry(TENANT, "site-001")).rejects.toThrow(/編集・削除できません/);
    expect(await listSiteEntries(TENANT)).toHaveLength(1);
  });

  it("存在しない拠点の編集・削除はエラーになる(黙って成功しない)", async () => {
    await expect(
      updateSiteEntry(
        TENANT,
        "site-user-999",
        { name: "無い拠点", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 136 },
        baseDeepDive
      )
    ).rejects.toThrow(/見つかりません/);
    await expect(removeSiteEntry(TENANT, "site-user-999")).rejects.toThrow(/見つかりません/);
  });
});

describe("拠点の削除", () => {
  it("削除すると一覧から消える", async () => {
    const added = await addSiteEntry(
      TENANT,
      { name: "消す拠点", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 136 },
      baseDeepDive
    );
    expect(await listSiteEntries(TENANT)).toHaveLength(1);

    await removeSiteEntry(TENANT, added.id);

    expect(await listSiteEntries(TENANT)).toHaveLength(0);
    expect(await getSiteEntry(TENANT, added.id)).toBeNull();
  });

  it("削除しても、その拠点を含む過去のrunは残る(追記のみ)", async () => {
    const added = await addSiteEntry(
      TENANT,
      { name: "削除前に評価した拠点", siteType: "own_site", industrySector: "chemicals", lat: 35.2, lng: 136.8 },
      baseDeepDive
    );
    const before = await executeAndPersistRun(TENANT);
    expect(before.assessment.sites.map((s) => s.id)).toContain(added.id);

    await removeSiteEntry(TENANT, added.id);
    const after = await executeAndPersistRun(TENANT);

    // 新しいrunからは消えるが、
    expect(after.assessment.sites.map((s) => s.id)).not.toContain(added.id);
    // 最新runは読めるままで壊れていない(/ledger 相当の読み出しが成立する)。
    const latest = await getLatestRun(TENANT);
    expect(latest).not.toBeNull();
    expect(latest!.result.assessment.sites.map((s) => s.id)).not.toContain(added.id);
    // 過去のrunの中身(削除した拠点を含む評価結果)は消えていない。
    expect(before.assessment.materialIssues.some((issue) => issue.siteId === added.id)).toBe(true);
  });

  it("削除したあとに追加しても、IDを再利用しない", async () => {
    const first = await addSiteEntry(
      TENANT,
      { name: "1件目", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 136 },
      baseDeepDive
    );
    const second = await addSiteEntry(
      TENANT,
      { name: "2件目", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 136 },
      baseDeepDive
    );
    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^site-user-[0-9a-f-]{36}$/);

    await removeSiteEntry(TENANT, first.id);
    const third = await addSiteEntry(
      TENANT,
      { name: "3件目", siteType: "own_site", industrySector: "chemicals", lat: 35, lng: 136 },
      baseDeepDive
    );

    expect(third.id).not.toBe(first.id);
    expect(third.id).not.toBe(second.id);
    expect(await listSiteEntries(TENANT)).toHaveLength(2);
  });
});

describe("編集・削除の監査証跡", () => {
  it("変更履歴(actionLog)に人が読める形で残る", async () => {
    const marker = `監査証跡テスト-${Date.now()}`;

    await appendInteractionEvent(TENANT, {
      actor: "宮里",
      kind: "site_update",
      subjectId: "site-user-1",
      payload: { logMessage: `拠点「${marker}」の登録内容を変更(拠点名「旧」→「${marker}」)` },
    });
    await appendInteractionEvent(TENANT, {
      actor: "宮里",
      kind: "site_removal",
      subjectId: "site-user-1",
      payload: { logMessage: `拠点「${marker}」を評価対象の一覧から削除(過去の計算結果・監査証跡は残ります)` },
    });

    const state = await loadInteractionState(TENANT);
    const entries = state.actionLog.filter((entry) => entry.what.includes(marker));
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.who === "宮里")).toBe(true);
    // 拠点の編集・削除は「現在値」を持たない(現在値は site テーブルそのもの)。
    // 他の状態を巻き込んで壊していないことを確認する。
    expect(state.depthOverrides.size).toBe(0);
  });
});
