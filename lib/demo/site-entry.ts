/**
 * 追加登録された拠点(SiteRow)と、その深掘り評価・意思決定・開示用パラメータ。
 *
 * 以前は site-store.ts がプロセス内配列としてこれを保持していたが、DBの `site` テーブルに
 * 移したため、ここには型だけを残す(読み書きは lib/db/repositories/sites.ts)。
 */

import type { SiteRow } from "@core/site/ingest";
import type { DecisionParametersInput } from "./interaction-state";

export interface UserSiteDeepDiveParams {
  /** 1件追加フォームで直接算定できるカテゴリ。古い保存データはwaterとして扱う。 */
  category?: "water" | "climate";
  physicalQuantity: number;
  unit: string;
  unitReplacementCost: number;
  investmentCostInitial: number | null;
  investmentCostRecurring: number | null;
  baselineNpvValue: number | null;
  approvalThresholdValue: number | null;
  /**
   * 通常NPVの算定に使った割引率(小数、例: 0.06は6%)。M6独自の割引率は設けず、
   * 企業が既存の投資評価で使った値をそのまま使う(docs/requirements/m6-decision-record.md §4.3)。
   * 古い保存データや、CSV一括取込で優先度算定用にだけ登録した拠点にはない(未入力はnull)。
   */
  discountRate?: number | null;
  /** 通常NPVの算定に使った評価期間(年、整数)。discountRateと同じ理由でoptional。 */
  horizon?: number | null;
  /** M2の優先度算定結果によらず深掘り評価に進めるか(manualOverrides)。 */
  forcePromote: boolean;
  disclosureClaimText?: string;
  /**
   * CSV一括取込で、優先度算定(スクリーニング)のためだけに登録した拠点。年間の環境データ量・
   * コスト単価・投資前提は顧客から受け取っていない。後から詳細評価に進めても、架空の数量で
   * 算定しない(D-15)。数値フィールドは型を満たすための0であり、算定には使わない。
   */
  screeningOnly?: true;
}

export interface UserSiteEntry {
  row: SiteRow;
  deepDive: UserSiteDeepDiveParams;
}

/** 投資前提が揃うまでは貨幣化のみ行い、NPV・ROIを仮値で作らない。 */
export type DecisionReadySiteParams = UserSiteDeepDiveParams & {
  investmentCostInitial: number;
  investmentCostRecurring: number;
  baselineNpvValue: number;
  discountRate: number;
  horizon: number;
};

export function hasDecisionInputs(params: UserSiteDeepDiveParams): params is DecisionReadySiteParams {
  return (
    [params.investmentCostInitial, params.investmentCostRecurring, params.baselineNpvValue, params.discountRate]
      .every((value) => typeof value === "number" && Number.isFinite(value)) &&
    typeof params.horizon === "number" && Number.isInteger(params.horizon) && params.horizon >= 1
  );
}

/**
 * 保存済みの意思決定パラメータ(M6画面「投資判断の前提」で入力したNPV・割引率・評価期間)は、
 * 深掘りパラメータ(拠点登録フォーム)側にこれらが無くても判定に使ってよい。
 * 前提待ち判定(deferredDecisions)と決定計算(decisions)の両方で同じ合成結果を使うための
 * 共通ヘルパー(run-demo-pipeline.tsから呼ぶ。ロジックの重複を避ける)。
 */
export function withDecisionParameters(
  deepDive: UserSiteDeepDiveParams,
  decisionParameters: DecisionParametersInput | undefined
): UserSiteDeepDiveParams {
  if (!decisionParameters) return deepDive;
  return {
    ...deepDive,
    baselineNpvValue: decisionParameters.baselineNpvValue,
    discountRate: decisionParameters.discountRate,
    horizon: decisionParameters.horizon,
  };
}
