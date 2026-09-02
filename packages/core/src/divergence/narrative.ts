/**
 * M4 §5 F-9(表示規則)・§7(出力の読み下し文)。
 * 参照元: docs/requirements/m4-divergence-decomposition.md §5 F-9・§7
 *
 * 読み下し文はテンプレート+数値の機械的埋め込みのみで生成する。AIは使わない
 * (M5 D-5「格付・資本コストの定性的記述は生成しない」と同じ原則)。
 */

import type { DecompositionFactor, DecompositionMode, FactorContribution } from "../types/divergence";

const FACTOR_LABELS: Record<DecompositionFactor, string> = {
  endpointCoverage: "エンドポイント被覆",
  discountRate: "割引率",
  geographicCalibration: "地理較正",
};

/**
 * F-9:いずれかの寄与が合計(説明済み分の合計)と逆符号の場合、寄与割合(%)の表示を全項目で
 * 抑止し、倍率のみを表示する。合計がゼロの場合も割合が発散するため抑止する。
 */
export function applyF9DisplayRule(contributions: FactorContribution[]): FactorContribution[] {
  const decomposed = contributions.filter((c) => c.status === "decomposed");
  const total = decomposed.reduce((sum, c) => sum + c.logContribution, 0);

  const hasSignMismatch =
    total !== 0 &&
    decomposed.some((c) => c.logContribution !== 0 && Math.sign(c.logContribution) !== Math.sign(total));

  const suppressRatio = hasSignMismatch || total === 0;

  return contributions.map((c) => {
    if (c.status !== "decomposed" || suppressRatio) {
      return { ...c, shareRatio: null };
    }
    return { ...c, shareRatio: c.logContribution / total };
  });
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function formatMultiplier(multiplier: number): string {
  return `×${Math.abs(multiplier) < 0.01 ? multiplier.toPrecision(2) : multiplier.toFixed(2)}`;
}

/** 比較の向きに関係なく、利用者が「何が何倍か」をそのまま読める形にする。 */
function formatComparison(methodIdA: string, methodIdB: string, ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) {
    return `${methodIdA} と ${methodIdB} の比率は算出できません。`;
  }
  if (ratio >= 1) return `${methodIdA} は ${methodIdB} の ${ratio.toFixed(2)}倍です。`;
  return `${methodIdB} は ${methodIdA} の ${(1 / ratio).toFixed(2)}倍です。`;
}

export interface NarrativeInput {
  methodIdA: string;
  methodIdB: string;
  mode: DecompositionMode;
  /** not_decomposed(F-2/F-3/F-8)の場合、その理由(preconditions.tsのreasonをそのまま渡す)。 */
  shortCircuitReason?: string;
  ratio: number | null;
  contributions: FactorContribution[];
  residual: { multiplier: number } | null;
}

export function buildNarrative(input: NarrativeInput): string {
  const { methodIdA, methodIdB, mode, shortCircuitReason, ratio, contributions, residual } = input;

  if (mode === "not_decomposed") {
    return shortCircuitReason ?? `${methodIdA} と ${methodIdB} は分解対象外と判定されました。`;
  }

  if (mode === "additive") {
    return (
      shortCircuitReason ??
      `${methodIdA} と ${methodIdB} の値にゼロまたは負が含まれるため、倍率ではなく絶対額の差として扱います。`
    );
  }

  // mode === "multiplicative"
  const decomposed = contributions.filter((c) => c.status === "decomposed");
  const notRecalculable = contributions.filter((c) => c.status === "not_recalculable");
  const parts: string[] = [formatComparison(methodIdA, methodIdB, ratio)];

  const hasAnyExplainedContribution = decomposed.some((c) => c.logContribution !== 0);

  if (!hasAnyExplainedContribution) {
    parts.push(
      "エンドポイント被覆・割引率・地理較正の3要因について確認しましたが、いずれも寄与がないか再計算不能でした。この乖離は3要因では説明されない残差です。"
    );
  } else {
    const factorSentences = decomposed.map((c) => {
      const label = FACTOR_LABELS[c.factor];
      const shareText = c.shareRatio !== null ? `(寄与${formatPercent(c.shareRatio)})` : "";
      return `${label} ${formatMultiplier(c.multiplier)}${shareText}`;
    });
    parts.push(`要因分解: ${factorSentences.join("、")}。`);

    if (decomposed.some((c) => c.shareRatio === null)) {
      parts.push("寄与の符号が相殺しているため、寄与割合(%)の表示を抑止し倍率のみを示しています(F-9)。");
    }
  }

  if (notRecalculable.length > 0) {
    for (const c of notRecalculable) {
      parts.push(`${FACTOR_LABELS[c.factor]}: 分解不能(${c.exclusionReason ?? "理由不明"})`);
    }
  }

  if (residual !== null) {
    parts.push(
      `未説明乖離(残差): ${formatMultiplier(residual.multiplier)}。これは方法論の違いのうち、上記の要因では説明できなかった部分です。`
    );
  }

  return parts.join(" ");
}
