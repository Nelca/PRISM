/**
 * 第4版 D-03:サブ係数付きの手法ID(`ifvi-water-consumption.VFaccess` 等)が
 * そのまま画面に出ていた。生の内部IDを画面に出さない(指示06)。
 */

import { describe, expect, it } from "vitest";
import { methodLabel, withMethodLabelsInText } from "./method-labels";

describe("methodLabel", () => {
  it("辞書にある手法はそのまま日本語ラベルを返す", () => {
    expect(methodLabel("replacement-cost")).toBe("代替費用法(浄水コスト)");
    expect(methodLabel("ghg-carbon-price-conversion.ghg-gx-ets-price")).toBe("GX-ETS調整基準取引価格");
  });

  it("IFVI水消費の4本の内訳値を「親手法名(内訳の和名)」で返す", () => {
    expect(methodLabel("ifvi-water-consumption.VFnutrition")).toBe("IFVI 水ストレス係数(栄養不良の健康影響)");
    expect(methodLabel("ifvi-water-consumption.VFdisease")).toBe("IFVI 水ストレス係数(感染症の健康影響)");
    expect(methodLabel("ifvi-water-consumption.VFes")).toBe("IFVI 水ストレス係数(生態系サービス毀損)");
    expect(methodLabel("ifvi-water-consumption.VFaccess")).toBe("IFVI 水ストレス係数(将来の水アクセス費用)");
  });

  it("未知のサブ係数でも完全な生IDは出さない(親手法名+コードまで縮める)", () => {
    expect(methodLabel("ifvi-water-consumption.VFunknown")).toBe("IFVI 水ストレス係数(VFunknown)");
  });

  it("未選択・未記録は「—」を返す", () => {
    expect(methodLabel(undefined)).toBe("—");
    expect(methodLabel(null)).toBe("—");
    expect(methodLabel("")).toBe("—");
  });
});

describe("withMethodLabelsInText", () => {
  it("記録済みの文に残る手法IDを表示名に置き換える(記録そのものは書き換えない)", () => {
    expect(withMethodLabelsInText("代表値を「ifvi-water-consumption.VFaccess」に変更(理由:良さそうだから)")).toBe(
      "代表値を「IFVI 水ストレス係数(将来の水アクセス費用)」に変更(理由:良さそうだから)"
    );
    expect(withMethodLabelsInText("replacement-costのばらつきが支配的です。")).toBe(
      "代替費用法(浄水コスト)のばらつきが支配的です。"
    );
  });

  it("手法IDを含まない文はそのまま返す", () => {
    expect(withMethodLabelsInText("拠点「本社工場」の登録内容を変更")).toBe("拠点「本社工場」の登録内容を変更");
  });
});
