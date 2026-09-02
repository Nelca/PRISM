/**
 * 頭出しバナー(第4版 D-11-1)。
 *
 * 「この画面でやること」を画面ヘッダー直下に出す。従来はStepNav(画面末尾)にしか
 * 出ておらず、④⑤のように縦に長い画面では毎回最下部までスクロールしないと
 * 残タスクが見えなかった。**残タスクがある時だけ**表示し、各項目はページ内の
 * 該当カードへのアンカーリンクにする。
 *
 * 判定は `deriveOpenTasks`(ホーム・StepNavと同一ソース)。導出を再実装しない。
 */

import type { DemoPipelineResult } from "@/lib/demo/run-demo-pipeline";
import { deriveOpenTasks } from "@/lib/pipeline/open-tasks";

export function TaskBanner({ current, result }: { current: string; result: DemoPipelineResult }) {
  const tasks = deriveOpenTasks(result).filter((task) => task.section === current);
  if (tasks.length === 0) return null;

  return (
    <div className="task-banner" role="status">
      <span className="task-banner__title">要対応 {tasks.length}件</span>
      <ul className="task-banner__list">
        {tasks.map((task) => (
          <li key={task.id}><a href={task.href}>{task.text}</a></li>
        ))}
      </ul>
    </div>
  );
}
