/**
 * M5 D-2:ブリッジ2(社会的費用ビュー)。
 * 参照元: docs/requirements/m5-financial-bridge.md §2
 *
 * 入力は厚生価値のみ(WelfareAmount)。disclosureOnlyLabelを常時付与し、
 * 「投資判断には接続されていません」というX7の可視化を型レベルでも保証する。
 * Bridge1NatureAdjustedProfitとは共通の親インターフェースを持たず、
 * 両者を同じ配列・同じ合計に入れる関数はコンパイルエラーになる(design-rationale-log D-24)。
 */

import type { WelfareAmount } from "../types/common";
import type { Bridge2SocialCostView } from "../types/financial-bridge";
import { buildNonGaapLabel } from "./non-gaap-label";

export function buildBridge2SocialCostView(
  socialCost: WelfareAmount,
  internalizationRate: number
): Bridge2SocialCostView {
  return {
    socialCost,
    internalizationRate,
    nonGaapLabel: buildNonGaapLabel(["socialCost"]),
    disclosureOnlyLabel: true,
  };
}
