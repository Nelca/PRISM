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
import { ActionRow, RatioBar, StatGrid, StatTile, StatusBadge, Stepper, type StepState } from "./components/viz";
import { Icon, SCREEN_ICON, iconForHref } from "./components/icons";

/** 工程の番号はこの画面(進捗ブロック)にだけ出す。常設ナビには出さない(指示01)。 */
const STEP_MARK = ["01", "02", "03", "04", "05", "06"];

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
 * 初回の価値理解 → 作業再開 → 全工程 → 結果の順で表示する。
 * 次の操作・進捗・金額は既存の共通導出関数を使い、業務画面と一致させる。
 * 参照: docs/uiux-refresh-2026-09-20.md
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

  // Stepper(全体の流れ)の状態: 要対応あり→attention、done→done、それ以外は最初の1件だけ
  // current・残りは upcoming(件数で形を変えず、状態の進み方だけを示す)。
  const firstOpenIndex = steps.findIndex((step) => {
    const stepTasks = tasksBySection.get(step.href) ?? [];
    return stepTasks.length === 0 && !step.done;
  });
  const stepperSteps = steps.map((step, index) => {
    const stepTasks = tasksBySection.get(step.href) ?? [];
    let state: StepState;
    if (stepTasks.length > 0) {
      state = "attention";
    } else if (step.done) {
      state = "done";
    } else if (index === firstOpenIndex) {
      state = "current";
    } else {
      state = "upcoming";
    }
    return { href: step.href, label: step.label, state, icon: iconForHref(step.href), note: step.note };
  });

  return (
    <div className="screen home-screen">
      <HomeOrientation />
      <Card
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon icon={SCREEN_ICON.portfolio} size={16} />
            資源・生態系もまとめて管理
          </span>
        }
      >
        <p>調達量・再生材割合・生息地の状態などを目標と比較し、拠点を横断して担当・対応期限を確認できます。</p>
        <ActionRow>
          <Link href="/portfolio" className="pill-btn pill-btn--accent">環境・資源の統合管理へ →</Link>
        </ActionRow>
      </Card>

      <div className="workspace-heading">
        <div><p className="section-eyebrow">WORKSPACE</p><h2>評価を進める</h2><p>入力から開示まで。未完了の操作から、作業を再開できます。</p></div>
        <span className="workspace-heading__count">要対応 <b className="num">{tasks.length}</b> 件</span>
      </div>
      {tasks[0] && (
        <section className="next-action" aria-label="次に進める操作">
          <div><span className="section-eyebrow">次の操作 · {steps.find((step) => step.href === tasks[0].section)?.label}</span><p>{tasks[0].text}</p></div>
          <Link href={tasks[0].href} className="pill-btn pill-btn--primary">{tasks[0].linkLabel} <span aria-hidden="true">→</span></Link>
        </section>
      )}
      <Card title="全体の流れ" subtitle="各工程から詳細を開けます" padBody={false}>
        <div className="home-stepper">
          <Stepper steps={stepperSteps} label="業務工程ごとの進捗" />
        </div>
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
                  <StatusBadge status={stepTasks.length > 0 ? "attention" : step.done ? "done" : "active"}>
                    {stepTasks.length > 0 ? "要対応" : step.done ? "完了" : "進行中"}
                  </StatusBadge>
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
        <div className="home-outcome-grid">
          <StatGrid columns={3}>
            <StatTile
              label="登録データ"
              value={`${outcomes.siteCount}拠点`}
              note="評価の入力"
              href="/sites"
              icon={iconForHref("/sites")}
            />
            <StatTile
              label="評価対象"
              value={`${outcomes.valuation.prioritized}/${outcomes.valuation.total}課題`}
              note={`詳細評価 ${outcomes.valuation.deepDive}件`}
              href="/assessment"
              icon={iconForHref("/assessment")}
              visual={<RatioBar value={outcomes.valuation.prioritized} total={outcomes.valuation.total} label="評価対象の優先度算定" unit="課題" showText={false} />}
            />
            <StatTile
              label="価値の算定"
              value={`${outcomes.valuation.valued}課題`}
              note={
                outcomes.valuation.representativeRequired > 0
                  ? `代表値 ${outcomes.valuation.selected}/${outcomes.valuation.representativeRequired}件`
                  : "代表値選択なし"
              }
              href="/valuation"
              icon={iconForHref("/valuation")}
              visual={
                outcomes.valuation.representativeRequired > 0 ? (
                  <RatioBar value={outcomes.valuation.selected} total={outcomes.valuation.representativeRequired} label="代表値の選択" unit="件" showText={false} />
                ) : undefined
              }
            />
            <StatTile
              label="財務への影響"
              value={<Num key="nature-debt" value={money.totalNatureDebt} unit="円" scale={moneyScale} />}
              note="自然債務 合計"
              href="/financial-bridge"
              icon={iconForHref("/financial-bridge")}
            />
            <StatTile
              label="対策と判定"
              value={`${confirmedVerdicts}/${outcomes.verdicts.total}拠点`}
              note={`承認ライン超過 ${outcomes.verdicts.crosses}件`}
              href="/decision"
              icon={iconForHref("/decision")}
              visual={<RatioBar value={confirmedVerdicts} total={outcomes.verdicts.total} label="判定確定" unit="拠点" showText={false} />}
            />
            <StatTile
              label="開示への反映"
              value={`${disclosure.handled}/${disclosure.total}件`}
              note="根拠確認済み"
              href="/disclosure"
              icon={iconForHref("/disclosure")}
              visual={<RatioBar value={disclosure.handled} total={disclosure.total} label="根拠確認" unit="件" showText={false} />}
            />
          </StatGrid>
        </div>

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
                  <td style={{ minWidth: 110 }}>
                    <StatusBadge variant={verdictTagVariant(row.verdict)}>{verdictLabel(row.verdict)}</StatusBadge>
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
