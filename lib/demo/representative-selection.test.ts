/**
 * 第4版 D-01:代表値の変更・企業財務データの入力が例外で失敗し、以後のあらゆる操作が
 * 同じ例外で失敗し続けた不具合の回帰テスト。
 *
 * 根本原因: IFVIの水アクセス係数(VFaccess)は日本の公表値が0(company.tsの
 * `ifvi-vfaccess: 0.0`、IFVI Table D1)であり、これを代表値に選ぶと交換価値レコードの
 * quantileRangeが p5=p50=p95=0 になる。`packages/core` のM6はこのレコードの
 * p5/p50・(p95-p5)/p50 を取るため 0/0 = NaN になり、支配的レコードが1件も選ばれず
 * `NoContributingRecordError`(dominant-assumption.ts)が投げられていた。
 */

import { describe, expect, it } from "vitest";
import { runDemoPipeline, DEFAULT_RNG_SEED } from "./run-demo-pipeline";
import { emptyInteractionState, projectInteractionState } from "./interaction-state";
import type { InteractionEvent, InteractionState } from "./interaction-state";

const FLAGSHIP_ISSUE = "site-042-mi-water";
const FLAGSHIP_SITE = "site-042";

function run(interactions: InteractionState = emptyInteractionState()) {
  return runDemoPipeline({ userSites: [], interactions, rngSeed: DEFAULT_RNG_SEED });
}

function selectRepresentative(materialIssueId: string, recordId: string, methodId: string, valueConcept: string) {
  const interactions = emptyInteractionState();
  interactions.representativeRecordId.set(materialIssueId, recordId);
  interactions.representativeSelection.set(materialIssueId, {
    recordId,
    methodId,
    valueConcept: valueConcept as "exchange" | "welfare",
    reason: "テストのための選択",
  });
  return interactions;
}

describe("代表値をどの手法に変えてもパイプラインが通る(D-01)", () => {
  const baseline = run();
  const records = baseline.valuation.valuationRecordsByMaterialIssue[FLAGSHIP_ISSUE];

  it("交換価値の手法が2本以上あり、そのうち中心値0の手法(VFaccess)が含まれる", () => {
    const exchange = records.filter((r) => r.valueConcept === "exchange");
    expect(exchange.length).toBeGreaterThanOrEqual(2);
    expect(exchange.some((r) => r.quantileRange.p50 === 0)).toBe(true);
  });

  for (const record of records) {
    it(`代表値を ${record.methodId} に変更しても例外にならない`, () => {
      const result = run(selectRepresentative(FLAGSHIP_ISSUE, record.id, record.methodId, record.valueConcept));
      const decision = result.decisions.find((d) => d.siteId === FLAGSHIP_SITE);
      expect(decision).toBeDefined();
      // 判定のレンジがNaNで汚染されていないこと(0/0の按分が起きていない)。
      const range = decision!.decision.decisionRecord.natureAdjustedNpv.quantileRange;
      expect(Number.isFinite(range.p5)).toBe(true);
      expect(Number.isFinite(range.p50)).toBe(true);
      expect(Number.isFinite(range.p95)).toBe(true);
    });
  }

  it("中心値0の手法を代表値にすると、出典を差し替えたことを警告として残す", () => {
    const zero = records.find((r) => r.valueConcept === "exchange" && r.quantileRange.p50 === 0)!;
    const result = run(selectRepresentative(FLAGSHIP_ISSUE, zero.id, zero.methodId, zero.valueConcept));

    const warning = result.warnings.find((w) => w.id === `countermeasure-source-fallback-${FLAGSHIP_SITE}`);
    expect(warning).toBeDefined();
    expect(warning!.screen).toBe("/decision");
    // 生の内部IDを画面文言に出さない(指示06・D-03)。
    expect(warning!.message).not.toContain("ifvi-water-consumption.");
    expect(warning!.message).toContain("将来の水アクセス費用");
  });

  it("代表値そのものは利用者が選んだ手法のまま(出典の差し替えは対策案のレンジ計算だけ)", () => {
    const zero = records.find((r) => r.valueConcept === "exchange" && r.quantileRange.p50 === 0)!;
    const result = run(selectRepresentative(FLAGSHIP_ISSUE, zero.id, zero.methodId, zero.valueConcept));
    expect(result.valuation.representativeRecordByMaterialIssue[FLAGSHIP_ISSUE]).toBe(zero.id);
  });
});

describe("壊れたイベントが残った状態からの回復(D-01-3)", () => {
  /** 実際にユーザーのDBに残っていたイベント列を模したもの(代表値=VFaccess → その後の各種操作)。 */
  function eventsWithPoisonedSelection(): InteractionEvent[] {
    const records = run().valuation.valuationRecordsByMaterialIssue[FLAGSHIP_ISSUE];
    const vfaccess = records.find((r) => r.methodId === "ifvi-water-consumption.VFaccess")!;
    return [
      {
        id: "ie-1",
        createdAt: "2026-08-16T20:12:20.000Z",
        actor: "宮里",
        kind: "representative_selection",
        subjectId: FLAGSHIP_ISSUE,
        payload: {
          recordId: vfaccess.id,
          methodId: vfaccess.methodId,
          valueConcept: "exchange",
          fromLabel: "代替費用法(浄水コスト)",
          toLabel: "IFVI 水ストレス係数(将来の水アクセス費用)",
          reason: "良さそうだから",
        },
      },
    ];
  }

  it("既にDBに残っている「壊すイベント」の上でも、企業財務データの入力が通る", () => {
    const events = [
      ...eventsWithPoisonedSelection(),
      {
        id: "ie-2",
        createdAt: "2026-08-16T20:22:47.000Z",
        actor: "宮里",
        kind: "company_financials" as const,
        subjectId: "company",
        payload: {
          financials: {
            reportedOperatingProfit: 12_300_000_000,
            currentlyInternalizedCost: 200_000_000,
            existingImpairmentThreshold: 500_000_000,
            netDebt: 50_000_000,
            ebitda: 1_000_000_000,
            interestExpense: 30_000_000,
          },
        },
      },
    ];

    const result = run(projectInteractionState(events));
    const bridge = result.decisions.find((d) => d.siteId === FLAGSHIP_SITE)!.financialBridge;
    expect(bridge.bridge1.reportedOperatingProfit as unknown as number).toBe(12_300_000_000);
  });

  it("現在の算定結果に無い行を指す代表値の指定は、既定値に戻して警告に残す", () => {
    const interactions = emptyInteractionState();
    interactions.representativeRecordId.set(FLAGSHIP_ISSUE, "存在しないレコード");

    const result = run(interactions);
    const warning = result.warnings.find((w) => w.id === `representative-record-unresolved-${FLAGSHIP_ISSUE}`);
    expect(warning).toBeDefined();
    expect(warning!.screen).toBe("/valuation");
    // 既定値(代替費用法)で計算は続く。
    expect(result.valuation.representativeRecordByMaterialIssue[FLAGSHIP_ISSUE]).toContain("replacement-cost");
  });

  it("現在の手法セットに無い手法を指す代表値の選択は、その課題だけ外して警告に残す", () => {
    const interactions = emptyInteractionState();
    interactions.representativeSelection.set(FLAGSHIP_ISSUE, {
      recordId: "廃止された手法のレコード",
      methodId: "撤去済みの手法",
      valueConcept: "exchange",
      reason: "過去に選んだ理由",
    });

    const result = run(interactions);
    const warning = result.warnings.find((w) => w.id === `representative-selection-unusable-${FLAGSHIP_ISSUE}`);
    expect(warning).toBeDefined();
    expect(warning!.screen).toBe("/valuation");
    // 他の課題の計算は通常どおり成立する。
    expect(result.decisions.length).toBeGreaterThan(0);
  });

  it("操作が何も壊れていなければ警告は出ない", () => {
    expect(run().warnings).toEqual([]);
  });
});

describe("「対策を実施せず監視を継続」案がM6 D-3で例外にならない(2026-08-17レビュー、第5版)", () => {
  /**
   * 根本原因: 「対策を実施せず監視を継続」案は回避コストが0円のため
   * `avoidedNatureCost: []`(company.ts)で構成される。この案のNPVレンジは
   * 通常NPVちょうどに退化し(p5=p50=p95=baselineNpvValue)、承認閾値が
   * その値と厳密に一致する入力だと★判定が「またぐ」になる。この場合
   * `identifyDominantAssumption`(M6 D-3、packages/core・変更不可)が
   * 「参照できるValuationRecordが1つもない」を例外として投げる。
   *
   * この組み合わせは、書き込み経路(Server Action、`tryRunAndPersist`)では
   * 事前検証で捕捉されフォーム内エラーになるが、**保存済みのrunを読み直すだけの
   * 経路(`executeAndPersistRun`、ページの再訪問時など)では従来捕捉されず、
   * ページ全体がクラッシュしていた。**このテストは`runDemoPipeline`自体が
   * 例外を投げないこと(=読み直し経路でも安全なこと)を検証する。
   */
  function decisionParametersEvent(approvalThresholdValue: number): InteractionEvent {
    return {
      id: "ie-params",
      createdAt: "2026-08-17T00:00:00.000Z",
      actor: "テスト",
      kind: "decision_parameters",
      subjectId: FLAGSHIP_SITE,
      payload: {
        parameters: { baselineNpvValue: 1_200_000_000, discountRate: 0.06, horizon: 10, approvalThresholdValue },
      },
    };
  }

  function countermeasureSelectionEvent(key: string): InteractionEvent {
    return {
      id: "ie-cm",
      createdAt: "2026-08-17T00:00:01.000Z",
      actor: "テスト",
      kind: "countermeasure_selection",
      subjectId: FLAGSHIP_SITE,
      payload: { key },
    };
  }

  it("承認閾値が通常NPVとちょうど一致し、『対策を実施せず監視を継続』を選んでいても例外にならない", () => {
    const events = [decisionParametersEvent(1_200_000_000), countermeasureSelectionEvent("acceptance")];
    expect(() => run(projectInteractionState(events))).not.toThrow();
  });

  it("計算できなかった対策案は比較対象から外し、理由を警告として残す(黙って消さない)", () => {
    const events = [decisionParametersEvent(1_200_000_000), countermeasureSelectionEvent("acceptance")];
    const result = run(projectInteractionState(events));

    const previewWarning = result.warnings.find((w) => w.id === "countermeasure-preview-failed-site-042-acceptance");
    expect(previewWarning).toBeDefined();
    expect(previewWarning!.screen).toBe("/decision");

    // 選択されていた対策案が使えないため、既定の対策案にフォールバックしたことも警告に残す。
    const fallbackWarning = result.warnings.find((w) => w.id === "countermeasure-selection-unavailable-site-042");
    expect(fallbackWarning).toBeDefined();

    // フォールバックにより、判定自体は計算できている(サイト全体を落とさない)。
    const decision = result.decisions.find((d) => d.siteId === FLAGSHIP_SITE);
    expect(decision).toBeDefined();
    expect(Number.isFinite(decision!.decision.decisionRecord.natureAdjustedNpv.central as unknown as number)).toBe(true);
  });
});
