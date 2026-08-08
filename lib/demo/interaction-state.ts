/**
 * ユーザー操作の「現在値」。追記されたイベント列(interaction_event)を畳み込んで得る射影であり、
 * それ自体を保存しない(承認済み計画のB-1)。
 *
 * 以前は `interaction-store.ts` がプロセス内の Map として現在値を保持し、変更履歴を
 * 別のMap(m4ChangeLog)に持っていた。追記型にしたことで、現在値も履歴も同じイベント列から出る。
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

/** イベントの種別。DBの interaction_event.kind と1:1で対応する。 */
export type InteractionKind =
  | "depth_override"
  | "representative_selection"
  | "countermeasure_selection"
  | "binding_mechanism_change"
  | "disclosure_claim_override"
  | "intentional_decision";

export interface InteractionEvent {
  id: string;
  createdAt: string;
  actor: string;
  kind: InteractionKind;
  subjectId: string;
  payload: Record<string, unknown>;
}

export interface InteractionState {
  depthOverrides: Map<string, "promote" | "demote">;
  representativeRecordId: Map<string, string>;
  m4ChangeLog: Map<string, { from: string; to: string; reason: string }>;
  selectedCountermeasureKey: Map<string, CountermeasureType>;
  bindingMechanismState: Map<string, BindingMechanismState>;
  disclosureClaimOverrideText: Map<string, string>;
  intentionalDecisions: Map<string, { reason: string; recordedAt: string }>;
  /** 画面に出す操作ログ。新しい順。別テーブルを持たず、同じイベント列の射影として作る。 */
  actionLog: ActionLogEntry[];
}

export function emptyInteractionState(): InteractionState {
  return {
    depthOverrides: new Map(),
    representativeRecordId: new Map(),
    m4ChangeLog: new Map(),
    selectedCountermeasureKey: new Map(),
    bindingMechanismState: new Map(),
    disclosureClaimOverrideText: new Map(),
    intentionalDecisions: new Map(),
    actionLog: [],
  };
}

/**
 * イベント列を現在値へ畳み込む。**古い順に適用すること**(後のイベントが前を上書きする)。
 * 拘束方式(M6 D-9)だけは上書きではなく履歴を積み上げる。
 */
export function projectInteractionState(events: InteractionEvent[]): InteractionState {
  const state = emptyInteractionState();
  const ordered = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const event of ordered) {
    switch (event.kind) {
      case "depth_override": {
        const mode = event.payload.mode as "promote" | "demote" | "auto";
        if (mode === "auto") {
          state.depthOverrides.delete(event.subjectId);
        } else {
          state.depthOverrides.set(event.subjectId, mode);
        }
        break;
      }
      case "representative_selection": {
        state.representativeRecordId.set(event.subjectId, event.payload.recordId as string);
        state.m4ChangeLog.set(event.subjectId, {
          from: event.payload.fromLabel as string,
          to: event.payload.toLabel as string,
          reason: event.payload.reason as string,
        });
        break;
      }
      case "countermeasure_selection": {
        state.selectedCountermeasureKey.set(event.subjectId, event.payload.key as CountermeasureType);
        break;
      }
      case "binding_mechanism_change": {
        const previous = state.bindingMechanismState.get(event.subjectId);
        const newMechanism = event.payload.mechanism as BindingMechanism;
        const history = previous
          ? [
              ...previous.history,
              {
                previousMechanism: previous.mechanism,
                reason: event.payload.reason as string,
                changedAt: event.createdAt,
              },
            ]
          : [];
        state.bindingMechanismState.set(event.subjectId, { mechanism: newMechanism, history });
        break;
      }
      case "disclosure_claim_override": {
        state.disclosureClaimOverrideText.set(event.subjectId, event.payload.text as string);
        break;
      }
      case "intentional_decision": {
        state.intentionalDecisions.set(event.subjectId, {
          reason: event.payload.reason as string,
          recordedAt: event.createdAt,
        });
        break;
      }
    }

    if (typeof event.payload.logMessage === "string") {
      state.actionLog.unshift({ date: event.createdAt, who: event.actor, what: event.payload.logMessage });
    }
  }

  return state;
}
