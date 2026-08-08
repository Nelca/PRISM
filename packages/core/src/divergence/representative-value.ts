/**
 * M4 §7.4:代表値の選択と、手法変更時の前年度手法での再計算値の並記。
 * 参照元: docs/requirements/m4-divergence-decomposition.md §7.4、docs/concept-v2.md 9.3
 *
 * 構想書9.3が M4 の既定ルールとして定める:
 *   「手法変更時: 変更理由の入力を必須化し、**前年度手法での再計算値を並記**
 *     (手法変更の差分と実態変化の差分を分離)」
 * build-plan §10 は「手法変更時に前年度手法での再計算値を出さない」を
 * 「実装で起きやすい違反」の1つとして名指ししている。
 *
 * **システムは推奨しない(D-23)。**ここで組み立てるのは、利用者が選んだ結果と、
 * 選択の材料になる事実(ティア分布・価値概念・前年度手法)だけである。
 * 「どれを選ぶべきか」を返す関数は作らない。
 */

import type { RepresentativeValueSelection } from "../types/divergence";
import type { ValuationRecord } from "../types/valuation";
import type { ValueConcept } from "../types/common";

export class RepresentativeValueSelectionError extends Error {}

/**
 * 手法変更時に前年度手法での再計算値を出せない理由。
 * **推定で埋めない(D-15)。**再計算できない場合は「できない」と明示する。
 */
export type PriorMethodRecalculationStatus =
  | "same_method" // 手法を変更していない(並記の必要がない)
  | "recalculated" // 前年度手法を当年度の物理量で再計算できた
  | "method_unavailable"; // 前年度手法が現在の手法セットに存在しない

export interface RepresentativeValueSelectionInput {
  /** この選択が属する価値概念グループ。交換価値と厚生価値をまたいで選ばせない(8.2)。 */
  groupValueConcept: ValueConcept;
  /** グループ内のValuationRecord(選択肢)。 */
  records: ValuationRecord[];
  selectedMethodId: string;
  /** 変更理由。空文字を許さない(M6 D-9と同じ規律。デフォルト値を設けない)。 */
  reason: string;
  /** 前年度に採用した手法(顧客提供の事実)。初年度は未指定。 */
  priorYearMethodId?: string;
}

export interface RepresentativeValueSelectionResult {
  selection: RepresentativeValueSelection;
  status: PriorMethodRecalculationStatus;
  /** status === "method_unavailable" のときに、何が欠けているかを出力に載せる。 */
  unavailableReason?: string;
}

/**
 * 代表値の選択を組み立てる。
 *
 * 前年度手法での再計算値は、**当年度の物理量で前年度手法を計算した値**である。
 * M3は深掘りのたびに全手法を並行実行しているため、当年度のレコード群から
 * 前年度手法の行を引くだけで得られる(新たな再計算は発生しない)。
 * これにより「手法変更による差分」を切り出せる。
 *
 * **「実態変化による差分」はここでは算出しない。**それには前年度の物理量での
 * 実績値が必要であり、本システムはまだ過年度の実績を保持していない。
 * 持っていない値を推定で埋めない(D-15)。
 */
export function buildRepresentativeValueSelection(
  input: RepresentativeValueSelectionInput
): RepresentativeValueSelectionResult {
  if (!input.reason.trim()) {
    throw new RepresentativeValueSelectionError(
      "代表値の選択には理由の入力が必須です(M4 §7.4)。デフォルトの理由を設けてはいけません。"
    );
  }

  const selectedRecord = input.records.find((record) => record.methodId === input.selectedMethodId);
  if (!selectedRecord) {
    throw new RepresentativeValueSelectionError(
      `選択された手法(${input.selectedMethodId})が、この価値概念グループのValuationRecordに存在しません。`
    );
  }
  if (selectedRecord.valueConcept !== input.groupValueConcept) {
    throw new RepresentativeValueSelectionError(
      `価値概念が一致しません(グループ=${input.groupValueConcept} / 選択=${selectedRecord.valueConcept})。` +
        "異なる価値概念をまたいだ代表値の選択は行いません(構想書8.2)。"
    );
  }

  const base: RepresentativeValueSelection = {
    groupValueConcept: input.groupValueConcept,
    selectedMethodId: input.selectedMethodId,
    reason: input.reason,
    ...(input.priorYearMethodId !== undefined ? { priorYearMethodId: input.priorYearMethodId } : {}),
  };

  if (input.priorYearMethodId === undefined || input.priorYearMethodId === input.selectedMethodId) {
    return { selection: base, status: "same_method" };
  }

  const priorRecord = input.records.find((record) => record.methodId === input.priorYearMethodId);
  if (!priorRecord) {
    return {
      selection: base,
      status: "method_unavailable",
      unavailableReason:
        `前年度手法(${input.priorYearMethodId})が現在の手法セットに存在しないため、` +
        "前年度手法での再計算値を算出できません。手法変更による差分と実態変化による差分を分離できません。",
    };
  }

  return {
    selection: { ...base, recalculatedWithPriorMethod: priorRecord.centralValue as unknown as number },
    status: "recalculated",
  };
}

/**
 * 選択の材料として提示する事実(M4 §7.4)。**推奨は含まない。**
 * 「基準・ガイダンスが言及している手法か」は外部の事実であり、呼び出し側が
 * 手法メタデータとして持ち込む(ここで判定しない)。
 */
export interface RepresentativeValueEvidence {
  methodId: string;
  valueConcept: ValueConcept;
  transferFitnessTier: ValuationRecord["transferFitness"]["tier"];
  aopCode: ValuationRecord["aopCode"];
  centralValue: number;
  /** 前年度に選択されていた手法か(事実の提示)。 */
  selectedLastYear: boolean;
}

export function buildRepresentativeValueEvidence(
  records: ValuationRecord[],
  priorYearMethodId?: string
): RepresentativeValueEvidence[] {
  return records.map((record) => ({
    methodId: record.methodId,
    valueConcept: record.valueConcept,
    transferFitnessTier: record.transferFitness.tier,
    aopCode: record.aopCode,
    centralValue: record.centralValue as unknown as number,
    selectedLastYear: record.methodId === priorYearMethodId,
  }));
}
