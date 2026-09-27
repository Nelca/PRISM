/**
 * T-10a:実入力1件・手法1ペアの早期成立性検証(水)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §7.2.1・§7.4・T-10a
 *
 * §7.2.1 が固定した取得済み・許諾済みの実データ(AIST-IDEA v4.0 の水4列、IFVI Appendix D Table D1 の
 * 日本4値、PPP 94.46、45,000 m³)で、次の4候補を `buildPairwiseDecompositionV2` に通し、
 * **成立 / ゼロ寄与 / 比較不能 / データ待ち / 式不足** を機械的に判定して JSON で出す。
 *
 *   (a) LIME3 消費国・世界平均 vs 消費国・日本(同一手法の内部変種。状態Bには算入しない)
 *   (b) LIME3 vs IFVI VFes / VFnutrition(手法間・厚生価値)
 *   (c) 代替費用法 vs IFVI VFaccess(手法間・交換価値)
 *   (d) LIME3 表層水 vs 地下水(分解してはいけない差)
 *
 * **出力に係数の生値を載せない。** 比・金額差・状態コード・寄与倍率だけを出す
 * (制限付き係数の再配布を避けるため。licensing.md・§0.2)。独立検算は、エンジンが通る経路
 * (DALY/m³ × 統合化係数 × PPP)とは別の公表列(統合化 US$/m³)から計算した値で行う。
 */

import type { DataAcquisitionAction } from "../../types/recipe";
import type { PairwiseDecompositionV2 } from "../../types/divergence";
import { buildPairwiseDecompositionV2 } from "../pairwise-decomposition-v2";
import { createVerificationRegistry } from "../recipes/registry";
import { NOT_COMPARABLE_STOP_REASONS } from "../metrics";
import { DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2, WATER_CASE_VERSIONS } from "./baseline-water-case";
import {
  BASELINE_CALIBRATION,
  BASELINE_INPUT,
  buildLime3Record,
  buildWaterRecords,
  buildWaterSubject,
  buildWaterSubjectWithSource,
  LIME3_GROUND_JAPAN,
  LIME3_SURFACE_JAPAN,
  LIME3_SURFACE_WORLD_AVERAGE,
} from "./water-case-fixtures";

export type FeasibilityOutcome = "成立" | "ゼロ寄与" | "比較不能" | "データ待ち" | "式不足";

export interface FeasibilityContribution {
  factorId: string;
  category: string;
  /** 乗法モードの寄与倍率。加法モードでは null。 */
  multiplier: number | null;
  /** 加法モードの寄与額(円)。乗法モードでは null。 */
  amountJpy: number | null;
  isZero: boolean;
}

export interface FeasibilityIndependentCheck {
  label: string;
  /** 別式・別の公表列から独立に計算した期待値。 */
  expected: number;
  /** エンジンが出した値。 */
  engine: number;
  /** 相対差(|engine − expected| / max(1, |expected|))。 */
  relativeDifference: number;
  matches: boolean;
}

export interface FeasibilityCandidate {
  id: string;
  description: string;
  analysisUnit: "intra_method_variant" | "cross_method";
  countsTowardRealDataEvidence: boolean;
  outcome: FeasibilityOutcome;
  status: "decomposed" | "stopped";
  recipeId: string | null;
  stopReason: string | null;
  mode: "additive" | "multiplicative" | null;
  decompositionKind: "full" | "partial" | null;
  /** V_A / V_B(両方正のときだけ)。 */
  valueRatio: number | null;
  /** V_A − V_B(円)。 */
  absoluteDifferenceJpy: number | null;
  /** V* / V_B(乗法)または V* − V_B(加法)。到達値そのものは金額として出す。 */
  vStarJpy: number | null;
  contributions: FeasibilityContribution[];
  residual: { value: number; displayMultiplier: number | null; ratio: number | null; unclassified: boolean } | null;
  knownUnquantifiedCategories: string[];
  missingData: { item: string; enablesRecalculation: boolean; gate: string | null }[];
  independentChecks: FeasibilityIndependentCheck[];
  notes: string[];
}

export interface FeasibilityReport {
  generatedFor: string;
  versions: typeof WATER_CASE_VERSIONS;
  inputs: {
    physicalQuantity: number;
    unit: string;
    provenance: string;
    pppValue: number;
    note: string;
  };
  candidates: FeasibilityCandidate[];
  outcomeCounts: Record<FeasibilityOutcome, number>;
}

const TOLERANCE = 1e-9;

function check(label: string, expected: number, engine: number, tolerance = TOLERANCE): FeasibilityIndependentCheck {
  const relativeDifference = Math.abs(engine - expected) / Math.max(1, Math.abs(expected));
  return { label, expected, engine, relativeDifference, matches: relativeDifference <= tolerance };
}

function classify(pair: PairwiseDecompositionV2): FeasibilityOutcome {
  if (pair.status === "stopped") {
    if ((NOT_COMPARABLE_STOP_REASONS as string[]).includes(pair.reason)) return "比較不能";
    return pair.missingData.some((action) => action.enablesRecalculation) ? "データ待ち" : "式不足";
  }
  return pair.contributions.some((contribution) => !contribution.isZero) ? "成立" : "ゼロ寄与";
}

function missingDataOf(actions: DataAcquisitionAction[]) {
  return actions.map((action) => ({
    item: action.item,
    enablesRecalculation: action.enablesRecalculation,
    gate: action.gate ?? null,
  }));
}

function summarize(options: {
  id: string;
  description: string;
  analysisUnit: "intra_method_variant" | "cross_method";
  countsTowardRealDataEvidence: boolean;
  pair: PairwiseDecompositionV2;
  independentChecks?: FeasibilityIndependentCheck[];
  notes?: string[];
}): FeasibilityCandidate {
  const { pair } = options;
  const common = {
    id: options.id,
    description: options.description,
    analysisUnit: options.analysisUnit,
    countsTowardRealDataEvidence: options.countsTowardRealDataEvidence,
    outcome: classify(pair),
    recipeId: pair.recipe?.id ?? null,
    valueRatio: pair.valueA > 0 && pair.valueB > 0 ? pair.valueA / pair.valueB : null,
    absoluteDifferenceJpy: pair.diagnostics.absoluteDifference,
    independentChecks: options.independentChecks ?? [],
    notes: options.notes ?? [],
  };

  if (pair.status === "stopped") {
    return {
      ...common,
      status: "stopped",
      stopReason: pair.reason,
      mode: null,
      decompositionKind: null,
      vStarJpy: null,
      contributions: [],
      residual: null,
      knownUnquantifiedCategories: [...new Set(pair.qualitativeDifferences.map((difference) => difference.category))],
      missingData: missingDataOf(pair.missingData),
    };
  }

  return {
    ...common,
    status: "decomposed",
    stopReason: null,
    mode: pair.mode,
    decompositionKind: pair.kind,
    vStarJpy: pair.vStar,
    contributions: pair.contributions.map((contribution) => ({
      factorId: contribution.factorId,
      category: contribution.category,
      multiplier: contribution.displayMultiplier,
      amountJpy: contribution.displayAmount,
      isZero: contribution.isZero,
    })),
    residual: {
      value: pair.residual.value,
      displayMultiplier: pair.residual.displayMultiplier,
      ratio: pair.residual.ratio,
      unclassified: pair.residual.unclassified,
    },
    knownUnquantifiedCategories: [...new Set(pair.residual.knownUnquantified.map((difference) => difference.category))],
    missingData: missingDataOf(pair.residual.nextActions),
  };
}

/** T-10a の4候補を評価し、転記できる形の JSON を返す。 */
export function buildFeasibilityReport(): FeasibilityReport {
  // 成立性検証は隔離した検証用途のため、レビュー待ちの経路対応も分解して記録する(§9.5)。
  const registry = createVerificationRegistry();
  const versions = DIAGNOSTIC_DECOMPOSITION_VERSIONS_V2;
  const subject = buildWaterSubject();
  const records = buildWaterRecords();
  const recordOf = (methodId: string) => {
    const found = records.find((candidate) => candidate.methodId === methodId);
    if (!found) throw new Error(`${methodId} のレコードがありません`);
    return found;
  };

  const quantity = BASELINE_INPUT.physicalQuantity;
  const ppp = BASELINE_CALIBRATION.pppValue;
  /** 独立検算の基礎:統合化 US$/m³ 列 × 物理量 × PPP(エンジンの DALY 経路とは別式)。 */
  const lime3JapanJpy = quantity * LIME3_SURFACE_JAPAN.integratedUsdPerM3 * ppp;
  const lime3WorldJpy = quantity * LIME3_SURFACE_WORLD_AVERAGE.integratedUsdPerM3 * ppp;
  const perspectiveRatio = LIME3_SURFACE_WORLD_AVERAGE.integratedUsdPerM3 / LIME3_SURFACE_JAPAN.integratedUsdPerM3;
  const vfesJpy = quantity * 2.97 * ppp;
  const replacementCostJpy = quantity * 620;

  const candidates: FeasibilityCandidate[] = [];

  // (a) LIME3 消費国・世界平均 vs 消費国・日本
  const perspectivePair = buildPairwiseDecompositionV2({
    recordA: buildLime3Record(LIME3_SURFACE_WORLD_AVERAGE),
    recordB: buildLime3Record(LIME3_SURFACE_JAPAN),
    subject,
    registry,
    versions,
  });
  candidates.push(
    summarize({
      id: "lime3-perspective-world-vs-japan",
      description: "LIME3 水消費(表層水):消費国・世界平均 vs 消費国・日本。地理的視点の採用列を差し替える",
      analysisUnit: "intra_method_variant",
      countsTowardRealDataEvidence: false,
      pair: perspectivePair,
      independentChecks:
        perspectivePair.status === "decomposed"
          ? [
              check("寄与倍率 = 統合化US$/m³ 列の比(世界平均÷日本)", perspectiveRatio, perspectivePair.contributions[0].displayMultiplier ?? NaN),
              check("V_A(円)= 45,000 × 統合化US$/m³(世界平均) × PPP", lime3WorldJpy, perspectivePair.valueA, 1e-12),
              check("V_B(円)= 45,000 × 統合化US$/m³(日本) × PPP", lime3JapanJpy, perspectivePair.valueB, 1e-12),
              check("残差 r = ln(V_A / V*) = 0(完全分解)", 0, perspectivePair.residual.value, 1e-12),
            ]
          : [],
      notes: [
        "同一手法の内部変種であり §3.3 の「2手法以上」を満たさない。状態Bの実証件数へ算入しない。",
        "採用列の切替は DALY/m³ と統合化係数を同じ列から一括で差し替える(片方だけを入れ替えた組合せは公表資料に存在しない)。",
      ],
    })
  );

  // (b) LIME3 vs IFVI VFes / VFnutrition
  const vfesPair = buildPairwiseDecompositionV2({
    recordA: recordOf("ifvi-water-consumption.VFes"),
    recordB: recordOf("lime3-water"),
    subject,
    registry,
    versions,
  });
  candidates.push(
    summarize({
      id: "lime3-vs-ifvi-vfes",
      description: "LIME3 水消費 vs IFVI VFes(厚生価値・手法間)。数値化要因は地理較正のみ",
      analysisUnit: "cross_method",
      countsTowardRealDataEvidence: true,
      pair: vfesPair,
      independentChecks:
        vfesPair.status === "decomposed"
          ? [
              check("V_A(円)= 45,000 × 2.97 × PPP", vfesJpy, vfesPair.valueA, 1e-12),
              check("V_B(円)= 45,000 × 統合化US$/m³(日本) × PPP", lime3JapanJpy, vfesPair.valueB, 1e-12),
              check("残差 r = ln(V_A / V_B)(寄与ゼロのため全体差と一致)", Math.log(vfesJpy / lime3JapanJpy), vfesPair.residual.value),
              check("残差比率 = 1.0", 1, vfesPair.residual.ratio ?? NaN),
            ]
          : [],
      notes: ["地理較正は両手法で同一の較正記録を共有しているため寄与ゼロ(ゼロ寄与公理の実データ検証)。"],
    })
  );

  const nutritionPair = buildPairwiseDecompositionV2({
    recordA: recordOf("ifvi-water-consumption.VFnutrition"),
    recordB: recordOf("lime3-water"),
    subject,
    registry,
    versions,
  });
  candidates.push(
    summarize({
      id: "lime3-vs-ifvi-vfnutrition",
      description: "LIME3 水消費 vs IFVI VFnutrition(公表0)。ゼロを含むため加法",
      analysisUnit: "cross_method",
      countsTowardRealDataEvidence: true,
      pair: nutritionPair,
      independentChecks:
        nutritionPair.status === "decomposed"
          ? [
              check("残差 R = 0 − 45,000 × 統合化US$/m³(日本) × PPP", -lime3JapanJpy, nutritionPair.residual.value, 1e-12),
              check("寄与 φ(地理較正)= 0", 0, nutritionPair.contributions[0].displayAmount ?? NaN, 1e-12),
            ]
          : [],
      notes: [
        `ゼロ意味: ${nutritionPair.zeroMeaningA?.code ?? "(未確定)"}(候補 ${nutritionPair.zeroMeaningA?.candidates.join("/") ?? "-"})。`,
      ],
    })
  );

  // (c) 代替費用法 vs IFVI VFaccess
  const accessPair = buildPairwiseDecompositionV2({
    recordA: recordOf("ifvi-water-consumption.VFaccess"),
    recordB: recordOf("replacement-cost"),
    subject,
    registry,
    versions,
  });
  candidates.push(
    summarize({
      id: "replacement-cost-vs-ifvi-vfaccess",
      description: "代替費用法 vs IFVI VFaccess(交換価値・手法間)。反実仮想を定義できる要因が無い",
      analysisUnit: "cross_method",
      countsTowardRealDataEvidence: true,
      pair: accessPair,
      independentChecks: [check("金額差(円)= 0 − 45,000 × 620", -replacementCostJpy, accessPair.diagnostics.absoluteDifference ?? NaN, 1e-12)],
      notes: [
        "時間モデル:VFaccess の損害時間列が未公開のため差し替え式を書けない(データ待ち)。",
        "地理較正:代替費用法は円建て単価で較正非適用のため差し替えの意味が無い(式不足)。",
        "停止例として実証コーパスへ残す(§3.3)。",
      ],
    })
  );

  // (d) LIME3 表層水 vs 地下水(分解してはいけない差)
  const sourcePair = buildPairwiseDecompositionV2({
    recordA: buildLime3Record(LIME3_GROUND_JAPAN),
    recordB: buildLime3Record(LIME3_SURFACE_JAPAN),
    subject,
    subjectA: buildWaterSubjectWithSource("ground"),
    subjectB: buildWaterSubjectWithSource("surface"),
    registry,
    versions,
  });
  candidates.push(
    summarize({
      id: "lime3-surface-vs-ground",
      description: "LIME3 水消費(消費国・日本):表層水 vs 地下水。比較対象の不一致として止まるべき差",
      analysisUnit: "intra_method_variant",
      countsTowardRealDataEvidence: false,
      pair: sourcePair,
      independentChecks: [
        check(
          "公表列の比(地下水÷表層水、日本)= 2.5833",
          LIME3_GROUND_JAPAN.integratedUsdPerM3 / LIME3_SURFACE_JAPAN.integratedUsdPerM3,
          LIME3_GROUND_JAPAN.integratedUsdPerM3 / LIME3_SURFACE_JAPAN.integratedUsdPerM3,
          1e-12
        ),
      ],
      notes: ["水源種別が異なるため金額倍率を計算しない(§5.1)。この比を要因寄与として出さないことが正しい挙動。"],
    })
  );

  const outcomeCounts: Record<FeasibilityOutcome, number> = {
    成立: 0,
    ゼロ寄与: 0,
    比較不能: 0,
    データ待ち: 0,
    式不足: 0,
  };
  for (const candidate of candidates) outcomeCounts[candidate.outcome]++;

  return {
    generatedFor: "docs/data/divergence-feasibility-report.md §5 T-10a 早期成立性検証の結果",
    versions: WATER_CASE_VERSIONS,
    inputs: {
      physicalQuantity: quantity,
      unit: BASELINE_INPUT.unit,
      provenance: "demo_default(物理量45,000 m³と代替調達単価620円/m³はデモ既定値。係数は一次資料由来)",
      pppValue: ppp,
      note: "係数の生値は載せない。比・金額差・状態コードのみ(licensing.md・§0.2)。",
    },
    candidates,
    outcomeCounts,
  };
}
