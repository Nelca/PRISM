import Link from "next/link";
import type { Metadata } from "next";
import { loadPipelineView } from "@/lib/views/pipeline";
import {
  deriveFindings,
  deriveMoneySummary,
  deriveOpenTasks,
  deriveOutcomeSummary,
  deriveStepProgress,
} from "@/lib/pipeline/open-tasks";
import { verdictLabel, verdictTagVariant } from "./components/labels";
import { HomeOrientation } from "./components/home-orientation";
import { Num, pickYenScale } from "./components/numeric";
import { Card, Tag } from "./components/ui";

/** 工程の番号はこの画面(進捗ブロック)にだけ出す。常設ナビには出さない(指示01)。 */
const STEP_MARK = ["①", "②", "③", "④", "⑤", "⑥"];

const FINDING_STAGE: Record<string, string> = {
  "finding-divergence": "価値の算定",
  "finding-verdict-crosses": "対策と判定",
  "finding-verdict-does-not-cross": "対策と判定",
  "finding-impairment": "財務への影響",
  "finding-disclosure-gap": "開示への反映",
};

function formatProfitImpact(value: number): string {
  if (value === 0) return "0.0%";
  if (Math.abs(value) < 0.05) return `${value > 0 ? "+" : "-"}0.1%未満`;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export const metadata: Metadata = {
  title: "ホーム | PRISM",
};

/**
 * ホーム=ダッシュボード(指示04 → IA-02 → 2026-08-23レビューで図中心に再設計)。
 *
 * (0)流れ図と成果物:環境データ → 金額に換算 → 3つの成果物(判定・開示・記録)を、
 *    文章ではなく図+件数で示す。初見の利用者には「何を入れると何が出るか」の説明、
 *    常用の利用者には成果物の現況サマリーとして働く(同じ表現・状態で形を変えない)。
 *    旧指示04の「M6の判定表・M8の件数カードはホームに置かない」は判定表・課金明細の
 *    再掲の禁止であり、件数+内訳バーに留めるこのブロックとは衝突しない(IA §3.2)。
 * (a)進捗:6ステップの工程図と完了状態。工程の可視化はこの画面だけが担う。
 * (b)次にやること:未完了の必須判断のチェックリスト(指示13)。
 * (c)分かったこと:実データから導出した発見(指示14)。
 */
export default async function Home() {
  const result = await loadPipelineView();

  const steps = deriveStepProgress(result);
  const tasks = deriveOpenTasks(result);
  const findings = deriveFindings(result);
  const outcomes = deriveOutcomeSummary(result);
  const { disclosure } = outcomes;

  // 金額サマリー(④と同じ導出関数。行の並びは利益への影響が大きい順=読むべき順)。
  const money = deriveMoneySummary(result);
  const moneyRows = [...money.rows].sort((a, b) => Math.abs(b.profitImpactPct) - Math.abs(a.profitImpactPct));
  const moneyScale = pickYenScale(money.totalNatureDebt, ...moneyRows.map((row) => row.natureDebt));
  const maxImpactPct = Math.max(...moneyRows.map((row) => Math.abs(row.profitImpactPct)), 0);
  const tasksBySection = new Map(steps.map((step) => [step.href, tasks.filter((task) => task.section === step.href)]));
  const confirmedVerdicts = outcomes.verdicts.total - outcomes.verdicts.pending;

  const resultStages = [
    {
      href: "/sites",
      label: "登録データ",
      value: `${outcomes.siteCount}拠点`,
      note: "評価の入力",
    },
    {
      href: "/assessment",
      label: "評価対象",
      value: `${outcomes.valuation.prioritized}/${outcomes.valuation.total}課題`,
      note: `詳細評価 ${outcomes.valuation.deepDive}件`,
    },
    {
      href: "/valuation",
      label: "価値の算定",
      value: `${outcomes.valuation.valued}課題`,
      note:
        outcomes.valuation.representativeRequired > 0
          ? `代表値 ${outcomes.valuation.selected}/${outcomes.valuation.representativeRequired}件`
          : "代表値選択なし",
    },
    {
      href: "/financial-bridge",
      label: "財務への影響",
      value: <Num key="nature-debt" value={money.totalNatureDebt} unit="円" scale={moneyScale} />,
      note: "自然債務 合計",
    },
    {
      href: "/decision",
      label: "対策と判定",
      value: `${confirmedVerdicts}/${outcomes.verdicts.total}拠点`,
      note: `承認ライン超過 ${outcomes.verdicts.crosses}件`,
    },
    {
      href: "/disclosure",
      label: "開示への反映",
      value: `${disclosure.handled}/${disclosure.total}件`,
      note: "根拠確認済み",
    },
  ];

  return (
    <div className="screen">
      <HomeOrientation />

      <Card title="進捗と次の操作" subtitle={`要対応 ${tasks.length}件`} padBody={false}>
        <ol className="home-workflow" aria-label="業務工程ごとの進捗と次の操作">
          {steps.map((step) => {
            const stepTasks = tasksBySection.get(step.href) ?? [];
            return (
              <li key={step.href} className={`home-workflow__row${stepTasks.length > 0 ? " home-workflow__row--action" : ""}`}>
                <Link href={step.href} className="home-workflow__step">
                  <span className="home-workflow__number" aria-hidden="true">{STEP_MARK[step.order - 1]}</span>
                  <span className="home-workflow__label">
                    <b>{step.label}</b>
                    <small>{step.note}</small>
                  </span>
                  <Tag variant={stepTasks.length > 0 ? "warn" : step.done ? "ok" : "neutral"}>
                    {stepTasks.length > 0 ? "要対応" : step.done ? "完了" : "進行中"}
                  </Tag>
                </Link>
                <div className="home-workflow__tasks">
                  {stepTasks.map((task) => (
                    <Link key={task.id} href={task.href} className="home-workflow__task">
                      <span>{task.text}</span>
                      <b>{task.linkLabel} →</b>
                    </Link>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card
        title="登録データから得られた結果"
        headExtra={
          <span
            className="nongaap"
            title="監査済みの決算書の数値ではなく、PRISMが算出した参考値です(いわゆる非GAAP指標)"
          >
            社内試算値
          </span>
        }
        padBody={false}
        foot="自然債務は交換価値のみを集計し、厚生価値は含めません。"
      >
        <ol className="home-result-chain" aria-label="登録データから成果物までの関係">
          {resultStages.map((stage, index) => (
            <li key={stage.href}>
              <Link href={stage.href}>
                <span>{stage.label}</span>
                <strong className="num">{stage.value}</strong>
                <small>{stage.note}</small>
              </Link>
              {index < resultStages.length - 1 && <span className="home-result-chain__arrow" aria-hidden="true">→</span>}
            </li>
          ))}
        </ol>

        <div className="home-result-panels">
          {moneyRows.length > 0 && (
            <section className="home-result-panel" aria-labelledby="home-finance-title">
              <div className="home-result-panel__head">
                <h3 id="home-finance-title">財務への影響</h3>
                <Link href="/financial-bridge">すべて見る →</Link>
              </div>
              <table className="data-table">
            <thead>
              <tr>
                <th>拠点</th>
                <th>利益への影響</th>
                <th title="未内部化コストに、炭素価格シナリオ別の内部化確率と割引係数を掛けて見込み額に変換した期待損失">
                  自然債務(期待損失)
                </th>
                <th>判定</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {moneyRows.map((row) => (
                <tr key={row.siteId}>
                  <td>
                    <b>{row.siteName}</b>
                    {row.impairmentAffected && (
                      <span className="cell-note">
                        <Tag variant="warn" title="自然債務が減損の目安額を超えています">減損リスク</Tag>
                      </span>
                    )}
                  </td>
                  <td style={{ minWidth: 150 }}>
                    <span className="impact">
                      <span className="impact__bar" aria-hidden="true">
                        <span
                          className={`impact__fill ${row.profitImpactPct < 0 ? "impact__fill--neg" : "impact__fill--pos"}`}
                          style={{
                            width: `${maxImpactPct > 0 ? (Math.abs(row.profitImpactPct) / maxImpactPct) * 50 : 0}%`,
                          }}
                        />
                      </span>
                      <span className="impact__pct num" title={`${row.profitImpactPct}%`}>
                        {formatProfitImpact(row.profitImpactPct)}
                      </span>
                    </span>
                  </td>
                  <td className="num">
                    <Num value={row.natureDebt} unit="円" scale={pickYenScale(row.natureDebt)} />
                  </td>
                  <td>
                    <Tag variant={verdictTagVariant(row.verdict)}>{verdictLabel(row.verdict)}</Tag>
                  </td>
                  <td>
                    <Link
                      href={`/financial-bridge/${encodeURIComponent(row.siteId)}`}
                      className="pill-btn pill-btn--sm"
                    >
                      詳細 →
                    </Link>
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--surface-alt)" }}>
                <td>
                  <b>合計</b>
                </td>
                <td>—</td>
                <td className="num" style={{ fontWeight: 600 }}>
                  <Num value={money.totalNatureDebt} unit="円" scale={moneyScale} />
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
              </table>
            </section>
          )}

          <section className="home-result-panel" aria-labelledby="home-findings-title">
            <div className="home-result-panel__head">
              <h3 id="home-findings-title">工程別の主な結果</h3>
            </div>
            {findings.length === 0 ? (
              <p className="empty-state">表示できる結果がありません。</p>
            ) : (
              <div className="home-result-findings">
                {findings.map((finding) => (
                  <Link key={finding.id} href={finding.href} className="home-result-finding" title={finding.exact}>
                    <span className="home-result-finding__stage">{FINDING_STAGE[finding.id] ?? "評価結果"}</span>
                    <strong>{finding.headline}</strong>
                    <span>{finding.linkLabel} →</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </Card>
    </div>
  );
}
