import Link from "next/link";
import { loadPipelineView } from "@/lib/views/pipeline";
import {
  deriveFindings,
  deriveMoneySummary,
  deriveOpenTasks,
  deriveOutcomeSummary,
  deriveStepProgress,
} from "@/lib/pipeline/open-tasks";
import { verdictLabel, verdictTagVariant } from "./components/labels";
import { Num, pickYenScale } from "./components/numeric";
import { Card, Tag } from "./components/ui";

/** 工程の番号はこの画面(進捗ブロック)にだけ出す。常設ナビには出さない(指示01)。 */
const STEP_MARK = ["①", "②", "③", "④", "⑤", "⑥"];

/** 流れ図・成果物行のアイコン(外部ライブラリ不使用の最小SVG。strokeはcurrentColor)。 */
function PipeIcon({ kind }: { kind: "data" | "yen" | "verdict" | "disclosure" | "ledger" }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "data")
    return (
      <svg {...common}>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
      </svg>
    );
  if (kind === "yen")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 7l3.5 5 3.5-5M12 12v5M9.5 13.5h5M9.5 16h5" />
      </svg>
    );
  if (kind === "verdict")
    return (
      <svg {...common}>
        <path d="M12 2.5L21.5 12 12 21.5 2.5 12 12 2.5z" />
        <path d="M8.5 12l2.4 2.4 4.6-4.8" />
      </svg>
    );
  if (kind === "disclosure")
    return (
      <svg {...common}>
        <path d="M6 2.5h8l4 4V21.5H6z" />
        <path d="M14 2.5v4h4M9 12h6M9 15.5h6" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}

/**
 * 判定の内訳バー(件数を色で示す)。凡例はタイルの下の行が担う。
 * 割合バーはスケールに耐える表現(拠点数が増えても形が変わらない)。
 */
function SegBar({ segments }: { segments: { count: number; className: string; label: string }[] }) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;
  return (
    <div className="segbar" role="img" aria-label={segments.map((s) => `${s.label}${s.count}件`).join("、")}>
      {segments
        .filter((s) => s.count > 0)
        .map((s) => (
          <span
            key={s.label}
            className={`segbar__seg ${s.className}`}
            style={{ width: `${(s.count / total) * 100}%` }}
            title={`${s.label} ${s.count}件`}
          />
        ))}
    </div>
  );
}

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
  const { verdicts, disclosure } = outcomes;
  const confirmed = verdicts.total - verdicts.pending;

  // 金額サマリー(④と同じ導出関数。行の並びは利益への影響が大きい順=読むべき順)。
  const money = deriveMoneySummary(result);
  const moneyRows = [...money.rows].sort((a, b) => Math.abs(b.profitImpactPct) - Math.abs(a.profitImpactPct));
  const moneyScale = pickYenScale(money.totalNatureDebt, ...moneyRows.map((row) => row.natureDebt));
  const maxImpactPct = Math.max(...moneyRows.map((row) => Math.abs(row.profitImpactPct)), 0);

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">{result.companyName}</h1>
        </div>
        {/* IA-02:リード文は工程説明ではなくバリュープロポジション+初見者の導線。 */}
        <p style={{ marginTop: 6, fontSize: 12.5, color: "var(--ink-soft)" }}>
          環境データを、投資判断と開示に使える形に変換します。初めての方は{" "}
          <Link href="/guide" style={{ fontWeight: 600, color: "var(--accent-ink)" }}>
            はじめに(使い方)→
          </Link>
        </p>
      </div>

      {/* (0) 流れ図と成果物。件数はderiveOutcomeSummary(進捗と同一ソース)から。 */}
      <Card title="データから成果物まで" foot="それぞれの箱を押すと、該当の画面が開きます">
        <div className="pipe">
          <Link href="/sites" className="pipe__node">
            <span className="pipe__icon">
              <PipeIcon kind="data" />
            </span>
            <span className="pipe__label">環境データ</span>
            <span className="pipe__num num">
              {outcomes.siteCount}
              <small>拠点</small>
            </span>
          </Link>

          <span className="pipe__arrow" aria-hidden="true" />

          <Link href="/valuation" className="pipe__node">
            <span className="pipe__icon">
              <PipeIcon kind="yen" />
            </span>
            <span className="pipe__label">金額に換算</span>
            <span className="pipe__num num">
              {outcomes.valuation.selected}/{outcomes.valuation.total}
              <small>代表値</small>
            </span>
          </Link>

          <span className="pipe__arrow" aria-hidden="true" />

          <div className="pipe__outs">
            <Link href="/decision" className="pipe__out">
              <span className="pipe__icon pipe__icon--accent">
                <PipeIcon kind="verdict" />
              </span>
              <span className="pipe__out-body">
                <span className="pipe__out-name">判定</span>
                <span className="pipe__out-sub">投資の結論が変わるか</span>
                {verdicts.total > 0 ? (
                  <>
                    <SegBar
                      segments={[
                        { count: verdicts.doesNotCross, className: "segbar__seg--ok", label: "結論は変わらない" },
                        { count: verdicts.crosses, className: "segbar__seg--warn", label: "結論が変わる可能性" },
                        { count: verdicts.pending, className: "segbar__seg--neutral", label: "保留" },
                      ]}
                    />
                    <span className="pipe__legend">
                      {verdicts.doesNotCross > 0 && (
                        <span className="pipe__legend-item">
                          <i className="segdot segdot--ok" />
                          変わらない {verdicts.doesNotCross}
                        </span>
                      )}
                      {verdicts.crosses > 0 && (
                        <span className="pipe__legend-item">
                          <i className="segdot segdot--warn" />
                          変わる可能性 {verdicts.crosses}
                        </span>
                      )}
                      {verdicts.pending > 0 && (
                        <span className="pipe__legend-item">
                          <i className="segdot segdot--neutral" />
                          保留 {verdicts.pending}
                        </span>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="pipe__out-sub">対象なし</span>
                )}
              </span>
              <span className="pipe__num num">
                {confirmed}/{verdicts.total}
                <small>確定</small>
              </span>
            </Link>

            <Link href="/disclosure" className="pipe__out">
              <span className="pipe__icon pipe__icon--accent">
                <PipeIcon kind="disclosure" />
              </span>
              <span className="pipe__out-body">
                <span className="pipe__out-name">開示</span>
                <span className="pipe__out-sub">記載と根拠の下書き</span>
                {disclosure.total > 0 && (
                  <SegBar
                    segments={[
                      { count: disclosure.handled, className: "segbar__seg--ok", label: "根拠を確認済み" },
                      { count: disclosure.total - disclosure.handled, className: "segbar__seg--neutral", label: "未確認" },
                    ]}
                  />
                )}
              </span>
              <span className="pipe__num num">
                {disclosure.handled}/{disclosure.total}
                <small>根拠確認</small>
              </span>
            </Link>

            <Link href="/ledger" className="pipe__out">
              <span className="pipe__icon pipe__icon--accent">
                <PipeIcon kind="ledger" />
              </span>
              <span className="pipe__out-body">
                <span className="pipe__out-name">記録</span>
                <span className="pipe__out-sub">監査証跡・自動記録</span>
              </span>
              <span className="pipe__num num">
                {outcomes.assumptionEntryCount}
                <small>件</small>
              </span>
            </Link>
          </div>
        </div>
      </Card>

      {/* (0b) 金額でみる評価結果(2026-08-23レビュー第3回)。導出は④と同じderiveMoneySummary。 */}
      {moneyRows.length > 0 && (
        <Card
          title="金額でみる評価結果"
          subtitle="拠点ごとの利益への影響と自然債務"
          padBody={false}
          headExtra={
            <span
              className="nongaap"
              title="監査済みの決算書の数値ではなく、PRISMが算出した参考値です(いわゆる非GAAP指標)"
            >
              社内試算値
            </span>
          }
          foot="投資判断に使える金額(交換価値)のみを集計しています。社会全体への影響(厚生価値)は含めません ・ 利益への影響:自然コストを織り込んだときの営業利益(決算値)の変化率(マイナスは下振れ)"
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
                      href={`/financial-bridge?site=${encodeURIComponent(row.siteId)}#site-${row.siteId}`}
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
                <td style={{ color: "var(--ink-faint)", fontSize: 11.5 }}>比率のため合算しません</td>
                <td className="num" style={{ fontWeight: 700 }}>
                  <Num value={money.totalNatureDebt} unit="円" scale={moneyScale} />
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      {/* (a) 進捗 */}
      <Card title="進捗" subtitle="登録から開示までの6ステップ" foot="完了状態は登録済みのデータと判定結果から自動で判定しています">
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
              <span className="flow__step-note">{step.note}</span>
            </Link>
          ))}
        </div>
      </Card>

      {/* (b) 次にやること */}
      <Card
        title="次にやること"
        subtitle="人が判断しないと先に進めない項目"
        foot="実際の算定・判定結果から導出しています。該当がない項目は表示しません"
      >
        {tasks.length === 0 ? (
          <p style={{ color: "var(--ink-faint)" }}>未完了の必須判断はありません。</p>
        ) : (
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.id} className="task-item">
                <span className="task-item__mark" aria-hidden="true" />
                <span className="task-item__body">{task.text}</span>
                <Link href={task.href} className="pill-btn pill-btn--sm task-item__link">
                  {task.linkLabel} →
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* (c) 分かったこと */}
      <Card
        title="分かったこと"
        subtitle="算定・判定の結果から読み取れること"
        foot="固定の文章テンプレートに算定結果を機械的に埋め込んでいます。AIによる文章生成は行っていません"
      >
        {findings.length === 0 ? (
          <p style={{ color: "var(--ink-faint)" }}>
            まだ発見はありません。代表値の選択と投資の承認ラインの入力が済むと、ここに結果が表示されます。
          </p>
        ) : (
          <div className="finding-list">
            {findings.map((finding) => (
              <div key={finding.id} className="finding">
                <p className="finding__headline" title={finding.exact}>
                  {finding.headline}
                </p>
                <p className="finding__detail">{finding.detail}</p>
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
