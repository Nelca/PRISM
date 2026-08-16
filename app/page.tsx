import Link from "next/link";
import { getTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { deriveFindings, deriveOpenTasks, deriveStepProgress } from "@/lib/pipeline/open-tasks";
import { Card } from "./components/ui";

/** 工程の番号はこの画面(進捗ブロック)にだけ出す。常設ナビには出さない(指示01)。 */
const STEP_MARK = ["①", "②", "③", "④", "⑤", "⑥"];

/**
 * ホーム=「現在地と次にやること」(指示04)。
 *
 * (a)進捗:6ステップの工程図と完了状態。工程の可視化はこの画面だけが担う。
 * (b)次にやること:未完了の必須判断のチェックリスト(指示13)。
 * (c)分かったこと:実データから導出した発見(指示14)。
 *
 * M6の判定表・M8の件数カードはそれぞれ⑤・記録(監査証跡)が担うため、ここからは外した。
 */
export default async function Home() {
  const result = await getOrCreateLatestResult(await getTenantId());

  const steps = deriveStepProgress(result);
  const tasks = deriveOpenTasks(result);
  const findings = deriveFindings(result);

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">{result.companyName}</h1>
        </div>
        <p style={{ marginTop: 6, fontSize: 12.5, color: "var(--ink-faint)" }}>
          いまどこまで進んでいるか、次に何を判断すべきか、そして何が分かったかをこの画面にまとめています。
        </p>
      </div>

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
            まだ発見はありません。代表値の選択と承認閾値の入力が済むと、ここに結果が表示されます。
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
