import { getDefaultTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { Card, Guide, Tag } from "../components/ui";
import { AcquireEvidenceAction, RecordIntentionalDecisionAction, WeakenClaimAction } from "./actions-ui";

const GAP_LABEL: Record<string, string> = {
  G1_no_evidence: "根拠なし",
  G2_weak_evidence: "根拠がやや弱い",
  G3_scope_mismatch: "対象範囲が一致しない",
  G4_period_mismatch: "対象期間が一致しない",
  G6_selective_disclosure: "触れていない対象がある",
};

const EXCLUSION_KIND_LABEL: Record<string, string> = {
  not_assessed: "評価対象に入っていない",
  not_deep_dived: "詳細評価をしていない",
  criteria_unevaluated: "一部の基準を評価できていない",
};

export default async function DisclosurePage() {
  const result = await getOrCreateLatestResult(getDefaultTenantId());
  const claimsById = new Map(result.disclosureClaims.map((claim) => [claim.id, claim]));

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">開示内容の確認</h1>
          <Guide>
            登録済みの開示claimから記載内容と根拠の整合を確認します。真偽の断定は行わず、根拠の充足状況のみを示します。
            根拠が不足している場合、①記載を弱める・②根拠を追加取得する(詳細評価キューへ追加)・③判断の理由を記録する、の3つの対応から選べます。
          </Guide>
        </div>
      </div>

      {result.disclosure.gapFindings.map((finding) => {
        const claim = claimsById.get(finding.claimId);
        const siteId = result.disclosureClaimSiteId[finding.claimId];
        return (
          <Card
            key={finding.id}
            title={claim?.rawText}
            subtitle={claim ? `${claim.sourceDocument} ${claim.sourcePageOrSection}` : undefined}
            headExtra={
              finding.gapType ? <Tag variant="warn">{GAP_LABEL[finding.gapType] ?? finding.gapType}</Tag> : <Tag variant="ok">根拠充足</Tag>
            }
          >
            <table className="data-table" style={{ marginBottom: finding.recommendedActions.length > 0 ? 14 : 0 }}>
              <thead>
                <tr>
                  <th>GapFinding ID</th>
                  <th>一致した根拠件数</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="num">{finding.id}</td>
                  <td className="num">{finding.evidenceMatch.matchedRecordIds.length}</td>
                </tr>
              </tbody>
            </table>

            {/*
              G6:開示が触れている範囲に含まれるのに評価していない対象。
              「開示文が言及しているか」までは判定しない(自然言語理解が必要になり、
              段階3・4にLLMを使わない制約に反するため)。事実の提示にとどめる。
            */}
            {finding.undisclosedExclusions && finding.undisclosedExclusions.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div className="section-label">この記載の範囲に含まれるが、評価していない対象</div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>対象</th>
                      <th>状態</th>
                      <th>理由</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finding.undisclosedExclusions.map((exclusion) => (
                      <tr key={`${exclusion.siteId}-${exclusion.kind}`}>
                        <td>{exclusion.scope}</td>
                        <td>{EXCLUSION_KIND_LABEL[exclusion.kind] ?? exclusion.kind}</td>
                        <td style={{ fontSize: 12 }}>{exclusion.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="tooltip-note">
                  記載内容がこれらに触れているかどうかは判定していません。触れる必要があるかは利用者の判断です。
                  触れないと判断した場合は「判断の理由を記録する」を選んでください。
                </p>
              </div>
            )}

            {finding.recommendedActions.length > 0 && claim && (
              <div className="grid-3">
                <WeakenClaimAction claimId={claim.id} currentText={claim.rawText} />
                {siteId && <AcquireEvidenceAction siteId={siteId} />}
                <RecordIntentionalDecisionAction claimId={claim.id} />
              </div>
            )}
          </Card>
        );
      })}

      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
