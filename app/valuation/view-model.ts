/**
 * 手法比較の表示モデル(T-15 情報設計)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md T-15・T-16、§5.6・§6.4
 *
 * 1ペア(手法間 `PairwiseDecompositionV2` / 内訳分析 `IntraMethodBreakdownAnalysis`)の表示は、
 * 常に次の6区分の順で組み立てる(/analysis と /valuation の要約カードが同じ語彙を使う)。
 *   1. 結論(なぜ違うのか)         → readablePairNarrative
 *   2. 意思決定への含意           → pairImplicationDisplay
 *   3. 数値化できた原因寄与       → pair.contributions + contributionShareLabel
 *   4. 既知だが数値化できない差異 → combinedKnownDifferences
 *   5. 未分類残差と次のアクション → pair.residual + residualRatioLabel / stoppedNextSteps
 *   6. 監査ドリルダウン           → subsetRows / pair.recipe / pair.tolerance / pair.reverse / traceStepViews 等
 *
 * 数値そのものは加工しない(丸め・スケールは呼び出し側のNum/pickYenScaleが担当)。
 * ここでは「どのフィールドをどう並べるか」と「決定論的な文言」だけを純関数として持つ。
 */
import type {
  DecomposedPair,
  IntraMethodBreakdownAnalysis,
  NumericContribution,
  PairwiseDecompositionV2,
  StructuredResidual,
} from "@core/types/divergence";
import type { CausalPathway, EvidenceRef, ZeroMeaning } from "@core/types/comparison";
import type { KnownDifference } from "@core/types/recipe";
import type { Availability, MethodEvaluationTrace } from "@core/types/trace";
import type { UncertaintyFactor } from "@core/divergence/quantile-decomposition";
import type { ValuationRecord } from "@core/types/valuation";
import { decompositionFactorShortLabel, decisionImplicationLabel, ratioUnavailableReasonLabel, stopReasonLabel, zeroMeaningLabel } from "../components/labels";
import type { WaterfallStepInput } from "../components/charts/Waterfall";

export const UNCERTAINTY_FACTOR_LABEL: Record<UncertaintyFactor, string> = {
  parameterUncertainty: "推計値そのもののばらつき(層i)",
  transferError: "他地域の研究値を当てはめる誤差(層ii・確からしさ)",
};

// ---------------------------------------------------------------------------
// 1. 結論(なぜ違うのか)
// ---------------------------------------------------------------------------

function firstSentence(text: string): string {
  const idx = text.indexOf("。");
  return idx === -1 ? text : text.slice(0, idx + 1);
}

/**
 * 読み下し文(結論)。エンジンが決定論的テンプレートで生成した `pair.narrative` の先頭文
 * (結論部分)に、比較の向きに依存しない倍率の一文を先頭へ足す(どちらが大きいかを
 * 読み手が探さなくて済むように)。数値はそのまま使い、推定や言い換えで意味を足さない。
 * 手法IDはそのまま埋め込む(表示時に `withMethodLabelsInText` でラベル化する)。
 */
export function readablePairNarrative(pair: PairwiseDecompositionV2): string {
  const valueA = Number(pair.valueA);
  const valueB = Number(pair.valueB);
  const conclusion = firstSentence(pair.narrative);

  if (!Number.isFinite(valueA) || !Number.isFinite(valueB) || valueA <= 0 || valueB <= 0) {
    return conclusion || pair.narrative;
  }

  // エンジンの結論文は常に「A は B の X倍」の向きで書かれる。A ≥ B ならその一文で足りる。
  // A < B のときだけ、読み手が逆数を計算しなくて済むよう「B は A の 1/X 倍」を先に添える。
  if (conclusion && valueA >= valueB) return conclusion;
  const lead =
    valueA >= valueB
      ? `${pair.methodIdA} は ${pair.methodIdB} の ${(valueA / valueB).toFixed(2)}倍です。`
      : `${pair.methodIdB} は ${pair.methodIdA} の ${(valueB / valueA).toFixed(2)}倍です。`;
  return conclusion ? `${lead} ${conclusion}` : lead;
}

// ---------------------------------------------------------------------------
// 2. 意思決定への含意
// ---------------------------------------------------------------------------

export interface ImplicationDisplay {
  /** 「代表値を選べる」「追加調査が必要」「比較できない」のいずれか。 */
  headingLabel: string;
  /** エンジンの決定論的テンプレート文(推奨値ではなく、状況の要約)。 */
  summary: string;
  /** 停止ペアのみ:理由コードの平易な日本語。 */
  stopReasonLabel?: string;
  /** 停止ペアのみ:エンジンが出した詳細文。 */
  stopDetail?: string;
}

export function pairImplicationDisplay(pair: PairwiseDecompositionV2): ImplicationDisplay {
  const base = { headingLabel: decisionImplicationLabel(pair.implication.kind), summary: pair.implication.summary };
  if (pair.status !== "stopped") return base;
  return { ...base, stopReasonLabel: stopReasonLabel(pair.reason), stopDetail: pair.detail };
}

/** 停止したペアの短い見出し(/valuation の要約カード・監査ドリルダウンの補助見出しで使う)。 */
export function stoppedPairSummary(pair: PairwiseDecompositionV2): { headline: string; detail: string } | null {
  if (pair.status !== "stopped") return null;
  return { headline: `この2手法の差は数値で分けられませんでした:${stopReasonLabel(pair.reason)}`, detail: pair.detail };
}

// ---------------------------------------------------------------------------
// 3. 数値化できた原因寄与
// ---------------------------------------------------------------------------

/** 寄与割合の表示文言。ゼロ寄与・割合表示不能・通常の%表示を区別する(§6.4・§6.5)。 */
export function contributionShareLabel(contribution: NumericContribution): string {
  if (contribution.isZero) return "差なし(ゼロ寄与)";
  if (contribution.shareRatio === null) return "割合表示不能";
  return `${Math.round(contribution.shareRatio * 100)}%`;
}

// ---------------------------------------------------------------------------
// 4. 既知だが数値化できない差異
// ---------------------------------------------------------------------------

function differenceKey(difference: KnownDifference): string {
  return `${difference.category}|${difference.description}|${difference.sideA}|${difference.sideB}`;
}

/**
 * `pair.qualitativeDifferences`(比較前に固定した既知差異)と、分解できたペアなら
 * `residual.knownUnquantified`(除外要因を含む)を1つの一覧に統合する。同一の差異が
 * 両方に現れることがあるため(レシピの `fixedDifferences` が両方の構築元になるため)、
 * カテゴリ・説明・両側の記述が一致するものは重複表示しない。
 */
export function combinedKnownDifferences(pair: PairwiseDecompositionV2): KnownDifference[] {
  const fromResidual = pair.status === "decomposed" ? pair.residual.knownUnquantified : [];
  const merged = [...pair.qualitativeDifferences, ...fromResidual];
  const seen = new Set<string>();
  const result: KnownDifference[] = [];
  for (const difference of merged) {
    const key = differenceKey(difference);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(difference);
  }
  return result;
}

export const KNOWN_DIFFERENCE_FIXED_NOTE = "これらの差異には金額を割り当てていません。数値化するには、それぞれの次に取得すべきデータが必要です。";

/** 出典の要約(資料名+位置)。原本は転記せず、参照だけを表示する。 */
export function evidenceSummary(evidence: EvidenceRef): string {
  return evidence.locator ? `${evidence.source}(${evidence.locator})` : evidence.source;
}

// ---------------------------------------------------------------------------
// 5. 未分類残差と次のアクション
// ---------------------------------------------------------------------------

/** 残差比率の表示文言。相殺・全体差ゼロで表示できない場合は理由を示す(§6.5)。 */
export function residualRatioLabel(residual: StructuredResidual): string {
  return residual.ratio === null ? ratioUnavailableReasonLabel(residual.ratioUnavailableReason) : `${Math.round(residual.ratio * 100)}%`;
}

// ---------------------------------------------------------------------------
// 可視化の切替(誤読防止)
// ---------------------------------------------------------------------------

/**
 * ウォーターフォールで表示してよいのは「乗法・完全に正の値・寄与にゼロや相殺が無い」場合だけ。
 * 加法・ゼロ・負値・相殺(`shareRatio` が null)・停止ペアは表+文で示す(§6.3・T-15)。
 */
export function chartMode(pair: PairwiseDecompositionV2): "waterfall" | "table" {
  if (pair.status !== "decomposed") return "table";
  if (pair.mode !== "multiplicative") return "table";
  if (!(pair.valueA > 0 && pair.valueB > 0 && pair.vStar > 0)) return "table";
  if (pair.contributions.some((contribution) => contribution.isZero || contribution.shareRatio === null)) return "table";
  if (pair.residual.ratio === null) return "table";
  return "waterfall";
}

/**
 * 分解できたペアのウォーターフォール(`chartMode` が "waterfall" の場合のみ呼び出す)。
 * `contributions` と `residual` から連続する差分を積み上げる。基準側は常にB。
 */
export function pairwiseToWaterfallSteps(pair: DecomposedPair, labelA: string, labelB: string): WaterfallStepInput[] {
  const steps: WaterfallStepInput[] = [{ label: `${labelB} 中心値`, value: pair.valueB, isTotal: true }];
  let running = pair.valueB;
  const apply = (shapley: number) => (pair.mode === "multiplicative" ? running * Math.exp(shapley) : running + shapley);

  for (const contribution of pair.contributions) {
    const next = apply(contribution.shapley);
    steps.push({ label: decompositionFactorShortLabel(contribution.category), value: next - running, isTotal: false });
    running = next;
  }
  const afterResidual = apply(pair.residual.value);
  steps.push({ label: "分解不能な残差", value: afterResidual - running, isTotal: false });
  steps.push({ label: `${labelA} 中心値`, value: pair.valueA, isTotal: true });
  return steps;
}

// ---------------------------------------------------------------------------
// 6. 監査ドリルダウン
// ---------------------------------------------------------------------------

export const DIAGNOSTICS_THRESHOLD_NOTE = "F-3・F-8の省略判定は未承認のため適用していません(診断値は参考情報です)。";

export interface SubsetRow {
  subsetLabel: string;
  fixedLabel: string;
  value: number;
  traceHash: string;
}

/** `v(S)` の一覧を、S・F∖Sを要因ラベルに変換して表示する(§6.2)。 */
export function subsetRows(pair: DecomposedPair): SubsetRow[] {
  const labelById = new Map(pair.contributions.map((contribution) => [contribution.factorId, contribution.label]));
  const idsToLabel = (ids: string[]) => (ids.length === 0 ? "なし" : ids.map((id) => labelById.get(id) ?? id).join("、"));
  return pair.subsets.map((subset) => ({
    subsetLabel: idsToLabel(subset.subset),
    fixedLabel: idsToLabel(subset.fixed),
    value: subset.value,
    traceHash: subset.traceHash,
  }));
}

export interface TraceStepView {
  id: string;
  order: number;
  roleLabel: "reconciliation" | "method_model";
  label: string;
  formula: string;
  unit: string;
  applied: boolean;
  skipReason?: string;
  evidence: EvidenceRef[];
}

/** トレースの各ステップ(§5.3)。演算内容(`operation`)は監査用の再計算にのみ使い、画面には出さない。 */
export function traceStepViews(trace: MethodEvaluationTrace): TraceStepView[] {
  return trace.steps.map((step) => ({
    id: step.id,
    order: step.order,
    roleLabel: step.role,
    label: step.label,
    formula: step.formula,
    unit: step.output.unit,
    applied: step.applied,
    skipReason: step.skipReason,
    evidence: step.evidence,
  }));
}

export interface TraceAvailabilityEntry {
  label: string;
  availability: Availability;
}

/** §5.3 の判別可能な3状態(エンドポイント内訳・損害時間プロファイル・サイト補正)。 */
export function traceAvailabilityEntries(trace: MethodEvaluationTrace): TraceAvailabilityEntry[] {
  return [
    { label: "エンドポイント内訳の公表状況", availability: trace.endpointBreakdown },
    { label: "損害の時間プロファイルの公表状況", availability: trace.damageTimeProfile },
    { label: "サイト補正の公表状況", availability: trace.siteCorrection },
  ];
}

export interface PathwayRow {
  label: string;
  value: string;
}

/** 因果経路(pressure→…→valuationTechnique)。特定不能な階層は "unmapped" のまま出す(§5.2)。 */
export function pathwayRows(pathway: CausalPathway): PathwayRow[] {
  return [
    { label: "圧力", value: pathway.pressure },
    { label: "中間点", value: pathway.midpoint },
    { label: "損害経路", value: pathway.damagePathway },
    { label: "指標", value: pathway.metric ?? "未対応付け" },
  ];
}

// ---------------------------------------------------------------------------
// ゼロ値の意味(§5.6)
// ---------------------------------------------------------------------------

export interface ZeroMeaningView {
  code: string;
  badgeLabel: string;
  detail: string;
  /** 採用しなかった候補区分(同じ0に当てはまりうる他の区分)。無ければ null。 */
  candidatesLabel: string | null;
}

/**
 * ゼロ意味の表示(§5.6)。手法アダプターが出典付きで確定した区分をそのまま出す。
 * `zeroMeaning` が無いゼロ値は、値の大きさから意味を推論せず「意味未確定」と明示する
 * (methodIdの文字列判定によるゼロ理由の推測は完成実装で廃止した)。
 */
export function zeroMeaningDisplay(zeroMeaning: ZeroMeaning | undefined): ZeroMeaningView {
  if (!zeroMeaning) {
    return {
      code: "unconfirmed",
      badgeLabel: "意味未確定(出典未供給)",
      detail: "この0値の意味(公表値か・対象外か・欠測かなど)を手法アダプターがまだ確定していません。",
      candidatesLabel: null,
    };
  }
  const otherCandidates = zeroMeaning.candidates.filter((candidate) => candidate !== zeroMeaning.code);
  return {
    code: zeroMeaning.code,
    badgeLabel: zeroMeaningLabel(zeroMeaning.code),
    detail: zeroMeaning.rationale,
    candidatesLabel: otherCandidates.length > 0 ? otherCandidates.map(zeroMeaningLabel).join(" / ") : null,
  };
}

/** レコード単位のゼロ意味(/valuation の算定方法一覧)。中心値が0でなければ null。 */
export function recordZeroMeaning(record: ValuationRecord): ZeroMeaningView | null {
  if (Number(record.centralValue) !== 0) return null;
  return zeroMeaningDisplay(record.trace?.zeroMeaning);
}

/** ペア単位、A側/B側それぞれのゼロ意味。値が0でなければ null。 */
export function pairZeroMeaning(pair: PairwiseDecompositionV2, side: "A" | "B"): ZeroMeaningView | null {
  const value = side === "A" ? Number(pair.valueA) : Number(pair.valueB);
  if (value !== 0) return null;
  return zeroMeaningDisplay(side === "A" ? pair.zeroMeaningA : pair.zeroMeaningB);
}

// ---------------------------------------------------------------------------
// 内訳分析(同一手法。§4-8。手法間ペアとは別の分析単位)
// ---------------------------------------------------------------------------

export interface BreakdownComponentView {
  recordMethodId: string;
  subFactorId: string;
  valueConceptLabel: string;
  value: number;
  /** 集計式でこの内訳が採用されたか(MAXで選ばれた等)。 */
  selected: boolean;
  zeroMeaning: ZeroMeaningView | null;
}

export function breakdownComponentViews(analysis: IntraMethodBreakdownAnalysis): BreakdownComponentView[] {
  return analysis.components.map((component) => ({
    recordMethodId: component.recordMethodId,
    subFactorId: component.subFactorId,
    valueConceptLabel: component.valueConcept === "welfare" ? "厚生価値" : "交換価値",
    value: component.value,
    selected: component.selectedByAggregation,
    zeroMeaning: component.value === 0 ? zeroMeaningDisplay(component.zeroMeaning) : null,
  }));
}

/** 集計値が価値概念をまたぐ場合の注意書き(グループ比較には使わない旨)。またがなければ null。 */
export function breakdownMixedConceptNote(analysis: IntraMethodBreakdownAnalysis): string | null {
  return analysis.aggregate?.mixesValueConcepts ? analysis.aggregate.note : null;
}
