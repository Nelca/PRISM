/**
 * 構想書8.1・9.1が定める出力の第3層:DisclosureView(基準別に組み替えた開示文の生成)。
 * 参照元: docs/concept-v2.md 8.1、docs/requirements/m7-disclosure-verification.md §0
 *
 * **M7の検証方向とは逆向きの機能である。**
 *   検証: 既存の開示文 → 主張を抽出 → 根拠と突き合わせる(段階1〜4)
 *   生成: 自社のレコード → 基準別に組み替えて文にする(ここ)
 * 生成はPDFもAIも必要としない。入力は自分たちのValuationRecord・MaterialIssue・DecisionRecordだけ。
 *
 * **文はテンプレート+機械的な数値埋め込みで作る。AIを使わない。**
 * M5 D-5.2(格付・資本コストの定性記述)と同じ理由:ケースによって表現が変わったり、
 * うっかり踏み込んだ評価を生成するリスクを避けるため。
 *
 * **基準別の項目マッピング(SSBJのどの開示項目に何を載せるか)はまだ確定していない。**
 * SSBJ基準本文が未取得のため(`docs/data/acquisition-runbook.md` A-15)。
 * ここで実装するのは「レコードから文を組み立てる器」までで、項目マッピングは
 * `DisclosureViewTemplate` として外から差し込む。**器の側で基準を推測しない。**
 */

import type { DisclosureStandard, DisclosureView } from "../types/disclosure";
import type { ValuationRecord } from "../types/valuation";
import type { MaterialIssue } from "../types/site";
import type { DecisionRecord } from "../types/decision";

/** 生成に使える素材。すべて自社の既存レコードから取る(新しい評価をしない)。 */
export interface DisclosureViewSource {
  materialIssues: MaterialIssue[];
  valuationRecords: ValuationRecord[];
  decisionRecords: DecisionRecord[];
}

/**
 * 開示文の1段落を組み立てるテンプレート。
 * 基準ごとの項目定義は外部(基準本文)に依存するため、ここでは差し込み可能にする。
 */
export interface DisclosureViewSection {
  /** 基準側の項目名(例:SSBJの「移行リスクの財務影響」)。基準本文から転記する。 */
  requirementLabel: string;
  /** この項目に対応する文を組み立てる。素材が足りない場合は null を返す(埋めない)。 */
  render: (source: DisclosureViewSource) => string | null;
}

export interface DisclosureViewTemplate {
  standard: DisclosureStandard;
  /** テンプレートの版。生成した開示文がどの版で作られたかを追跡する(M8 D-3)。 */
  version: string;
  sections: DisclosureViewSection[];
}

export interface BuildDisclosureViewResult {
  view: DisclosureView;
  /** 素材が足りず生成できなかった項目。**空欄を作文で埋めない**(D-15)。 */
  unfilledRequirements: string[];
}

export function buildDisclosureView(
  id: string,
  template: DisclosureViewTemplate,
  source: DisclosureViewSource,
  generatedAt: string
): BuildDisclosureViewResult {
  const paragraphs: string[] = [];
  const unfilledRequirements: string[] = [];

  for (const section of template.sections) {
    const text = section.render(source);
    if (text === null) {
      unfilledRequirements.push(section.requirementLabel);
      continue;
    }
    paragraphs.push(`【${section.requirementLabel}】\n${text}`);
  }

  return {
    view: {
      id,
      standard: template.standard,
      // 生成元をたどれるようにする。開示文の1文ごとの出所は、この一覧と
      // 各レコードのrecalculationHash(D-113)で追える
      sourceDisclosureClaimIds: [],
      generatedText: paragraphs.join("\n\n"),
      generatedAt,
    },
    unfilledRequirements,
  };
}

/**
 * 数値の表示。開示文に載せる金額は円単位に丸める(計算に使う値は丸めない)。
 * テンプレート側から使う共通ヘルパー。
 */
export function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}
