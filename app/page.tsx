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

  return (
    <div className="screen">
      <HomeOrientation />

      <section className="home-priority" aria-labelledby="home-priority-title">
        <div className="home-priority__head">
          <div>
            <h2 id="home-priority-title">次にやること</h2>
          </div>
          <span className="home-priority__count num">{tasks.length}</span>
        </div>
        {tasks.length === 0 ? (
          <p className="empty-state">要対応はありません。</p>
        ) : (
          <div className="task-list task-list--priority">
            {tasks.map((task, index) => (
              <div key={task.id} className="task-item">
                <span className="task-item__index num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="task-item__body">{task.text}</span>
                <Link href={task.href} className="pill-btn pill-btn--accent task-item__link">
                  {task.linkLabel} <span aria-hidden="true">→</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="home-kpis" aria-label="現在の主要指標">
        <Link href="/sites" className="home-kpi">
          <span>登録拠点</span><strong className="num">{outcomes.siteCount}</strong><small>拠点</small>
        </Link>
        <Link href="/valuation" className="home-kpi">
          <span>算定済み</span><strong className="num">{outcomes.valuation.valued}</strong><small>全{outcomes.valuation.total}課題</small>
        </Link>
        <Link href="/valuation#representative-selection" className="home-kpi home-kpi--attention">
          <span>代表値の選択</span><strong className="num">{outcomes.valuation.selected}/{outcomes.valuation.representativeRequired}</strong>
          <small>{outcomes.valuation.representativeRequired - outcomes.valuation.selected}件が要対応</small>
        </Link>
        <Link href="/disclosure" className="home-kpi">
          <span>根拠確認</span><strong className="num">{disclosure.handled}/{disclosure.total}</strong><small>開示文言</small>
        </Link>
      </div>

      {/* (0b) 金額でみる評価結果(2026-08-23レビュー第3回)。導出は④と同じderiveMoneySummary。 */}
      {moneyRows.length > 0 && (
        <Card
          title="財務影響"
          padBody={false}
          headExtra={
            <span
              className="nongaap"
              title="監査済みの決算書の数値ではなく、PRISMが算出した参考値です(いわゆる非GAAP指標)"
            >
              社内試算値
            </span>
          }
          foot="交換価値のみを集計し、厚生価値は含めません。"
        >
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
                      <span className="impact__pct num">
                        {`${row.profitImpactPct >= 0 ? "+" : ""}${row.profitImpactPct.toFixed(1)}%`}
                      </span>
                    </span>
                  </td>
                  <td className="num">
                    <Num value={row.natureDebt} unit="円" scale={moneyScale} />
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
        </Card>
      )}

      {/* (a) 進捗 */}
      <Card title="進捗">
        <div className="flow">
          {steps.map((step) => (
            <Link
              key={step.href}
              href={step.href}
              className={`flow__step${step.done ? " flow__step--done" : ""}`}
            >
              <span className="flow__step-head">
                <span aria-hidden="true">{STEP_MARK[step.order - 1]}</span>
                <span>{step.done ? "完了" : "未完了"}</span>
              </span>
              <span className="flow__step-label">{step.label}</span>
            </Link>
          ))}
        </div>
      </Card>

      {/* (c) 分かったこと */}
      <Card
        title="主な結果"
      >
        {findings.length === 0 ? (
          <p style={{ color: "var(--ink-faint)" }}>表示できる結果がありません。</p>
        ) : (
          <div className="finding-list">
            {findings.map((finding) => (
              <div key={finding.id} className="finding">
                <p className="finding__headline" title={finding.exact}>
                  {finding.headline}
                </p>
                <div className="finding__foot">
                  <Link href={finding.href} className="pill-btn pill-btn--sm">
                    {finding.linkLabel} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
