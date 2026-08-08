/**
 * UIから追加された拠点(SiteRow)+深掘り評価・意思決定・開示用パラメータを保持する
 * プロセス内ストア。DB未接続のデモ環境向けの暫定実装のため、サーバー再起動で消える(永続化なし)。
 */

import type { SiteRow } from "@core/site/ingest";

export interface UserSiteDeepDiveParams {
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

const userSiteEntries: UserSiteEntry[] = [];
let nextSequence = 1;

export function listUserAddedSiteRows(): SiteRow[] {
  return userSiteEntries.map((entry) => entry.row);
}

export function listUserSiteEntries(): UserSiteEntry[] {
  return userSiteEntries;
}

export function addUserSiteRow(row: Omit<SiteRow, "id">, deepDive: UserSiteDeepDiveParams): SiteRow {
  const siteRow: SiteRow = { ...row, id: `site-user-${nextSequence++}` };
  userSiteEntries.push({ row: siteRow, deepDive });
  return siteRow;
}
