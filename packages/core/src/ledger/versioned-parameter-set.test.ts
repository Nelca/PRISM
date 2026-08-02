import { describe, expect, it } from "vitest";
import {
  ChangeReasonRequiredError,
  getActiveVersion,
  listVersionHistory,
  MissingActiveVersionError,
  registerInitialVersion,
  supersedeVersion,
} from "./versioned-parameter-set";

describe("versioned-parameter-set", () => {
  it("registerInitialVersionはsupersededByなしの初期版を作る", () => {
    const v1 = registerInitialVersion("ifvi-water-consumption", "v1", "2026-04-01");
    expect(v1).toEqual({ setId: "ifvi-water-consumption", version: "v1", effectiveFrom: "2026-04-01" });
  });

  it("supersedeVersionは旧版にsupersededByを設定し、新版を追記する(要件定義書§3の具体例)", () => {
    const v1 = registerInitialVersion("ifvi-water-consumption", "v1", "2026-04-01");
    const updated = supersedeVersion(
      [v1],
      "ifvi-water-consumption",
      "v2",
      "2027-04-01",
      "IFVIがWater Consumption方法論を改訂(VFaccessの割引率を2%→2.5%に変更)"
    );

    expect(updated).toHaveLength(2);
    const [oldEntry, newEntry] = updated;
    expect(oldEntry.supersededBy).toBe("v2");
    expect(newEntry).toEqual({
      setId: "ifvi-water-consumption",
      version: "v2",
      effectiveFrom: "2027-04-01",
      changeReason: "IFVIがWater Consumption方法論を改訂(VFaccessの割引率を2%→2.5%に変更)",
    });
  });

  it("元の配列は変更されない(immutable)", () => {
    const v1 = registerInitialVersion("ifvi-water-consumption", "v1", "2026-04-01");
    const registry = [v1];
    supersedeVersion(registry, "ifvi-water-consumption", "v2", "2027-04-01", "改訂のため");

    expect(registry).toEqual([v1]); // 元の配列はv1のまま、supersededByも設定されていない
  });

  it("changeReasonが空文字列の場合はエラーを投げる", () => {
    const v1 = registerInitialVersion("ifvi-water-consumption", "v1", "2026-04-01");
    expect(() => supersedeVersion([v1], "ifvi-water-consumption", "v2", "2027-04-01", "  ")).toThrow(
      ChangeReasonRequiredError
    );
  });

  it("現在有効な版が存在しない場合はエラーを投げる", () => {
    expect(() => supersedeVersion([], "unknown-set", "v2", "2027-04-01", "理由")).toThrow(MissingActiveVersionError);
  });

  it("getActiveVersionはsupersededByが未設定の版を返す", () => {
    const v1 = registerInitialVersion("ifvi-water-consumption", "v1", "2026-04-01");
    const updated = supersedeVersion([v1], "ifvi-water-consumption", "v2", "2027-04-01", "改訂のため");

    const active = getActiveVersion(updated, "ifvi-water-consumption");
    expect(active?.version).toBe("v2");
  });

  it("listVersionHistoryは旧版を含む全件を返す(削除されない)", () => {
    const v1 = registerInitialVersion("ifvi-water-consumption", "v1", "2026-04-01");
    const updated = supersedeVersion([v1], "ifvi-water-consumption", "v2", "2027-04-01", "改訂のため");

    const history = listVersionHistory(updated, "ifvi-water-consumption");
    expect(history.map((v) => v.version)).toEqual(["v1", "v2"]);
  });
});
