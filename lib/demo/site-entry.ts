/**
 * 追加登録された拠点(SiteRow)と、その深掘り評価・意思決定・開示用パラメータ。
 *
 * 以前は site-store.ts がプロセス内配列としてこれを保持していたが、DBの `site` テーブルに
 * 移したため、ここには型だけを残す(読み書きは lib/db/repositories/sites.ts)。
 */

import type { SiteRow } from "@core/site/ingest";

export interface UserSiteDeepDiveParams {
  /** 1件追加フォームで直接算定できるカテゴリ。古い保存データはwaterとして扱う。 */
  category?: "water" | "climate";
  physicalQuantity: number;
  unit: string;
  unitReplacementCost: number;
  investmentCostInitial: number;
  investmentCostRecurring: number;
  baselineNpvValue: number;
  approvalThresholdValue: number;
  /** M2の優先度算定結果によらず深掘り評価に進めるか(manualOverrides)。 */
  forcePromote: boolean;
  disclosureClaimText?: string;
}

export interface UserSiteEntry {
  row: SiteRow;
  deepDive: UserSiteDeepDiveParams;
}
