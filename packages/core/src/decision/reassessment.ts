/**
 * 前提が変わったときの再判定(構想書9.3のM8節、GAP-20の前半)。
 *
 * 構想書は M8 の機能として次を定めている:
 *   「DecisionRecordの前提と、n年後の実績との照合。前提が実績と乖離した場合、
 *     **過去に「効かない」と判定した案件の再判定アラートを出す**」
 *
 * このうち「n年後の実績との照合」は実績データがまだ存在しないため実装できない。
 * **一方「前提が変わったら過去の判定を洗い直す」部分は、実績を待たずに実装できる。**
 * 係数の版・較正パラメータ・承認閾値が変われば再計算ハッシュが変わるため
 * (D-113でレコード単位のハッシュを実装済み)、前提の変化はその場で検出できる。
 *
 * **これはアラートであって再判定ではない。**システムが勝手に過去の判定を書き換えることはしない
 * (判定は追記のみ・過去のrunは残る)。利用者に「見直す必要がある」と伝えるところまでを担う。
 */

import type { DecisionVerdict } from "../types/decision";

export type ReassessmentAlertLevel =
  /** 前提が変わり、**判定の向きまで変わった**。最も重い */
  | "verdict_changed"
  /** 前提は変わったが判定の向きは同じ。根拠の説明が変わるため確認は要る */
  | "assumptions_changed"
  /** 前提が変わり、保留だった判定が確定した(またはその逆) */
  | "verdict_resolved"
  /** 変化なし */
  | "unchanged";

export interface DecisionSnapshot {
  decisionRecordId: string;
  verdict: DecisionVerdict;
  recalculationHash: string;
}

export interface ReassessmentAlert {
  decisionRecordId: string;
  level: ReassessmentAlertLevel;
  previousVerdict: DecisionVerdict;
  currentVerdict: DecisionVerdict;
  /** 画面にそのまま出す説明文。固定テンプレート+機械的な埋め込み(AIを使わない)。 */
  message: string;
}

const VERDICT_LABEL: Record<DecisionVerdict, string> = {
  does_not_cross: "承認基準をまたがない",
  crosses: "承認基準をまたぐ",
  pending: "保留(承認閾値が未入力)",
};

/**
 * 過去に確定した判定と現在の判定を突き合わせ、見直しが必要なものを返す。
 *
 * 突き合わせの鍵は `recalculationHash`。ハッシュが同じなら前提は変わっていない
 * (係数版・較正パラメータ・承認閾値・上流のValuationRecordがすべて同一)。
 * ハッシュだけを見て「値が変わったか」を推測しない —— 判定の向きは verdict で直接比較する。
 */
export function detectReassessmentAlerts(
  previous: DecisionSnapshot[],
  current: DecisionSnapshot[]
): ReassessmentAlert[] {
  const previousById = new Map(previous.map((snapshot) => [snapshot.decisionRecordId, snapshot]));

  return current.flatMap((now) => {
    const before = previousById.get(now.decisionRecordId);
    // 過去に記録のない判定(新規)は再判定の対象ではない
    if (!before || before.recalculationHash === now.recalculationHash) {
      return [];
    }

    const level = resolveLevel(before.verdict, now.verdict);
    if (level === "unchanged") {
      return [];
    }

    return [
      {
        decisionRecordId: now.decisionRecordId,
        level,
        previousVerdict: before.verdict,
        currentVerdict: now.verdict,
        message: buildMessage(level, before.verdict, now.verdict),
      },
    ];
  });
}

function resolveLevel(previous: DecisionVerdict, current: DecisionVerdict): ReassessmentAlertLevel {
  if (previous === current) {
    return "assumptions_changed";
  }
  if (previous === "pending" || current === "pending") {
    return "verdict_resolved";
  }
  return "verdict_changed";
}

function buildMessage(level: ReassessmentAlertLevel, previous: DecisionVerdict, current: DecisionVerdict): string {
  switch (level) {
    case "verdict_changed":
      return (
        `前提が変わった結果、判定が「${VERDICT_LABEL[previous]}」から「${VERDICT_LABEL[current]}」に変わりました。` +
        "過去にこの判定を根拠にした意思決定があれば、見直しが必要です。"
      );
    case "verdict_resolved":
      return `前提が変わり、判定が「${VERDICT_LABEL[previous]}」から「${VERDICT_LABEL[current]}」になりました。`;
    case "assumptions_changed":
      return (
        `判定の向きは「${VERDICT_LABEL[current]}」のまま変わっていませんが、計算の前提(係数の版・較正パラメータ・` +
        "承認閾値・根拠にした評価のいずれか)が変わっています。判定の根拠として説明する内容が変わります。"
      );
    case "unchanged":
      return "";
  }
}
