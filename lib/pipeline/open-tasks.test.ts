import { describe, expect, test } from "vitest";
import { runDemoPipeline, DEFAULT_RNG_SEED } from "@/lib/demo/run-demo-pipeline";
import { emptyInteractionState } from "@/lib/demo/interaction-state";
import type { InteractionState } from "@/lib/demo/interaction-state";
import {
  decompositionForMaterialIssue,
  deriveFindings,
  deriveMoneySummary,
  deriveOpenTasks,
  deriveStepProgress,
  hasRepresentativeSelection,
  materialIssueIdsWithoutRepresentativeSelection,
} from "./open-tasks";

function run(interactions: InteractionState = emptyInteractionState()) {
  return runDemoPipeline({ userSites: [], interactions, rngSeed: DEFAULT_RNG_SEED });
}

/** 承認閾値だけを未入力にした状態(M6 D-10:仮の値は置かず判定を保留にする)。 */
function withPendingThreshold(): InteractionState {
  const interactions = emptyInteractionState();
  interactions.decisionParameters.set("site-042", {
    baselineNpvValue: 1_200_000_000,
    discountRate: 0.06,
    horizon: 10,
    approvalThresholdValue: null,
  });
  return interactions;
}

describe("deriveOpenTasks", () => {
  test("実際の計算結果から導出する(該当のない項目は出さない)", () => {
    const tasks = deriveOpenTasks(run());
    const ids = tasks.map((task) => task.id);

    expect(ids).toContain("representative-value");
    expect(ids).toContain("impairment");
    // 既定のデモデータでは全拠点の閾値が入っているため、保留のタスクは出ない。
    expect(ids).not.toContain("approval-threshold");
    // すべてのタスクが遷移先とリンクラベルを持つ(ホームのチェックリストから直接飛べる)。
    expect(tasks.every((task) => task.href.startsWith("/") && task.linkLabel.length > 0)).toBe(true);
  });

  test("投資の承認ラインが未入力なら、誰に聞けばよいかまで書いたタスクを出す", () => {
    const tasks = deriveOpenTasks(run(withPendingThreshold()));
    const pending = tasks.find((task) => task.id === "approval-threshold");

    expect(pending).toBeDefined();
    expect(pending!.text).toContain("投資の承認ラインが未入力のため判定が保留中です(財務・経営企画部門への確認が必要)");
    expect(pending!.href).toBe("/decision");
  });
});

describe("deriveStepProgress", () => {
  test("6ステップの完了状態をパイプライン結果から導く", () => {
    const steps = deriveStepProgress(run());
    expect(steps.map((step) => step.order)).toEqual([1, 2, 3, 4, 5, 6]);

    const byHref = new Map(steps.map((step) => [step.href, step]));
    expect(byHref.get("/sites")!.done).toBe(true);
    expect(byHref.get("/assessment")!.done).toBe(true);
    // 代表値が未選択のため③は未完了、判定は確定しているため⑤は完了。
    expect(byHref.get("/valuation")!.done).toBe(false);
    expect(byHref.get("/financial-bridge")!.done).toBe(true);
    expect(byHref.get("/decision")!.done).toBe(true);
  });

  test("判定が保留の拠点があれば⑤は未完了", () => {
    const steps = deriveStepProgress(run(withPendingThreshold()));
    expect(steps.find((step) => step.href === "/decision")!.done).toBe(false);
  });
});

describe("deriveFindings", () => {
  test("「結論は変わらない」も確定した結論として出す", () => {
    const findings = deriveFindings(run());
    const notCrossing = findings.find((finding) => finding.id === "finding-verdict-does-not-cross");

    expect(notCrossing).toBeDefined();
    expect(notCrossing!.headline).toContain("投資判断の結論は変わらない");
    expect(notCrossing!.detail).toContain("この論点は今回の投資判断を変えない");
  });

  test("減損テストの前提に抵触する拠点を発見として出す(正確な値はtitle属性に退避)", () => {
    const findings = deriveFindings(run());
    const impairment = findings.find((finding) => finding.id === "finding-impairment");

    expect(impairment).toBeDefined();
    expect(impairment!.headline).toContain("減損テストの前提の見直しが必要な水準");
    expect(impairment!.exact).toMatch(/円$/);
    expect(impairment!.href).toBe("/financial-bridge");
  });

  test("判定が保留中の拠点は発見ではなくタスクとして扱う", () => {
    const findings = deriveFindings(run(withPendingThreshold()));
    const verdictFindings = findings.filter((finding) => finding.id.startsWith("finding-verdict-"));

    for (const finding of verdictFindings) {
      expect(finding.headline).not.toContain("本社工場");
    }
  });
});

/**
 * 第4版 D-02:「まだ代表値を選んでいない課題」の判定が③の画面と未完了タスクで
 * 二重実装になっていた。同じ関数を通ることと、既定値のままの課題と明示選択済みの
 * 課題が区別されることを検証する。
 */
describe("代表値の選択状況の判定(D-02)", () => {
  const FLAGSHIP_ISSUE = "site-042-mi-water";

  /** 本社工場だけ代表値を明示的に選んだ状態。 */
  function withExplicitSelection(): InteractionState {
    const records = run().valuation.valuationRecordsByMaterialIssue[FLAGSHIP_ISSUE];
    const chosen = records.find((r) => r.methodId === "replacement-cost")!;
    const interactions = emptyInteractionState();
    interactions.representativeRecordId.set(FLAGSHIP_ISSUE, chosen.id);
    interactions.representativeSelection.set(FLAGSHIP_ISSUE, {
      recordId: chosen.id,
      methodId: chosen.methodId,
      valueConcept: "exchange",
      reason: "既存の社内基準に合わせるため",
    });
    return interactions;
  }

  test("何も選んでいなければ、すべての課題が未選択として挙がる", () => {
    const result = run();
    const unselected = materialIssueIdsWithoutRepresentativeSelection(result);

    expect(unselected).toContain(FLAGSHIP_ISSUE);
    expect(unselected.length).toBe(result.valuation.divergenceDecompositions.length);
    expect(hasRepresentativeSelection(result, FLAGSHIP_ISSUE)).toBe(false);
  });

  test("明示的に選んだ課題は未選択に挙がらない(既定値のままの課題とは区別する)", () => {
    const result = run(withExplicitSelection());

    expect(hasRepresentativeSelection(result, FLAGSHIP_ISSUE)).toBe(true);
    expect(materialIssueIdsWithoutRepresentativeSelection(result)).not.toContain(FLAGSHIP_ISSUE);
  });

  test("未完了タスクの件数が、③の画面が使う判定と必ず一致する", () => {
    for (const interactions of [emptyInteractionState(), withExplicitSelection()]) {
      const result = run(interactions);
      const unselected = materialIssueIdsWithoutRepresentativeSelection(result);
      const task = deriveOpenTasks(result).find((t) => t.id === "representative-value");

      if (unselected.length === 0) {
        expect(task).toBeUndefined();
      } else {
        expect(task!.text).toContain(`${unselected.length}件`);
      }
      // 工程の進捗(ホーム)の「選択済み◯/◯件」も同じ数え方から出る。
      const progress = deriveStepProgress(result).find((step) => step.href === "/valuation")!;
      expect(progress.note).toContain(`${result.valuation.divergenceDecompositions.length - unselected.length}/`);
    }
  });

  test("分解の引き当ては課題IDで一意に決まる", () => {
    const result = run();
    for (const materialIssueId of Object.keys(result.valuation.valuationRecordsByMaterialIssue)) {
      expect(decompositionForMaterialIssue(result, materialIssueId)).toBeDefined();
    }
    expect(decompositionForMaterialIssue(result, "存在しない課題")).toBeUndefined();
  });
});

describe("deriveMoneySummary", () => {
  test("1拠点1行の金額サマリーを返し、自然債務のみを合算する", () => {
    const summary = deriveMoneySummary(run());

    expect(summary.rows.length).toBeGreaterThan(0);
    // 合計は行の自然債務の総和と厳密に一致する(交換価値のみ。比率は合算しない)。
    const total = summary.rows.reduce((sum, row) => sum + row.natureDebt, 0);
    expect(summary.totalNatureDebt).toBe(total);
    // 利益への影響は有限の比率として算出される(分母0でもNaN/Infinityにしない)。
    expect(summary.rows.every((row) => Number.isFinite(row.profitImpactPct))).toBe(true);
  });
});
