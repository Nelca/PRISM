/**
 * T-21(指示書 §3.5):M4 完成実装の下流統合を技術的に通しで検証する。
 *
 *   代表値と理由の保存 → 新run(M4 V2 分解) → 財務接続・DecisionRecord → 開示 → 台帳(AssumptionEntry)・再計算ハッシュ
 *
 * これは架空企業(site-042)のデモ既定値による**技術通し検証**であり、1社実データの受入ではない
 * (受入は `docs/roadmap/prism-completion-acceptance.md` の別欄)。旧runの保持は DB 層
 * (`lib/db/persistence.db.test.ts`、append-only)の責務で、ここでは扱わない。
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_RNG_SEED, runDemoPipeline } from "./run-demo-pipeline";
import { emptyInteractionState } from "./interaction-state";
import type { InteractionState } from "./interaction-state";
import { isDivergenceDecompositionV2 } from "@core/types/divergence";
import { F3_THRESHOLD_DISABLED_VERSION, F8_THRESHOLD_DISABLED_VERSION } from "@core/divergence/mode-selection";

const FLAGSHIP_ISSUE = "site-042-mi-water";
const FLAGSHIP_SITE = "site-042";

function run(interactions: InteractionState = emptyInteractionState()) {
  return runDemoPipeline({ userSites: [], interactions, rngSeed: DEFAULT_RNG_SEED });
}

function selectRepresentative(recordId: string, methodId: string, valueConcept: "exchange" | "welfare", reason: string) {
  const interactions = emptyInteractionState();
  interactions.representativeRecordId.set(FLAGSHIP_ISSUE, recordId);
  interactions.representativeSelection.set(FLAGSHIP_ISSUE, { recordId, methodId, valueConcept, reason });
  return interactions;
}

describe("T-21 通し検証:M4 V2 分解 → 代表値選択 → M5/M6/M7 → 台帳・再計算ハッシュ", () => {
  const baseline = run();
  const water = baseline.valuation.divergenceDecompositions.find((d) => d.targetPhysicalQuantityId === "pq-site042-water-2027")!;
  const records = baseline.valuation.valuationRecordsByMaterialIssue[FLAGSHIP_ISSUE];

  it("新runの分解結果は V2(schemaVersion 2)で、比較対象・版・手法間ペア・内訳分析を持つ", () => {
    expect(water).toBeDefined();
    expect(isDivergenceDecompositionV2(water)).toBe(true);
    expect(water.subject.physicalQuantityId).toBe("pq-site042-water-2027");
    expect(water.subject.flow.kind === "water" && water.subject.flow.waterSource).toBe("unknown");
    expect(water.subject.provenance).toBe("demo_default");

    const crossPairs = water.groups.flatMap((g) => g.crossMethodPairs);
    const breakdowns = water.groups.flatMap((g) => g.breakdownAnalyses);
    expect(crossPairs).toHaveLength(4);
    expect(breakdowns).toHaveLength(1);
    expect(breakdowns[0].parentMethodId).toBe("ifvi-water-consumption");
    expect(breakdowns[0].aggregate?.mixesValueConcepts).toBe(true);
    // 内訳同士(同一親手法)のペアは手法間ペアに混ぜない(§4-8)。
    expect(crossPairs.every((p) => p.parentMethodIdA !== p.parentMethodIdB)).toBe(true);
    expect(water.groups.every((g) => g.groupLimit.exceeded === false)).toBe(true);
  });

  it("全レコードが再生可能なトレースを持ち、ゼロ値のレコードはアダプター付与のゼロ意味を持つ", () => {
    expect(records.length).toBe(6);
    for (const record of records) {
      expect(record.trace).toBeDefined();
      expect(Math.abs(record.trace!.finalValue.value - Number(record.centralValue))).toBeLessThan(1e-6);
      if (Number(record.centralValue) === 0) {
        expect(record.trace!.zeroMeaning?.code).toBe("published_zero");
        expect(record.trace!.zeroMeaning?.assignedBy).toBe("method_adapter");
      }
    }
  });

  it("再計算ハッシュの入力に M4 V2 の版(レシピ・許容誤差・同一性規則・経路対応表・f3/f8 無効化)が含まれる", () => {
    const inputs = baseline.recalculationHash.inputs;
    expect(inputs.m4_decompositionAlgorithmVersion).toBe("shapley-subset-v2");
    expect(inputs.m4_recipeRegistryVersion).toBe("recipe-registry-v3");
    expect(inputs.m4_toleranceVersion).toBe("tol-v1");
    expect(inputs.m4_subjectRuleVersion).toBe("subject-identity-v1");
    expect(inputs.m4_pathwayMappingVersion).toBe("pathway-mapping-v1");
    expect(inputs.m4_f3ThresholdVersion).toBe(F3_THRESHOLD_DISABLED_VERSION);
    expect(inputs.m4_f8ThresholdVersion).toBe(F8_THRESHOLD_DISABLED_VERSION);
    // 同じ入力・同じ版からは同じ分解ハッシュが出る(再現性)。
    expect(run().valuation.divergenceDecompositions.find((d) => d.id === water.id)!.recalculationHash).toBe(water.recalculationHash);
  });

  it("台帳(M4 decomposition)は手法間ペアごとに1件で、レシピ版・分解区分または停止理由を持つ", () => {
    const entries = baseline.assumptionEntries.filter(
      (e) => e.sourceModule === "M4" && e.payload.kind === "decomposition" && e.relatedRecordId === water.id
    );
    expect(entries).toHaveLength(4);
    const payloads = entries.map((e) => e.payload).filter((p): p is Extract<typeof p, { kind: "decomposition" }> => p.kind === "decomposition");
    expect(payloads.filter((p) => p.decompositionStatus === "decomposed")).toHaveLength(2);
    const stopped = payloads.filter((p) => p.decompositionStatus === "stopped");
    expect(stopped).toHaveLength(2);
    // 代替費用法 vs VFaccess は反実仮想を定義できない。LIME3 vs VFes は経路対応がレビュー待ち(H-01)で確定結果に混ぜない。
    expect(stopped.map((p) => p.stopReason).sort()).toEqual(["no_numerizable_factors", "recipe_not_registrable"]);
    for (const p of payloads) {
      expect(p.f3ThresholdVersion).toBe(F3_THRESHOLD_DISABLED_VERSION);
      expect(p.toleranceVersion).toBe("tol-v1");
      if (p.decompositionStatus === "decomposed") {
        expect(p.recipeId).toBeTruthy();
        expect(p.recipeVersion).toBeTruthy();
        expect(p.recipeHash).toBeTruthy();
      }
    }
  });

  it("代表値の選択と理由が分解結果と台帳に保存され、再読出しできる", () => {
    const vfaccess = records.find((r) => r.methodId === "ifvi-water-consumption.VFaccess")!;
    const reason = "将来の水アクセス費用の観点を投資判断に反映するため(検証用の理由文)";
    const result = run(selectRepresentative(vfaccess.id, vfaccess.methodId, "exchange", reason));

    const decomposition = result.valuation.divergenceDecompositions.find((d) => d.id === water.id)!;
    expect(decomposition.representativeValueSelection?.selectedMethodId).toBe(vfaccess.methodId);
    expect(decomposition.representativeValueSelection?.reason).toBe(reason);
    expect(decomposition.representativeValueSelection?.priorYearMethodId).toBeDefined();
    expect(result.valuation.representativeRecordByMaterialIssue[FLAGSHIP_ISSUE]).toBe(vfaccess.id);

    const selectionEntry = result.assumptionEntries.find(
      (e) => e.payload.kind === "representative_value_selection" && e.relatedRecordId === decomposition.id
    );
    expect(selectionEntry).toBeDefined();
    expect(selectionEntry!.payload.kind === "representative_value_selection" && selectionEntry!.payload.reason).toBe(reason);
    expect(decomposition.assumptionEntryIds).toContain(selectionEntry!.id);
    // 分解不能(停止ペアあり)でも、価値概念・用途を満たす手法の選択は禁止されない(§3.5 M4→代表値選択)。
    const stoppedPair = decomposition.groups
      .flatMap((g) => g.crossMethodPairs)
      .find((p) => p.status === "stopped" && [p.methodIdA, p.methodIdB].includes(vfaccess.methodId));
    expect(stoppedPair).toBeDefined();
  });

  it("選択の変更が財務接続・DecisionRecord・開示・台帳へ整合して反映される(厚生価値は投資判断へ流れない)", () => {
    const replacement = records.find((r) => r.methodId === "replacement-cost")!;
    const vfaccess = records.find((r) => r.methodId === "ifvi-water-consumption.VFaccess")!;
    const lime3 = records.find((r) => r.methodId === "lime3-water")!;

    const withReplacement = run(selectRepresentative(replacement.id, replacement.methodId, "exchange", "現時点の代替調達コストを基準にする"));
    const withVfaccess = run(selectRepresentative(vfaccess.id, vfaccess.methodId, "exchange", "将来アクセス費用を基準にする"));
    const withLime3 = run(selectRepresentative(lime3.id, lime3.methodId, "welfare", "社会的費用ビューで開示する"));

    const decisionOf = (r: ReturnType<typeof run>) => r.decisions.find((d) => d.siteId === FLAGSHIP_SITE)!;
    const npv = (r: ReturnType<typeof run>) => decisionOf(r).decision.decisionRecord.natureAdjustedNpv.quantileRange.p50;

    // 交換価値の代表値を変えると、財務接続(未内部化コスト・将来内部化見込み)が同じ run 内で変わる。
    const bridge = (r: ReturnType<typeof run>) => decisionOf(r).financialBridge;
    expect(Number(bridge(withReplacement).internalizationStatus.uninternalizedCost)).not.toBe(
      Number(bridge(withVfaccess).internalizationStatus.uninternalizedCost)
    );
    expect(Number(bridge(withReplacement).bridge1.futureInternalizationCost)).not.toBe(
      Number(bridge(withVfaccess).bridge1.futureInternalizationCost)
    );
    // DecisionRecord は両方とも有限値で確定する。VFaccess(公表0)を選ぶと対策案のレンジ計算は
    // 出典を差し替え(D-01)、その事実が警告として run に残る(黙って別の値を使わない)。
    expect(Number.isFinite(npv(withReplacement))).toBe(true);
    expect(Number.isFinite(npv(withVfaccess))).toBe(true);
    expect(withVfaccess.warnings.some((w) => w.id === `countermeasure-source-fallback-${FLAGSHIP_SITE}`)).toBe(true);
    expect(withReplacement.warnings.some((w) => w.id === `countermeasure-source-fallback-${FLAGSHIP_SITE}`)).toBe(false);
    // 厚生価値(LIME3)を代表値に選んでも、意思決定接続は交換価値レコードへフォールバックする(X7・D-24)。
    expect(Number.isFinite(npv(withLime3))).toBe(true);
    expect(npv(withLime3)).toBe(npv(withReplacement));
    expect(Number(bridge(withLime3).internalizationStatus.uninternalizedCost)).toBe(
      Number(bridge(withReplacement).internalizationStatus.uninternalizedCost)
    );

    // 開示検証は選択後の run でも最後まで通り、DecisionRecord・分解は台帳エントリを参照する。
    expect(withVfaccess.disclosure.gapFindings.length).toBeGreaterThan(0);
    expect(decisionOf(withVfaccess).decision.decisionRecord.recalculationHash).toBeTruthy();
    // M4 の台帳エントリ(分解4件+代表値選択1件)が選択後の run にも揃っている。
    expect(
      withVfaccess.assumptionEntries.filter((e) => e.sourceModule === "M4" && e.relatedRecordId === water.id)
    ).toHaveLength(5);
    // 選択理由は run ごとに保持され、以前の理由と混ざらない。
    const reasons = [withReplacement, withVfaccess].map(
      (r) => r.valuation.divergenceDecompositions.find((d) => d.id === water.id)!.representativeValueSelection!.reason
    );
    expect(new Set(reasons).size).toBe(2);
  });
});
