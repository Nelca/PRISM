/**
 * M7 G6:選択的開示の検出。
 * 参照元: docs/requirements/m7-disclosure-verification.md §3、docs/roadmap/build-plan.md §5.5
 *
 * build-plan §5.5 は M2 の除外理由記録について
 *   「**M7のG6(選択的開示の検出)を可能にする唯一の情報源**」
 * と書いている。その記録(M1のMaterialIssue除外・M2の深掘り除外・評価不能だった基準)は
 * M1〜M2で全件揃っているため、新しいデータ源を足さずに判定できる。
 *
 * **選択的開示とは:** 開示文が触れている範囲(カテゴリ×対象範囲)の中に、
 * 評価から外した・深掘りしなかった対象があるのに、開示文がそれに言及していない状態。
 * 根拠そのものは存在する(G1〜G4は発生しない)ため、根拠の有無を見るだけでは検出できない。
 *
 * **他社評価は行わない(除外事項X6)。**対象は自社の開示と自社の除外記録に限る。
 * 判定はルールのみで行い、LLMを使わない(段階3・4の制約)。
 */

import type { ImpactCategory } from "../types/common";

/** 除外の種類。「評価していない」理由を区別したまま保持する(D-15と同じ規律)。 */
export type ExclusionKind =
  /** M1:座標・住所が解決できずMaterialIssue自体を評価していない */
  | "not_assessed"
  /** M2:MaterialIssueは作ったが深掘り評価に進めていない */
  | "not_deep_dived"
  /** M1/M8:ライセンス保留・データ源不在で一部の基準を評価できていない */
  | "criteria_unevaluated";

/**
 * 開示の裏側にある「評価していないもの」の記録。
 * M1のMaterialIssue・M2のDepthDecisionから呼び出し側が組み立てる射影型
 * (M7専用の射影型を使う方針はD-95で確立済み。M1・M2の型は変更しない)。
 */
export interface ExclusionRecord {
  siteId: string;
  category: ImpactCategory;
  /** 開示文の scopeMentioned と突き合わせる対象範囲の表記。 */
  scope: string;
  kind: ExclusionKind;
  /** 除外・未評価の理由。開示文に添えて説明できるよう、そのまま出力に載せる。 */
  reason: string;
}

export interface SelectiveDisclosureFinding {
  /** 開示が触れている範囲に含まれるのに、評価していない対象。 */
  undisclosedExclusions: ExclusionRecord[];
}

/**
 * 開示文が触れている範囲に、評価していない対象が含まれているかを判定する。
 *
 * 突き合わせは構造化フィールドの一致のみで行う(M7 D-2と同じ。自然言語の類似度を使わない)。
 * - `category`: 開示文が特定していない(null)場合は、カテゴリで絞らない
 * - `scope`: 開示文が特定していない(null)場合は、範囲で絞らない
 *
 * **開示文が除外に言及しているかどうかは判定しない。**言及の有無を機械的に読み取るには
 * 自然言語理解が必要で、段階3・4にLLMを使わないという制約に反する。
 * ここが検出するのは「評価していない対象が範囲内に存在する」という事実までで、
 * それを開示文に書くかどうかは利用者の判断(推奨アクション③の意図的判断記録)に委ねる。
 */
export function detectSelectiveDisclosure(
  claimCategory: ImpactCategory | null,
  claimScope: string | null,
  exclusions: ExclusionRecord[]
): SelectiveDisclosureFinding {
  const undisclosedExclusions = exclusions.filter((exclusion) => {
    const categoryMatches = claimCategory === null || exclusion.category === claimCategory;
    const scopeMatches = claimScope === null || exclusion.scope === claimScope;
    return categoryMatches && scopeMatches;
  });

  return { undisclosedExclusions };
}
