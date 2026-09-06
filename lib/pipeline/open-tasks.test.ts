import { describe, expect, test } from "vitest";
import { runDemoPipeline, DEFAULT_RNG_SEED } from "@/lib/demo/run-demo-pipeline";
import { emptyInteractionState } from "@/lib/demo/interaction-state";
import type { InteractionState } from "@/lib/demo/interaction-state";
import { formatCompactYenRange } from "@/app/components/numeric";
import { deriveOpenTasks } from "./open-actions";
import { deriveFindings } from "./pipeline-findings";
import {
  decompositionForMaterialIssue,
  countProgress,
  deriveMoneySummary,
  deriveStepProgress,
  hasRepresentativeSelection,
  materialIssueIdsRequiringRepresentativeSelection,
  materialIssueIdsWithWelfareOnlyValuation,
  materialIssueIdsWithoutRepresentativeSelection,
  pairDivergenceRatio,
  sitesWithDegenerateRepresentative,
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
    expect(tasks.every((task) => task.section.startsWith("/"))).toBe(true);
  });

  test("投資の承認ラインが未入力なら、確認先を短く示す", () => {
    const tasks = deriveOpenTasks(run(withPendingThreshold()));
    const pending = tasks.find((task) => task.id === "approval-threshold");

    expect(pending).toBeDefined();
    expect(pending!.text).toContain("承認ラインが未入力(財務・経営企画部門へ確認)");
    expect(pending!.href).toMatch(/^\/decision\//);
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

  test("進捗件数は全課題・優先度算定済み・詳細評価・代表値対象・厚生価値のみを分けて返す", () => {
    const result = run();
    const counts = countProgress(result);
    const representativeRequired = materialIssueIdsRequiringRepresentativeSelection(result);
    const welfareOnly = materialIssueIdsWithWelfareOnlyValuation(result);

    expect(counts.total).toBe(result.assessment.materialIssues.length);
    expect(counts.prioritized).toBe(result.assessment.priorityScores.length);
    expect(counts.deepDive).toBe(result.assessment.depthDecisions.filter((decision) => decision.depth === "deep_dive").length);
    expect(counts.representativeRequired).toBe(representativeRequired.length);
    expect(counts.welfareOnly).toBe(welfareOnly.length);
    expect(counts.selected).toBe(representativeRequired.length - materialIssueIdsWithoutRepresentativeSelection(result).length);
  });

  test("厚生価値のみで代表値選択が不要な場合も、算定工程を完了扱いにする", () => {
    const result = run();
    const [issueId, records] = Object.entries(result.valuation.valuationRecordsByMaterialIssue).find(([, candidates]) =>
      candidates.some((record) => record.valueConcept === "welfare")
    )!;
    result.valuation.valuationRecordsByMaterialIssue = {
      [issueId]: records.filter((record) => record.valueConcept === "welfare"),
    };
    result.valuation.divergenceDecompositions = [];
    result.valuation.representativeRecordByMaterialIssue = {};

    const progress = deriveStepProgress(result).find((step) => step.href === "/valuation")!;
    expect(progress.done).toBe(true);
    expect(progress.note).toContain("代表値選択は不要");
    expect(progress.note).not.toContain("0/0件");
  });

  test("判定が保留の拠点があれば⑤は未完了", () => {
    const steps = deriveStepProgress(run(withPendingThreshold()));
    expect(steps.find((step) => step.href === "/decision")!.done).toBe(false);
  });
});

describe("倍率表示の共通ルール", () => {
  /** 倍率は両端の値だけで決まる。分解できたか(status)には依存しない。 */
  const pairWith = (valueA: number, valueB: number) =>
    ({ valueA, valueB }) as unknown as Parameters<typeof pairDivergenceRatio>[0];

  test("大きい値を小さい値で割り、ペアの向きに左右されない", () => {
    expect(pairDivergenceRatio(pairWith(5, 100))).toBe(20);
    expect(pairDivergenceRatio(pairWith(100, 5))).toBe(20);
  });

  test("0円や負値が絡む場合は倍率を表示しない", () => {
    expect(pairDivergenceRatio(pairWith(0, 100))).toBeNull();
    expect(pairDivergenceRatio(pairWith(-10, 100))).toBeNull();
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
    expect(impairment!.href).toMatch(/^\/financial-bridge\//);
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

/**
 * 2026-08-23レビュー第3回:「本社工場 × 取水量・水ストレス」の代表値にIFVI水ストレス係数
 * (日本の公表係数が0のため中心値0円)が選択されると、`computeInternalizationStatus`
 * (packages/core、変更不可)の未内部化コストが負になり、④の利益への影響が
 * プラス方向(改善したかのよう)に反転して表示されていた。実際には改善ではなく
 * 代表値選択の問題であることを、ホーム・④が導出する未完了タスクとして検知する。
 */
describe("縮退した代表値(中心値0円)の検知", () => {
  const FLAGSHIP_ISSUE = "site-042-mi-water";

  /** 本社工場の代表値を、中心値0円のIFVI水ストレス係数(VFaccess)に明示的に切り替えた状態。 */
  function withDegenerateRepresentative(): InteractionState {
    const records = run().valuation.valuationRecordsByMaterialIssue[FLAGSHIP_ISSUE];
    const chosen = records.find(
      (r) => r.methodId === "ifvi-water-consumption.VFaccess" && r.valueConcept === "exchange"
    )!;
    expect(chosen.centralValue as unknown as number).toBe(0); // 前提確認:日本の公表係数は0
    const interactions = emptyInteractionState();
    interactions.representativeRecordId.set(FLAGSHIP_ISSUE, chosen.id);
    interactions.representativeSelection.set(FLAGSHIP_ISSUE, {
      recordId: chosen.id,
      methodId: chosen.methodId,
      valueConcept: "exchange",
      reason: "IFVI水ストレス係数を採用",
    });
    return interactions;
  }

  test("既定の代表値(代替費用法)のままなら該当拠点は挙がらない", () => {
    const result = run();
    expect(sitesWithDegenerateRepresentative(result)).toEqual([]);
    expect(deriveOpenTasks(result).map((t) => t.id)).not.toContain("degenerate-representative");
  });

  test("中心値0円の代表値を選ぶと、未内部化コストが負になり該当拠点として挙がる", () => {
    const result = run(withDegenerateRepresentative());
    const degenerate = sitesWithDegenerateRepresentative(result);

    expect(degenerate.map((d) => d.siteName)).toContain("本社工場");
    expect(degenerate.every((d) => d.uninternalizedCost < 0)).toBe(true);

    const task = deriveOpenTasks(result).find((t) => t.id === "degenerate-representative");
    expect(task).toBeDefined();
    expect(task!.text).toContain("本社工場");
    expect(task!.text).toContain("未内部化コストが負");
    expect(task!.href).toMatch(/^\/valuation\//);
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

/**
 * 指示B(2026-08-23レビュー第3回):`formatCompactYen(low)`〜`formatCompactYen(high)`のように
 * 両端を別々にスケールすると「年57,761円〜12.6百万円」のように単位が混在する。
 * `formatCompactYenRange` は `pickYenScale` で共通スケールを1つ選び、両端に必ず適用する。
 */
describe("formatCompactYenRange(指示B:金額レンジの単位統一)", () => {
  test("両端を同じ単位で表示する(単位が混在しない)", () => {
    const range = formatCompactYenRange(57_761, 12_624_579);
    expect(range.endsWith("百万円")).toBe(true);
    // 低い側も百万円で表示され、円単位のまま残らない。
    expect(range).toMatch(/^\d+(\.\d+)?百万円〜\d+(\.\d+)?百万円$/);
  });

  test("共通スケールで0.0に潰れる場合は小数2桁まで許容する", () => {
    // 100億円スケールで割ると57,761円は0.0000578億円→小数1桁では0.0億円に潰れる。
    const range = formatCompactYenRange(57_761, 150_000_000);
    expect(range).not.toContain("0.0億円");
    expect(range.endsWith("億円")).toBe(true);
  });

  test("両端とも小さい金額ならフル桁のまま(スケールしない)", () => {
    expect(formatCompactYenRange(1_000, 5_000)).toBe("1,000円〜5,000円");
  });
});

describe("実データの発見サマリー(指示B)でも単位が混在しないことを確認する", () => {
  test("finding-divergenceのheadlineが両端とも同じ単位で書かれている", () => {
    const findings = deriveFindings(run());
    const divergence = findings.find((f) => f.id === "finding-divergence");
    expect(divergence).toBeDefined();

    // headline中の金額レンジ部分(「年◯◯〜◯◯(」)を取り出し、両端の単位が一致することを確認する。
    const match = divergence!.headline.match(/年([^(]+)\(/);
    expect(match).not.toBeNull();
    const [low, high] = match![1].split("〜");
    const unitOf = (s: string) => s.replace(/[\d,.]/g, "").trim();
    expect(unitOf(low)).toBe(unitOf(high));
  });
});
