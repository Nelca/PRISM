/**
 * UI操作(M2深度トグル・M4代表値変更・M6対策選択/反映先記録・M7開示アクション)の
 * 選択状態を保持するプロセス内ストア。site-store.tsと同じ前提(DB未接続の
 * デモ環境向け暫定実装。サーバー再起動で消える・永続化なし)。
 */

import type { BindingMechanism, CountermeasureType } from "@core/types/decision";

export interface BindingMechanismState {
  mechanism: BindingMechanism;
  history: { previousMechanism: BindingMechanism; reason: string; changedAt: string }[];
}

export interface ActionLogEntry {
  date: string;
  who: string;
  what: string;
}

const depthOverrides = new Map<string, "promote" | "demote">();
const representativeRecordId = new Map<string, string>();
const m4ChangeLog = new Map<string, { from: string; to: string; reason: string }>();
const selectedCountermeasureKey = new Map<string, CountermeasureType>();
const bindingMechanismState = new Map<string, BindingMechanismState>();
const disclosureClaimOverrideText = new Map<string, string>();
const intentionalDecisions = new Map<string, { reason: string; recordedAt: string }>();
const actionLog: ActionLogEntry[] = [];

export function getDepthOverrides(): Map<string, "promote" | "demote"> {
  return depthOverrides;
}
export function setDepthOverride(materialIssueId: string, mode: "promote" | "demote" | "auto"): void {
  if (mode === "auto") {
    depthOverrides.delete(materialIssueId);
  } else {
    depthOverrides.set(materialIssueId, mode);
  }
}

export function getRepresentativeRecordId(materialIssueId: string): string | undefined {
  return representativeRecordId.get(materialIssueId);
}
export function setRepresentativeRecordId(materialIssueId: string, recordId: string): void {
  representativeRecordId.set(materialIssueId, recordId);
}

export function getM4ChangeLog(materialIssueId: string): { from: string; to: string; reason: string } | undefined {
  return m4ChangeLog.get(materialIssueId);
}
export function setM4ChangeLog(materialIssueId: string, entry: { from: string; to: string; reason: string }): void {
  m4ChangeLog.set(materialIssueId, entry);
}

export function getSelectedCountermeasureKey(siteId: string): CountermeasureType | undefined {
  return selectedCountermeasureKey.get(siteId);
}
export function setSelectedCountermeasureKey(siteId: string, key: CountermeasureType): void {
  selectedCountermeasureKey.set(siteId, key);
}

export function getBindingMechanismState(siteId: string): BindingMechanismState | undefined {
  return bindingMechanismState.get(siteId);
}
export function setBindingMechanismState(siteId: string, state: BindingMechanismState): void {
  bindingMechanismState.set(siteId, state);
}

export function getDisclosureClaimOverrideText(claimId: string): string | undefined {
  return disclosureClaimOverrideText.get(claimId);
}
export function setDisclosureClaimOverrideText(claimId: string, text: string): void {
  disclosureClaimOverrideText.set(claimId, text);
}

export function getIntentionalDecisions(): Map<string, { reason: string; recordedAt: string }> {
  return intentionalDecisions;
}
export function setIntentionalDecision(gapFindingId: string, reason: string, recordedAt: string): void {
  intentionalDecisions.set(gapFindingId, { reason, recordedAt });
}

export function listActionLog(): ActionLogEntry[] {
  return actionLog;
}
export function addActionLogEntry(who: string, what: string): void {
  actionLog.unshift({ date: new Date().toISOString(), who, what });
}
