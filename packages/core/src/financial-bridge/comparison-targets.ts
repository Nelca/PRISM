/**
 * M5 D-5:比較先(格付・資本コストへの影響は定性的な扱いに留める)。
 * 参照元: docs/requirements/m5-financial-bridge.md §5
 *
 * 比率の数値は**単純な算術で計算する**(解釈の余地はない、D-5.2)。
 * 「格付機関が参照する指標です」「予測・断定しません」という注記文は
 * 全顧客・全ケースで共通の固定テンプレート文言とし、**この文章生成にAIは使わない**
 * (M4のnarrative.ts・M6のbinding-mechanism.tsと同じ原則)。
 *
 * 2026-08-09(GAP-10)変更:変化後の比率を呼び出し側の入力から受け取っていたが、
 * D-5.2は「企業提供の財務データとD-4の自然債務算出結果から単純な算術で計算する」と
 * 定めており、**変化後はPRISMが算出すべき値**である。企業に入力させると
 * 「PRISMの算出結果」ではなく「企業が出した数字の転記」になってしまう。
 */

import type { ExchangeAmount } from "../types/common";
import type { ComparisonTargets, CreditRatioChange, NatureDebt } from "../types/financial-bridge";
import { buildNonGaapLabel } from "./non-gaap-label";

/** 企業提供の財務データ(PRISMは検証しない。M6 D-4と同じ原則)。 */
export interface CompanyFinancials {
  /** 純有利子負債。 */
  netDebt: number;
  ebitda: number;
  /** 支払利息。 */
  interestExpense: number;
}

export interface ComparisonTargetsInput {
  reportedOperatingProfit: ExchangeAmount;
  /** ブリッジ1の出力。インタレストカバレッジの「変化後」に使う。 */
  natureAdjustedOperatingProfit: ExchangeAmount;
  natureDebt: NatureDebt;
  /** 企業提供の既存減損テスト前提(閾値)。PRISM側で推定しない(D-15)。 */
  existingImpairmentThreshold: ExchangeAmount;
  financials: CompanyFinancials;
}

/**
 * 文中に埋め込む金額。自然債務は内部化確率と割引係数を掛けた期待値なので小数が出るが、
 * 文章で円未満まで見せる意味はないため円単位に丸める(表示上の丸めであり、
 * 計算に使う値は丸めない)。
 */
function yen(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

/** 分母が0の比率は定義できない。0や近似値で埋めず null を返す(D-15)。 */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function formatRatio(value: number | null): string {
  return value === null ? "算出不能(分母が0)" : `${value.toFixed(1)}倍`;
}

function formatRatioChange(change: CreditRatioChange): string {
  if (change.before === null || change.after === null) {
    return `${formatRatio(change.before)} → ${formatRatio(change.after)}`;
  }
  const delta = change.after - change.before;
  const sign = delta >= 0 ? "+" : "";
  // 差分の単位は比率本体と同じ「倍」。「pt」は%表示の指標のための単位であり、倍率には使わない
  // (2026-08-23レビュー、D-5.2の表示例も同時に更新済み)。
  return `${change.before.toFixed(1)}倍 → ${change.after.toFixed(1)}倍(${sign}${delta.toFixed(1)}倍)`;
}

export function computeComparisonTargets(input: ComparisonTargetsInput): ComparisonTargets {
  const totalDebt = input.natureDebt.totalDebt as number;
  const threshold = input.existingImpairmentThreshold as number;
  const reportedOperatingProfit = input.reportedOperatingProfit as number;
  const natureAdjustedOperatingProfit = input.natureAdjustedOperatingProfit as number;
  const { netDebt, ebitda, interestExpense } = input.financials;

  // internalization-status.tsと同じ規律:報告営業利益が0の場合、比率は定義できないため0として扱う
  // (0除算を避ける構造的な既定値であり、ドメイン上の推定ではない)。
  const operatingProfitRatio = reportedOperatingProfit === 0 ? 0 : totalDebt / reportedOperatingProfit;

  // 減損テストでは正の損失エクスポージャーだけを比較する。便益はブリッジ1の
  // 別フィールドで扱い、負値を絶対値化して損失へ読み替えない。
  const lossExposure = Math.max(totalDebt, 0);
  const changesAssumption = lossExposure > threshold;
  const details = changesAssumption
    ? `自然債務の損失額(${yen(lossExposure)})が、既存の減損テスト前提の閾値(${yen(threshold)})を上回るため、減損テストの前提を見直す必要があります。`
    : `自然債務の損失額(${yen(lossExposure)})は、既存の減損テスト前提の閾値(${yen(threshold)})の範囲内であり、前提を変える結果にはなっていません。`;

  const ratios: CreditRatioChange[] = [
    {
      label: "Net Debt / EBITDA(レバレッジ比率)",
      before: ratio(netDebt, ebitda),
      // 自然債務を有利子負債に上乗せしたときの比率。単純な算術であり、内部化の確率や
      // 割引はD-4のnatureDebt側で既に織り込まれている。
      after: ratio(netDebt + lossExposure, ebitda),
    },
    {
      label: "インタレストカバレッジ比率",
      before: ratio(reportedOperatingProfit, interestExpense),
      // 分子をブリッジ1の自然調整後営業利益に差し替えるだけ。金利水準の想定を新たに置かない
      // (置くと「未実証の定量モデル」を作ることになる。D-5.1)。
      after: ratio(natureAdjustedOperatingProfit, interestExpense),
    },
  ];

  const qualitativeNote = [
    "【比較先:格付・資本コストへの参考情報】",
    "",
    "自然債務を加味すると、以下の指標が変化します:",
    "",
    ...ratios.map((change) => `  ${change.label}    ${formatRatioChange(change)}`),
    "",
    "※これらは信用格付機関が一般的に参照する財務指標です。本システムは、",
    "  これらの変化が実際の格付・資本コストにどう影響するかを予測・断定",
    "  するものではありません。[非GAAP指標]",
  ].join("\n");

  return {
    operatingProfitRatio,
    impairmentTestImpact: { changesAssumption, details },
    ratingCostOfCapitalImpact: { qualitativeNote, ratios },
    nonGaapLabel: buildNonGaapLabel(["operatingProfitRatio", "impairmentTestImpact", "ratingCostOfCapitalImpact"]),
  };
}
