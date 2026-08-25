/**
 * 社内確認用の開示文テンプレート(基準へのマッピング前)。
 *
 * **SSBJ等の基準に準拠していると主張しない。**基準本文が未取得で、どの開示項目に
 * 何を載せるべきかを確定できていないため(`docs/data/acquisition-runbook.md` A-15)。
 * ここで作るのは「自社のレコードから、開示に使える下書きを組み立てる」ところまでで、
 * 基準別の項目マッピングが確定したら `standard: "ssbj"` のテンプレートを別途足す。
 *
 * **文はすべて固定テンプレート+機械的な数値埋め込み。AIを使わない**(M5 D-5.2と同じ原則)。
 * 素材が足りない項目は文を作らず `null` を返し、呼び出し側が「未記入」として扱う(D-15)。
 */

import { formatYen } from "../build-disclosure-view";
import type { DisclosureViewTemplate } from "../build-disclosure-view";
import type { ImpactCategory } from "../../types/common";
import type { BindingMechanism } from "../../types/decision";

/** 開示文に出す表示名。内部の識別子をそのまま外部向けの文章に出さない。 */
const CATEGORY_LABEL: Record<ImpactCategory, string> = {
  climate: "気候変動",
  water: "水資源",
  pollution: "汚染",
};

const BINDING_LABEL: Record<BindingMechanism["kind"], string> = {
  weak_reference: "稟議書への参考値としての記載",
  npv_formula_replacement: "投資判断の計算式への組み込み",
  budget_allocation: "対象拠点への予算賦課",
  procurement_contract_clause: "調達契約の更新条件への組み込み",
};

export const INTERNAL_REVIEW_TEMPLATE: DisclosureViewTemplate = {
  standard: "internal_review",
  version: "internal-review-v1",
  sections: [
    {
      requirementLabel: "評価の対象範囲",
      render: ({ materialIssues }) => {
        if (materialIssues.length === 0) {
          return null;
        }
        const assessed = materialIssues.filter((issue) => !issue.excluded);
        const excluded = materialIssues.filter((issue) => issue.excluded);
        const categories = [...new Set(assessed.map((issue) => CATEGORY_LABEL[issue.impactCategory]))];

        const base =
          `評価の対象は${assessed.length}件(拠点×カテゴリ)です。対象カテゴリは${categories.join("・")}です。`;
        if (excluded.length === 0) {
          return base;
        }
        return `${base}このほか${excluded.length}件は評価の対象に含めていません(理由は前提台帳に記録しています)。`;
      },
    },
    {
      requirementLabel: "財務影響の試算",
      render: ({ valuationRecords }) => {
        // 投資判断・財務影響には交換価値のみを使う(構想書8.2・X7)
        const exchange = valuationRecords.filter((record) => record.valueConcept === "exchange");
        if (exchange.length === 0) {
          return null;
        }
        const total = exchange.reduce((sum, record) => sum + (record.centralValue), 0);
        const low = exchange.reduce((sum, record) => sum + record.quantileRange.p5, 0);
        const high = exchange.reduce((sum, record) => sum + record.quantileRange.p95, 0);

        return (
          `自然関連コストの試算額は${formatYen(total)}です(${exchange.length}件の合計)。` +
          `不確実性を考慮した幅は${formatYen(low)}〜${formatYen(high)}です。` +
          "本数値は非GAAP指標であり、監査済み財務諸表の数値ではありません。"
        );
      },
    },
    {
      requirementLabel: "前提と限界",
      render: ({ valuationRecords, materialIssues }) => {
        if (valuationRecords.length === 0) {
          return null;
        }
        const tierC = valuationRecords.filter((record) => record.transferFitness.tier === "C").length;
        const exclusions = [...new Set(valuationRecords.flatMap((record) => record.scopeExclusions))];
        const unevaluated = materialIssues.reduce((sum, issue) => sum + issue.unevaluatedCriteria.length, 0);

        const parts = [
          `試算に用いた${valuationRecords.length}件の評価のうち、適合度が最も低い区分(ティアC)のものは${tierC}件です。`,
        ];
        if (exclusions.length > 0) {
          parts.push(`次の項目は試算に含めていません:${exclusions.join("、")}。`);
        }
        if (unevaluated > 0) {
          parts.push(
            `また、データの利用条件が未確定であるなどの理由により、評価基準のうち${unevaluated}件を評価できていません。`
          );
        }
        return parts.join("");
      },
    },
    {
      requirementLabel: "投資判断への反映",
      render: ({ decisionRecords }) => {
        if (decisionRecords.length === 0) {
          return null;
        }
        const confirmed = decisionRecords.filter((record) => record.verdict !== "pending");
        if (confirmed.length === 0) {
          return "投資判断への反映は、承認基準が未設定のため判定を保留しています。";
        }
        const crosses = confirmed.filter((record) => record.verdict === "crosses").length;
        const binding = [...new Set(confirmed.map((record) => BINDING_LABEL[record.bindingMechanism.kind]))];

        const verdictSentence =
          crosses === 0
            ? "いずれも、自然関連コストを加味しても承認基準をまたがないと判定しています。"
            : `うち${crosses}件は、承認基準をまたぐ可能性があると判定しています。`;

        return (
          `${confirmed.length}件の投資判断について、自然関連コストを加味した評価を実施しました。` +
          verdictSentence +
          `判定結果の社内での取り扱いは次のとおりです:${binding.join("、")}。`
        );
      },
    },
  ],
};
