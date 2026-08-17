import type { PipelineWarning } from "@/lib/demo/run-demo-pipeline";
import { withMethodLabelsInText } from "./method-labels";

/**
 * 「適用できなかった操作」の表示(第4版 D-01-3)。
 *
 * 操作イベントは追記のみで取り消せない(計画B-1)。保存済みの操作が、その後の設定変更などで
 * 解釈できなくなった場合、パイプラインはその操作を外して計算を続けるが、
 * **黙って無視しない。**何が適用されなかったのかを、その操作をした画面の上部に出す。
 */
export function PipelineWarnings({ warnings, screen }: { warnings: PipelineWarning[] | undefined; screen: string }) {
  const shown = (warnings ?? []).filter((warning) => warning.screen === screen);
  if (shown.length === 0) return null;

  return (
    <div className="pipeline-warning" role="status">
      {/*
        見出しは「適用できなかった操作」に限定しない。**保存済みの操作を適用できなかった場合**と
        **計算に使う値を調整した場合**の両方がここに出るため、どちらなのかは各行の文で言い切る。
      */}
      <div className="pipeline-warning__title">この計算について、ご確認いただきたいことが{shown.length}件あります</div>
      {/*
        保存済みrunに焼き付いた文でも、生の手法IDは画面に出さない(D-03)。
        辞書が内訳値に対応する前に保存されたrunを読むことがあるため、表示時に通す。
      */}
      <ul className="pipeline-warning__list">
        {shown.map((warning) => (
          <li key={warning.id}>{withMethodLabelsInText(warning.message)}</li>
        ))}
      </ul>
    </div>
  );
}
