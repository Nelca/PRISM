/**
 * ユーザー操作の「現在値」。追記されたイベント列(interaction_event)を畳み込んで得る射影であり、
 * それ自体を保存しない(承認済み計画のB-1)。
 *
 * 以前は `interaction-store.ts` がプロセス内の Map として現在値を保持し、変更履歴を
 * 別のMap(m4ChangeLog)に持っていた。追記型にしたことで、現在値も履歴も同じイベント列から出る。
 */

import type { BindingMechanism, BindingMechanismChangeEntry, CountermeasureType } from "@core/types/decision";
import type { ValueConcept } from "@core/types/common";
import type { DisclosureClaim } from "@core/types/disclosure";

export interface BindingMechanismState {
  mechanism: BindingMechanism;
  /**
   * M6 §9の`BindingMechanismChangeEntry`そのもの。
   * 以前は`newMechanism`を欠いた別形で持っており、DecisionRecordに載せると
   * 型が合っていなかった(2026-08-09に修正)。
   */
  history: BindingMechanismChangeEntry[];
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
  /** M7段階1・2:PDFからAIが抽出したDisclosureClaim群(GAP-05)。subjectIdはsourceDocument名。 */
  | "disclosure_pdf_extracted"
  | "intentional_decision"
  /** 企業単位の財務データ(M5)。財務・経理部門が入力する。 */
  | "company_financials"
  /** 決定単位の入力(M6 D-4・D-10)。経営企画・経理が入力する。 */
  | "decision_parameters"
  /** 物理入力カテゴリごとの有効バッチ切替。現在値は入力リポジトリ側で射影する。 */
  | "input_batch_activation"
  /**
   * 登録済み拠点の編集・削除(指示B-03)。subjectIdは拠点ID。
   *
   * この2種は現在値を持たない=`projectInteractionState`にcaseがない。`site` は
   * 追記のみの例外として更新・削除ができるテーブルであり、拠点の現在値はその行そのものだから、
   * イベント側で畳み込み直す対象がない。それでも追記するのは、**誰がいつ何を変えたか**を
   * 記録に残すため(payload.logMessage が /ledger の変更履歴に出る)。
   */
  | "site_update"
  | "site_removal";

export interface InteractionEvent {
  id: string;
  createdAt: string;
  actor: string;
  kind: InteractionKind;
  subjectId: string;
  payload: Record<string, unknown>;
}

/**
 * 代表値の選択(M4 §7.4)。core側は methodId と価値概念で受け取るため、
 * recordId だけでなく methodId も保持する。理由は必須。
 */
export interface RepresentativeSelectionState {
  recordId: string;
  methodId: string;
  valueConcept: ValueConcept;
  reason: string;
}

/** 企業提供の財務データ(M5)。PRISMは検証しない(M5 D-1・M6 D-4)。 */
export interface CompanyFinancialsInput {
  reportedOperatingProfit: number;
  currentlyInternalizedCost: number;
  existingImpairmentThreshold: number;
  netDebt: number;
  ebitda: number;
  interestExpense: number;
}

/**
 * 決定単位の入力(M6 D-4・D-10)。
 * `approvalThresholdValue` が未入力(null)の場合、★判定は `pending` のままになる。
 * **未入力を0や業界標準値で埋めない**(D-15・M6 D-10のC案却下理由)。
 */
export interface DecisionParametersInput {
  baselineNpvValue: number;
  discountRate: number;
  horizon: number;
  approvalThresholdValue: number | null;
}

export interface InteractionState {
  depthOverrides: Map<string, "promote" | "demote">;
  /** 未入力の間はundefined。デモの既定値で埋めない。 */
  companyFinancials?: CompanyFinancialsInput;
  decisionParameters: Map<string, DecisionParametersInput>;
  representativeRecordId: Map<string, string>;
  representativeSelection: Map<string, RepresentativeSelectionState>;
  m4ChangeLog: Map<string, { from: string; to: string; reason: string }>;
  selectedCountermeasureKey: Map<string, CountermeasureType>;
  bindingMechanismState: Map<string, BindingMechanismState>;
  disclosureClaimOverrideText: Map<string, string>;
  /**
   * sourceDocument(subjectId)ごとの最新の抽出結果(GAP-05)。同じ文書を再アップロードした場合、
   * その文書分だけ最新の抽出結果に置き換える(上書き。追記型イベント自体は履歴として残る)。
   */
  extractedDisclosureClaimsBySourceDocument: Map<string, DisclosureClaim[]>;
  intentionalDecisions: Map<string, { reason: string; recordedAt: string }>;
  /** 画面に出す操作ログ。新しい順。別テーブルを持たず、同じイベント列の射影として作る。 */
  actionLog: ActionLogEntry[];
}

export function emptyInteractionState(): InteractionState {
  return {
    depthOverrides: new Map(),
    decisionParameters: new Map(),
    representativeRecordId: new Map(),
    representativeSelection: new Map(),
    m4ChangeLog: new Map(),
    selectedCountermeasureKey: new Map(),
    bindingMechanismState: new Map(),
    disclosureClaimOverrideText: new Map(),
    extractedDisclosureClaimsBySourceDocument: new Map(),
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
        // methodId・valueConcept は 2026-08-09 以降のイベントにのみ含まれる(GAP-09)。
        // 古いイベントには無いため、その場合は選択として扱わない(推定で補完しない)。
        if (typeof event.payload.methodId === "string" && typeof event.payload.valueConcept === "string") {
          state.representativeSelection.set(event.subjectId, {
            recordId: event.payload.recordId as string,
            methodId: event.payload.methodId,
            valueConcept: event.payload.valueConcept as ValueConcept,
            reason: event.payload.reason as string,
          });
        }
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
                newMechanism,
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
      case "disclosure_pdf_extracted": {
        state.extractedDisclosureClaimsBySourceDocument.set(
          event.subjectId,
          event.payload.claims as DisclosureClaim[]
        );
        break;
      }
      case "company_financials": {
        state.companyFinancials = event.payload.financials as CompanyFinancialsInput;
        break;
      }
      case "decision_parameters": {
        state.decisionParameters.set(event.subjectId, event.payload.parameters as DecisionParametersInput);
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
