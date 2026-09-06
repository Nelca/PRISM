/**
 * M4完成 §6.4・T-15:新経路の読み下し文(決定論的テンプレート)。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §6.4・T-15
 *
 * 生成順は画面の優先順位と同じにする。
 *   1. 結論(何がどれだけ違うのか)
 *   2. 意思決定への含意(代表値選択 / 追加調査 / 比較不能)
 *   3. 数値寄与
 *   4. 既知だが数値化できない差異
 *   5. 残差と次に取るべきデータ取得アクション
 *
 * テンプレート+数値の機械的埋め込みだけで作る。LLM・自由文生成を使わない(§2-6)。
 * 「モデル差が残差の何%」のように、数値根拠のない配分を述べる文を生成しない(§6.4)。
 * 手法IDはそのまま埋める(表示用ラベル化は app 側の責務)。
 */

import type { DecisionImplication, NumericContribution, StopReasonCode, StructuredResidual } from "../types/divergence";
import type { DataAcquisitionAction, KnownDifference } from "../types/recipe";

const STOP_REASON_LABELS: Record<StopReasonCode, string> = {
  different_subject: "比較対象が同一ではありません",
  value_concept_mismatch: "価値概念が異なります(異なる問い)",
  sign_mismatch: "両端の符号の意味が一致しません",
  counterfactual_sign_mismatch: "反実仮想値に正負が混在します",
  non_finite: "有限でない値が含まれます",
  normalization_mismatch: "正規化後も単位・通貨・価格年・期間が揃いません",
  recipe_missing: "比較レシピが未登録です",
  recipe_version_unsupported: "比較レシピが対象手法版をサポートしません",
  recipe_not_registrable: "比較レシピのレビュー状態が実行条件を満たしません",
  trace_insufficient: "反実仮想に必要な計算トレースが不足しています",
  no_numerizable_factors: "数値化できる要因がありません",
  budget_exceeded: "評価回数の予算を超えます",
  full_decomposition_endpoint_mismatch: "完全分解を宣言したレシピで到達値 V* が V_A と一致しません",
  efficiency_violation: "寄与の効率性が許容誤差内で成立しません",
  group_limit_exceeded: "グループ内の親手法数が上限を超えたため、このペアは分解対象から外れました",
  license_blocked: "ライセンス条件により本番結果へ出せません",
};

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  return Math.abs(value) >= 1 ? value.toFixed(2) : value.toPrecision(3);
}

function formatMultiplier(value: number): string {
  return `×${formatNumber(value)}`;
}

function formatShare(ratio: number | null): string {
  return ratio === null ? "" : `(寄与割合 ${Math.round(ratio * 100)}%)`;
}

function contributionSentence(contribution: NumericContribution, mode: "additive" | "multiplicative"): string {
  const magnitude =
    mode === "multiplicative"
      ? formatMultiplier(contribution.displayMultiplier ?? Math.exp(contribution.shapley))
      : `${formatNumber(contribution.displayAmount ?? contribution.shapley)}`;
  return `${contribution.label}(${contribution.factorId}) ${magnitude}${formatShare(contribution.shareRatio)}`;
}

function knownDifferenceSentences(differences: KnownDifference[]): string[] {
  return differences.map(
    (difference) => `${difference.description} A側: ${difference.sideA} / B側: ${difference.sideB}(金額は割り当てていません)`
  );
}

function actionSentences(actions: DataAcquisitionAction[]): string[] {
  return actions.map(
    (action) =>
      `${action.item}(取得元候補: ${action.candidateSource}${action.gate ? `、GATE ${action.gate}` : ""}。取得後の再計算${action.enablesRecalculation ? "可" : "不可"})`
  );
}

export interface NarrativeV2DecomposedInput {
  kind: "decomposed";
  methodIdA: string;
  methodIdB: string;
  mode: "additive" | "multiplicative";
  decompositionKind: "full" | "partial";
  valueA: number;
  valueB: number;
  vStar: number;
  totalDifference: number;
  explainedSum: number;
  contributions: NumericContribution[];
  residual: StructuredResidual;
  implication: DecisionImplication;
  normalizationApplied: string[];
  qualitativeDifferences: KnownDifference[];
}

export interface NarrativeV2StoppedInput {
  kind: "stopped";
  methodIdA: string;
  methodIdB: string;
  reason: StopReasonCode;
  detail: string;
  missingData: DataAcquisitionAction[];
  implication: DecisionImplication;
  qualitativeDifferences: KnownDifference[];
}

export type NarrativeV2Input = NarrativeV2DecomposedInput | NarrativeV2StoppedInput;

export function buildNarrativeV2(input: NarrativeV2Input): string {
  const parts: string[] = [];

  if (input.kind === "stopped") {
    // 1. 結論
    parts.push(`結論: ${input.methodIdA} と ${input.methodIdB} は数値分解しませんでした。${STOP_REASON_LABELS[input.reason]}(${input.reason})。${input.detail}`);
    // 2. 含意
    parts.push(`意思決定への含意: ${input.implication.summary}`);
    // 4. 既知だが数値化できない差異
    if (input.qualitativeDifferences.length > 0) {
      parts.push(`既知だが数値化できない差異: ${knownDifferenceSentences(input.qualitativeDifferences).join(" / ")}`);
    }
    // 5. 次アクション
    parts.push(
      input.missingData.length > 0
        ? `次に取得すべきデータ: ${actionSentences(input.missingData).join(" / ")}`
        : "次に取得すべきデータ: 特定できていません。"
    );
    return parts.join(" ");
  }

  // 1. 結論
  const conclusion =
    input.mode === "multiplicative"
      ? `結論: ${input.methodIdA}(${formatNumber(input.valueA)})は ${input.methodIdB}(${formatNumber(input.valueB)})の ${formatNumber(input.valueA / input.valueB)}倍です。`
      : `結論: ${input.methodIdA}(${formatNumber(input.valueA)})と ${input.methodIdB}(${formatNumber(input.valueB)})の差は ${formatNumber(input.totalDifference)} です。`;
  parts.push(
    `${conclusion} 基準側は ${input.methodIdB}、到達値 V* は ${formatNumber(input.vStar)}、分解区分は${input.decompositionKind === "full" ? "完全分解" : "部分分解"}です。`
  );
  if (input.normalizationApplied.length > 0) {
    parts.push(`比較前正規化(方法論寄与に含めない): ${input.normalizationApplied.join("、")}。`);
  }

  // 2. 含意
  parts.push(`意思決定への含意: ${input.implication.summary}`);

  // 3. 数値寄与
  if (input.contributions.length === 0) {
    parts.push("数値寄与: 数値化できた要因はありません。");
  } else {
    parts.push(
      `数値寄与(${input.mode === "multiplicative" ? "対数空間Shapley・倍率表示" : "加法Shapley・符号付き金額"}): ${input.contributions
        .map((contribution) => contributionSentence(contribution, input.mode))
        .join("、")}。寄与合計 ${formatNumber(input.explainedSum)}。`
    );
    if (input.contributions.every((contribution) => contribution.shareRatio === null)) {
      parts.push("寄与割合は表示していません(全体差が許容誤差内、または寄与・残差の符号が混在しているため)。");
    }
  }

  // 4. 既知だが数値化できない差異
  parts.push(
    input.residual.knownUnquantified.length > 0
      ? `既知だが数値化できない差異: ${knownDifferenceSentences(input.residual.knownUnquantified).join(" / ")}`
      : "既知だが数値化できない差異: 特定されていません。"
  );

  // 5. 残差と次アクション
  const ratioText =
    input.residual.ratio === null
      ? `残差比率は表示できません(${input.residual.ratioUnavailableReason === "mixed_signs" ? "寄与・残差の非ゼロ項に正負が混在" : "全体差が許容誤差内で0"})`
      : `残差比率 ${Math.round(input.residual.ratio * 100)}%`;
  parts.push(
    `残差: ${formatNumber(input.residual.value)}(${input.residual.mode === "multiplicative" ? "対数" : "金額"})。${ratioText}。${
      input.residual.unclassified ? "根拠付きの候補理由を特定できていない未分類残差です。" : "残差の数値的配分は未解決です。"
    }`
  );
  parts.push(
    input.residual.nextActions.length > 0
      ? `次に取得すべきデータ: ${actionSentences(input.residual.nextActions).join(" / ")}`
      : "次に取得すべきデータ: 特定できていません。"
  );

  return parts.join(" ");
}
