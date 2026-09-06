import { describe, expect, it } from "vitest";
import { exchangeAmount } from "@core/types/common";
import type { DecomposedPair, IntraMethodBreakdownAnalysis, StoppedPair } from "@core/types/divergence";
import type { ValuationRecord } from "@core/types/valuation";
import {
  breakdownComponentViews,
  breakdownMixedConceptNote,
  chartMode,
  combinedKnownDifferences,
  contributionShareLabel,
  pairImplicationDisplay,
  pairZeroMeaning,
  pairwiseToWaterfallSteps,
  readablePairNarrative,
  recordZeroMeaning,
  residualRatioLabel,
  stoppedPairSummary,
  subsetRows,
  zeroMeaningDisplay,
} from "./view-model";

const COMMON = {
  analysisUnit: "cross_method",
  methodIdA: "a",
  methodIdB: "b",
  parentMethodIdA: "a",
  parentMethodIdB: "b",
  subjectId: "subject:pq-1",
  valueConcept: "welfare",
  normalizationApplied: [],
  qualitativeDifferences: [],
  diagnostics: {
    magnitudeGapRatio: null,
    lnRatio: null,
    absoluteDifference: null,
    f3ThresholdApplied: false,
    f8ThresholdApplied: false,
  },
  implication: { kind: "additional_investigation", summary: "" },
  narrative: "",
} as const;

function decomposedPair(overrides: Partial<DecomposedPair>): DecomposedPair {
  return {
    ...COMMON,
    status: "decomposed",
    valueA: 300,
    valueB: 100,
    mode: "multiplicative",
    kind: "partial",
    baseline: "B",
    direction: "B_to_A",
    vStar: 200,
    totalDifference: Math.log(3),
    explainedSum: Math.log(2),
    contributions: [
      {
        factorId: "time_model",
        category: "time_model",
        label: "時間モデル",
        shapley: Math.log(2),
        displayAmount: null,
        displayMultiplier: 2,
        shareRatio: 1,
        isZero: false,
        swapped: [],
        evidence: [],
      },
    ],
    residual: {
      mode: "multiplicative",
      value: Math.log(1.5),
      displayMultiplier: 1.5,
      ratio: null,
      knownUnquantified: [],
      unclassified: false,
      nextActions: [],
    },
    subsets: [],
    recipe: { id: "r", version: "1.0.0", hash: "recipe:test", reviewStatus: "evidence_verified" },
    tolerance: { version: "tol-v1" },
    reverse: { defined: false, reason: "部分分解のため" },
    evaluationCount: 2,
    ...overrides,
  } as DecomposedPair;
}

function stoppedPair(overrides: Partial<StoppedPair> = {}): StoppedPair {
  return {
    ...COMMON,
    status: "stopped",
    valueA: 0,
    valueB: 25,
    reason: "no_numerizable_factors",
    detail: "差し替え式を定義できる要因がありません。",
    missingData: [],
    nextActions: [],
    ...overrides,
  } as StoppedPair;
}

describe("valuation view model(M4 V2・T-15 情報設計)", () => {
  describe("1. 結論", () => {
    it("読み下し文は比較の向きに依存しない倍率の一文で始まる", () => {
      const pair = decomposedPair({
        methodIdA: "small",
        methodIdB: "large",
        valueA: 25,
        valueB: 100,
        narrative: "説明されない残差です。",
      });
      expect(readablePairNarrative(pair)).toBe("large は small の 4.00倍です。 説明されない残差です。");
    });

    it("ゼロや負値を含むペアでは倍率を捏造せず、エンジンの読み下し文の先頭文をそのまま出す", () => {
      const pair = stoppedPair({ narrative: "比較できません。" });
      expect(readablePairNarrative(pair)).toBe("比較できません。");
    });

    it("narrativeが複数文でも先頭文(結論)だけを使い、A ≥ B なら倍率を二重に言わない", () => {
      const pair = decomposedPair({
        valueA: 300,
        valueB: 100,
        narrative: "結論: aはbの3倍です。 意思決定への含意: 追加調査が必要です。",
      });
      expect(readablePairNarrative(pair)).toBe("結論: aはbの3倍です。");
    });

    it("A < B のときだけ、逆数を計算しなくて済む向きの一文を結論の前に添える", () => {
      const pair = decomposedPair({
        valueA: 100,
        valueB: 300,
        narrative: "結論: aはbの0.33倍です。 意思決定への含意: 追加調査が必要です。",
      });
      expect(readablePairNarrative(pair)).toBe("b は a の 3.00倍です。 結論: aはbの0.33倍です。");
    });
  });

  describe("2. 意思決定への含意", () => {
    it("分解できたペアは含意の見出し語と要約文を返す", () => {
      const pair = decomposedPair({ implication: { kind: "representative_choice", summary: "代表値を選べます。" } });
      const display = pairImplicationDisplay(pair);
      expect(display.headingLabel).toBe("代表値を選べる");
      expect(display.summary).toBe("代表値を選べます。");
      expect(display.stopReasonLabel).toBeUndefined();
    });

    it("停止したペアは理由コードと詳細も返す", () => {
      const pair = stoppedPair({ implication: { kind: "not_comparable", summary: "比較できません。" } });
      const display = pairImplicationDisplay(pair);
      expect(display.headingLabel).toBe("比較できない");
      expect(display.stopReasonLabel).toBe("差を数値で入れ替えられる要因が定義できない");
      expect(display.stopDetail).toBe("差し替え式を定義できる要因がありません。");
    });

    it("stoppedPairSummaryは分解できたペアではnullを返す", () => {
      expect(stoppedPairSummary(decomposedPair({}))).toBeNull();
    });
  });

  describe("3. 数値化できた原因寄与", () => {
    it("ゼロ寄与は割合ではなく「差なし」と明示する", () => {
      const contribution = decomposedPair({}).contributions[0];
      expect(contributionShareLabel({ ...contribution, isZero: true, shareRatio: null })).toBe("差なし(ゼロ寄与)");
    });

    it("shareRatioがnullで非ゼロなら割合表示不能", () => {
      const contribution = decomposedPair({}).contributions[0];
      expect(contributionShareLabel({ ...contribution, isZero: false, shareRatio: null })).toBe("割合表示不能");
    });

    it("通常は%表示にする", () => {
      const contribution = decomposedPair({}).contributions[0];
      expect(contributionShareLabel({ ...contribution, isZero: false, shareRatio: 0.417 })).toBe("42%");
    });
  });

  describe("4. 既知だが数値化できない差異", () => {
    it("qualitativeDifferencesとresidual.knownUnquantifiedを重複なく統合する", () => {
      const shared = {
        category: "time_model" as const,
        description: "損害の時間モデルが違う",
        sideA: "単年フロー",
        sideB: "割引現在価値",
        evidence: [],
      };
      const onlyInResidual = { ...shared, description: "残差側だけの差異" };
      const pair = decomposedPair({
        qualitativeDifferences: [shared],
        residual: {
          mode: "multiplicative",
          value: 0,
          displayMultiplier: 1,
          ratio: null,
          knownUnquantified: [shared, onlyInResidual],
          unclassified: false,
          nextActions: [],
        },
      });
      const combined = combinedKnownDifferences(pair);
      expect(combined).toHaveLength(2);
      expect(combined.map((d) => d.description).sort()).toEqual(["損害の時間モデルが違う", "残差側だけの差異"]);
    });

    it("停止したペアはqualitativeDifferencesだけを使う", () => {
      const pair = stoppedPair({ qualitativeDifferences: [{ category: "time_model", description: "d", sideA: "a", sideB: "b", evidence: [] }] });
      expect(combinedKnownDifferences(pair)).toHaveLength(1);
    });
  });

  describe("5. 未分類残差と次のアクション", () => {
    it("ratioがnullなら理由ラベルを返す", () => {
      expect(
        residualRatioLabel({
          mode: "additive",
          value: 0,
          displayMultiplier: null,
          ratio: null,
          ratioUnavailableReason: "mixed_signs",
          knownUnquantified: [],
          unclassified: false,
          nextActions: [],
        })
      ).toBe("寄与・残差の符号が混在するため割合を表示できません");
    });

    it("ratioがあれば%表示にする", () => {
      expect(
        residualRatioLabel({
          mode: "additive",
          value: 10,
          displayMultiplier: null,
          ratio: 0.5,
          knownUnquantified: [],
          unclassified: false,
          nextActions: [],
        })
      ).toBe("50%");
    });
  });

  describe("可視化の切替(誤読防止)", () => {
    it("乗法・全値正・寄与ゼロなしならwaterfall", () => {
      const pair = decomposedPair({
        residual: {
          mode: "multiplicative",
          value: Math.log(1.5),
          displayMultiplier: 1.5,
          ratio: 0.8,
          knownUnquantified: [],
          unclassified: false,
          nextActions: [],
        },
      });
      expect(chartMode(pair)).toBe("waterfall");
    });

    it("加法モードはtable", () => {
      expect(chartMode(decomposedPair({ mode: "additive" }))).toBe("table");
    });

    it("ゼロ寄与を含むとtable(相殺の誤読防止)", () => {
      const pair = decomposedPair({
        residual: {
          mode: "multiplicative",
          value: Math.log(1.5),
          displayMultiplier: 1.5,
          ratio: 0.8,
          knownUnquantified: [],
          unclassified: false,
          nextActions: [],
        },
      });
      pair.contributions[0].isZero = true;
      expect(chartMode(pair)).toBe("table");
    });

    it("残差比率が表示不能(相殺)ならtable", () => {
      expect(chartMode(decomposedPair({}))).toBe("table"); // COMMON既定のresidual.ratioはnull
    });

    it("停止ペアは常にtable", () => {
      expect(chartMode(stoppedPair())).toBe("table");
    });

    it("負値・ゼロ値を含む場合はtable", () => {
      expect(chartMode(decomposedPair({ valueA: 0 }))).toBe("table");
    });
  });

  describe("waterfall変換", () => {
    it("乗法分解を連続するwaterfall差分へ変換する(寄与→残差→到達点)", () => {
      const pair = decomposedPair({});
      expect(pairwiseToWaterfallSteps(pair, "A", "B").map((step) => step.value)).toEqual([100, 100, 100, 300]);
      expect(pairwiseToWaterfallSteps(pair, "A", "B").map((step) => step.label)).toEqual([
        "B 中心値",
        "時間の扱いの違い",
        "分解不能な残差",
        "A 中心値",
      ]);
    });

    it("加法分解は金額差をそのまま積む", () => {
      const pair = decomposedPair({
        mode: "additive",
        valueA: 0,
        valueB: 100,
        vStar: 100,
        totalDifference: -100,
        explainedSum: 0,
        contributions: [
          {
            factorId: "geographic_calibration",
            category: "geographic_model",
            label: "地理較正",
            shapley: 0,
            displayAmount: 0,
            displayMultiplier: null,
            shareRatio: null,
            isZero: true,
            swapped: [],
            evidence: [],
          },
        ],
        residual: {
          mode: "additive",
          value: -100,
          displayMultiplier: null,
          ratio: 1,
          knownUnquantified: [],
          unclassified: false,
          nextActions: [],
        },
      });
      expect(pairwiseToWaterfallSteps(pair, "A", "B").map((step) => step.value)).toEqual([100, 0, -100, 0]);
    });
  });

  describe("ゼロ値の意味(§5.6)", () => {
    it("zeroMeaningが無い0値は「意味未確定」と明示する(methodIdの文字列判定はしない)", () => {
      const record = { centralValue: exchangeAmount(0), methodId: "ifvi-water-consumption.access" } as ValuationRecord;
      expect(recordZeroMeaning(record)?.badgeLabel).toBe("意味未確定(出典未供給)");
    });

    it("trace.zeroMeaningがあればそのラベルと根拠を出す", () => {
      const record = {
        centralValue: exchangeAmount(0),
        methodId: "ifvi-water-consumption.VFnutrition",
        trace: {
          zeroMeaning: {
            code: "published_zero",
            candidates: ["published_zero", "computed_zero"],
            evidence: [{ source: "Appendix D Table D1" }],
            rationale: "出典が0.00と公表し、被覆外の明示が無いため規則2を適用。",
            assignedBy: "method_adapter",
          },
        },
      } as unknown as ValuationRecord;
      const display = recordZeroMeaning(record);
      expect(display?.badgeLabel).toBe("出典が0と公表");
      expect(display?.candidatesLabel).toBe("入力0等により計算結果が0");
    });

    it("値が0でなければnull", () => {
      const record = { centralValue: exchangeAmount(1), methodId: "m" } as ValuationRecord;
      expect(recordZeroMeaning(record)).toBeNull();
    });

    it("ペア単位はA側・B側それぞれの値とzeroMeaningA/Bを見る", () => {
      const pair = stoppedPair({
        valueA: 0,
        zeroMeaningA: {
          code: "not_applicable",
          candidates: ["not_applicable"],
          evidence: [],
          rationale: "概念が適用されない",
          assignedBy: "method_adapter",
        },
      });
      expect(pairZeroMeaning(pair, "A")?.badgeLabel).toBe("概念が適用されない");
      expect(pairZeroMeaning(pair, "B")).toBeNull();
    });

    it("zeroMeaningDisplayは未確定でもbadgeLabelとdetailを持つ", () => {
      const display = zeroMeaningDisplay(undefined);
      expect(display.code).toBe("unconfirmed");
      expect(display.candidatesLabel).toBeNull();
    });
  });

  describe("監査ドリルダウン", () => {
    it("subsetRowsは要因IDをcontributionsのlabelへ変換する", () => {
      const pair = decomposedPair({
        subsets: [
          { subset: [], fixed: ["time_model"], value: 100, traceHash: "h0", swapped: [] },
          { subset: ["time_model"], fixed: [], value: 200, traceHash: "h1", swapped: [] },
        ],
      });
      const rows = subsetRows(pair);
      expect(rows[0]).toEqual({ subsetLabel: "なし", fixedLabel: "時間モデル", value: 100, traceHash: "h0" });
      expect(rows[1].subsetLabel).toBe("時間モデル");
    });
  });

  describe("内訳分析(§4-8)", () => {
    const analysis: IntraMethodBreakdownAnalysis = {
      analysisUnit: "intra_method_breakdown",
      parentMethodId: "ifvi-water-consumption",
      subjectId: "subject:pq-1",
      aggregationFormula: "VFaccess + MAX(VFnutrition, VFdisease, VFes)",
      components: [
        { recordMethodId: "ifvi-water-consumption.VFes", subFactorId: "VFes", valueConcept: "welfare", value: 12_624_579, selectedByAggregation: true },
        {
          recordMethodId: "ifvi-water-consumption.VFnutrition",
          subFactorId: "VFnutrition",
          valueConcept: "welfare",
          value: 0,
          zeroMeaning: { code: "published_zero", candidates: ["published_zero"], evidence: [], rationale: "r", assignedBy: "method_adapter" },
          selectedByAggregation: false,
        },
      ],
      aggregate: { value: 12_624_579, mixesValueConcepts: true, note: "交換価値と厚生価値を合算した参考値です。" },
      narrative: "",
    };

    it("採用された内訳とゼロ意味を保持する", () => {
      const views = breakdownComponentViews(analysis);
      expect(views.find((v) => v.subFactorId === "VFes")?.selected).toBe(true);
      expect(views.find((v) => v.subFactorId === "VFnutrition")?.zeroMeaning?.badgeLabel).toBe("出典が0と公表");
    });

    it("価値概念混在の注意書きを返す", () => {
      expect(breakdownMixedConceptNote(analysis)).toBe("交換価値と厚生価値を合算した参考値です。");
    });

    it("混在しなければnull", () => {
      expect(breakdownMixedConceptNote({ ...analysis, aggregate: { value: 1, mixesValueConcepts: false, note: "" } })).toBeNull();
    });
  });
});
