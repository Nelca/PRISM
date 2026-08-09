/**
 * パイプライン層:M7(開示生成と整合検証)。
 * 参照元: docs/roadmap/build-plan.md §7.1(GATE:M1からM8まで通す)
 *
 * 各DisclosureClaimについてbuildGapFinding()を実行し、M7のgap_finding AssumptionEntryを
 * 実際に生成する。③(意図的判断として記録する)が選択されたgapFindingについては、
 * buildIntentionalDecisionRecord()も実行しintentional_decision AssumptionEntryを追加する。
 *
 * GapFinding型自体はassumptionEntryIdsフィールドを持たない(AssumptionEntry.relatedRecordId
 * 側からGapFinding.idを参照する設計、M8 D-1)。そのためgapFindingsとassumptionEntriesは
 * 並行する配列として返す。
 */

import { buildGapFinding } from "../disclosure/gap-finding";
import { buildIntentionalDecisionRecord } from "../disclosure/intentional-decision";
import type { EvidenceCandidate } from "../disclosure/evidence-match";
import type { ExclusionRecord } from "../disclosure/selective-disclosure";
import { buildAssumptionEntry, deriveM7GapFindingPayload, deriveM7IntentionalDecisionPayload } from "../ledger/assumption-entry";
import type { DisclosureClaim, GapFinding, IntentionalDecisionRecord } from "../types/disclosure";
import type { AssumptionEntry } from "../types/ledger";

export interface IntentionalDecisionInput {
  gapFindingId: string;
  reason: string;
  recordedBy: string;
  recordedAt: string;
}

export interface DisclosurePipelineOptions {
  claims: DisclosureClaim[];
  candidatesForClaim: (claim: DisclosureClaim) => EvidenceCandidate[];
  /**
   * G6(選択的開示)の判定に使う「評価していないもの」の記録。
   * M1のMaterialIssue除外・M2の深掘り除外・評価不能だった基準から呼び出し側が組み立てる。
   * 渡さない場合、G6は判定されない(既存の呼び出しは無変更で動く)。
   */
  exclusions?: ExclusionRecord[];
  /** ③(意図的判断として記録する)を選んだgapFindingについてのみ指定する。 */
  intentionalDecisions?: IntentionalDecisionInput[];
  idSequence: () => string;
  now: string;
}

export interface DisclosurePipelineResult {
  gapFindings: GapFinding[];
  intentionalDecisionRecords: IntentionalDecisionRecord[];
  assumptionEntries: AssumptionEntry[];
}

export function runDisclosurePipeline(options: DisclosurePipelineOptions): DisclosurePipelineResult {
  const assumptionEntries: AssumptionEntry[] = [];
  const gapFindings: GapFinding[] = [];

  for (const claim of options.claims) {
    const finding = buildGapFinding(
      options.idSequence(),
      claim,
      options.candidatesForClaim(claim),
      options.exclusions ?? []
    );
    gapFindings.push(finding);

    const payload = deriveM7GapFindingPayload(finding);
    const entry = buildAssumptionEntry(options.idSequence(), options.now, "M7", finding.id, payload);
    assumptionEntries.push(entry);
  }

  const intentionalDecisionRecords = (options.intentionalDecisions ?? []).map((input) => {
    const record = buildIntentionalDecisionRecord(input.gapFindingId, input.reason, input.recordedBy, input.recordedAt);

    const payload = deriveM7IntentionalDecisionPayload(record);
    const entry = buildAssumptionEntry(options.idSequence(), options.now, "M7", input.gapFindingId, payload);
    assumptionEntries.push(entry);

    return record;
  });

  return { gapFindings, intentionalDecisionRecords, assumptionEntries };
}
