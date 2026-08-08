import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";
import { Card, Guide, Tag } from "../components/ui";
import { AcquireEvidenceAction, RecordIntentionalDecisionAction, WeakenClaimAction } from "./actions-ui";

const GAP_LABEL: Record<string, string> = {
  G1_no_evidence: "根拠なし",
  G2_weak_evidence: "根拠がやや弱い",
  G3_scope_mismatch: "対象範囲が一致しない",
  G4_period_mismatch: "対象期間が一致しない",
};

export default function DisclosurePage() {
  const result = runDemoPipeline();
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
