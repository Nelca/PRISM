/**
 * M4 §7.4:代表値の選択と、手法変更時の前年度手法での再計算値の並記。
 *
 * build-plan §10 が「実装で起きやすい違反」として名指ししている
 * 「手法変更時に前年度手法での再計算値を出さない」を、テストで固定する。
 */

import { describe, expect, it } from "vitest";
import {
  buildRepresentativeValueEvidence,
  buildRepresentativeValueSelection,
  RepresentativeValueSelectionError,
} from "./representative-value";
import { makeValuationRecord } from "./test-helpers";

const replacementCost = makeValuationRecord({ methodId: "replacement-cost", centralValue: 2_500, valueConcept: "exchange" });
const vfaccess = makeValuationRecord({
  methodId: "ifvi-water-consumption.VFaccess",
  centralValue: 8_000,
  valueConcept: "exchange",
  aopCode: "not_applicable",
});
const lime3 = makeValuationRecord({ methodId: "lime3-water", centralValue: 300, valueConcept: "welfare" });

const exchangeRecords = [replacementCost, vfaccess];

describe("代表値の選択", () => {
  it("理由が空の場合はエラーにする(デフォルトの理由を設けない)", () => {
    expect(() =>
      buildRepresentativeValueSelection({
        groupValueConcept: "exchange",
        records: exchangeRecords,
        selectedMethodId: "replacement-cost",
        reason: "   ",
      })
    ).toThrow(RepresentativeValueSelectionError);
  });

  it("グループに存在しない手法は選択できない", () => {
    expect(() =>
      buildRepresentativeValueSelection({
        groupValueConcept: "exchange",
        records: exchangeRecords,
        selectedMethodId: "lime3-water",
        reason: "テスト",
      })
    ).toThrow(RepresentativeValueSelectionError);
  });

  it("価値概念が違うレコードは選択できない(構想書8.2)", () => {
    expect(() =>
      buildRepresentativeValueSelection({
        groupValueConcept: "exchange",
        records: [lime3],
        selectedMethodId: "lime3-water",
        reason: "テスト",
      })
    ).toThrow(RepresentativeValueSelectionError);
  });

  it("前年度と同じ手法なら、再計算値の並記は発生しない", () => {
    const result = buildRepresentativeValueSelection({
      groupValueConcept: "exchange",
      records: exchangeRecords,
      selectedMethodId: "replacement-cost",
      reason: "前年度から継続",
      priorYearMethodId: "replacement-cost",
    });

    expect(result.status).toBe("same_method");
    expect(result.selection.recalculatedWithPriorMethod).toBeUndefined();
    expect(result.selection.priorYearMethodId).toBe("replacement-cost");
  });

  it("手法を変更した場合、前年度手法での再計算値を並記する(構想書9.3の必須要件)", () => {
    const result = buildRepresentativeValueSelection({
      groupValueConcept: "exchange",
      records: exchangeRecords,
      selectedMethodId: "ifvi-water-consumption.VFaccess",
      reason: "IFVIが水消費方法論の最終版を公開したため",
      priorYearMethodId: "replacement-cost",
    });

    expect(result.status).toBe("recalculated");
    expect(result.selection.selectedMethodId).toBe("ifvi-water-consumption.VFaccess");
    // 当年度の物理量で前年度手法を計算した値。これがないと手法変更の差分と
    // 実態変化の差分を分離できない
    expect(result.selection.recalculatedWithPriorMethod).toBe(2_500);
    expect(result.selection.reason).toBe("IFVIが水消費方法論の最終版を公開したため");
  });

  it("前年度手法が現在の手法セットにない場合、推定せず「再計算不能」として理由を返す", () => {
    const result = buildRepresentativeValueSelection({
      groupValueConcept: "exchange",
      records: exchangeRecords,
      selectedMethodId: "replacement-cost",
      reason: "前年度手法が廃止されたため",
      priorYearMethodId: "retired-method",
    });

    expect(result.status).toBe("method_unavailable");
    expect(result.selection.recalculatedWithPriorMethod).toBeUndefined();
    expect(result.unavailableReason).toContain("retired-method");
  });

  it("初年度(前年度手法なし)は再計算値なしで成立する", () => {
    const result = buildRepresentativeValueSelection({
      groupValueConcept: "exchange",
      records: exchangeRecords,
      selectedMethodId: "replacement-cost",
      reason: "初年度のため",
    });

    expect(result.status).toBe("same_method");
    expect(result.selection.priorYearMethodId).toBeUndefined();
  });
});

describe("選択の材料として提示する事実(§7.4)", () => {
  it("ティア・価値概念・AoP・前年度選択の有無を、推奨なしで並べる", () => {
    const evidence = buildRepresentativeValueEvidence(exchangeRecords, "replacement-cost");

    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      methodId: "replacement-cost",
      valueConcept: "exchange",
      selectedLastYear: true,
    });
    expect(evidence[1].selectedLastYear).toBe(false);
    // 「推奨」に相当するフィールドが存在しないこと(D-23:システムは推奨しない)
    expect(Object.keys(evidence[0])).not.toContain("recommended");
  });
});
