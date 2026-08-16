import { getTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { buildDisclosureView } from "@core/disclosure/build-disclosure-view";
import { INTERNAL_REVIEW_TEMPLATE } from "@core/disclosure/templates/internal-review-template";
import { Card, GuideBox, GuideButton, KV, ScreenLead, Tag } from "../components/ui";
import { formatDepthReason, gapTypeLabel } from "../components/labels";
import { Num } from "../components/numeric";
import { StepNav } from "../components/step-nav";
import { AcquireEvidenceAction, RecordIntentionalDecisionAction, WeakenClaimAction } from "./actions-ui";
import { PdfIntakeForm } from "./pdf-intake-form";

const EXCLUSION_KIND_LABEL: Record<string, string> = {
  not_assessed: "評価対象に入っていない",
  not_deep_dived: "詳細評価をしていない",
  criteria_unevaluated: "一部の基準を評価できていない",
};

export default async function DisclosurePage() {
  const result = await getOrCreateLatestResult(await getTenantId());
  const claimsById = new Map(result.disclosureClaims.map((claim) => [claim.id, claim]));

  // 出力3層目:自社のレコードから開示文の下書きを組み立てる(GAP-19)
  const { view: disclosureView, unfilledRequirements } = buildDisclosureView(
    `dv-${result.recalculationHash.hash}`,
    INTERNAL_REVIEW_TEMPLATE,
    {
      materialIssues: result.assessment.materialIssues,
      valuationRecords: Object.values(result.valuation.valuationRecordsByMaterialIssue).flat(),
      decisionRecords: result.decisions.map((entry) => entry.decision.decisionRecord),
    },
    new Date().toISOString()
  );

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">開示への反映</h1>
          <GuideButton />
        </div>
        <ScreenLead>開示文言と根拠の整合を確認します</ScreenLead>
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        <GuideBox>
          この画面では、開示文言と根拠の整合を確認します。<b>1.</b>{" "}
          「PDFから主張を抽出する」で開示物を読み込みます(抽出だけをAIが行い、根拠の十分性判定はAIを使いません) →{" "}
          <b>2.</b> 記載ごとのカードで、根拠が充足しているか・どの種別の不足かを確認します → <b>3.</b>{" "}
          不足がある記載では、①記載を弱める・②根拠を追加取得する(詳細評価キューへ追加)・③判断の理由を記録する、の
          3つから対応を選びます → <b>4.</b> 末尾の「開示文の下書き」で、登録済みのレコードから組み立てた文案を確認します。
          記載の真偽は断定せず、根拠の充足状況だけを示します。材料が足りない項目を文章で埋めることはしません。
        </GuideBox>
      </div>

      <Card
        title="PDFから主張を抽出する"
        subtitle="M7段階1・2:AIによる抽出のみ。根拠の十分性判定はAIを使わない既存の処理が行う"
      >
        <PdfIntakeForm />
      </Card>

      {result.disclosure.gapFindings.map((finding) => {
        const claim = claimsById.get(finding.claimId);
        const siteId = result.disclosureClaimSiteId[finding.claimId];
        return (
          <Card
            key={finding.id}
            title={claim?.rawText}
            subtitle={claim ? `${claim.sourceDocument} ${claim.sourcePageOrSection}` : undefined}
            headExtra={
              <>
                {finding.gapType ? <Tag variant="warn">{gapTypeLabel(finding.gapType)}</Tag> : <Tag variant="ok">根拠充足</Tag>}
                {claim?.extractionConfidence === "low" && <Tag variant="warn">AI抽出確信度低・要レビュー</Tag>}
              </>
            }
          >
            {/*
              照合用のGapFinding IDは本文から外した(指示06)。監査で辿る必要がある場合は
              記録(監査証跡)画面から参照できれば足りる。
            */}
            <div style={{ marginBottom: finding.recommendedActions.length > 0 ? 14 : 0 }}>
              <KV k="一致した根拠の件数" v={<Num value={finding.evidenceMatch.matchedRecordIds.length} unit="件" />} />
            </div>

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
                        {/*
                          B-04(点検分):この理由文はM2のDepthDecision.exclusionReasonをそのまま
                          運んでいる経路があり(lib/demo/run-demo-pipeline.ts)、内部変数名や
                          廃止済み用語が漏れうるため、assessment/page.tsxと同じ整形関数を通す。
                        */}
                        <td style={{ fontSize: 12 }}>{formatDepthReason(exclusion.reason)}</td>
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

      {/*
        構想書8.1の出力3層目(DisclosureView)。自社のレコードから開示文の下書きを組み立てる。
        検証(上のギャップ検出)とは逆向きの機能で、PDFもAIも使わない。
        基準への項目マッピングは未確定のため、SSBJ準拠とは称さない(GAP-19)。
      */}
      <Card
        title="開示文の下書き"
        subtitle="登録済みのレコードから組み立て"
        headExtra={<Tag variant="neutral">基準へのマッピング前</Tag>}
        foot="固定の文章テンプレートに数値を機械的に埋め込んでいます。AIによる文章生成は行っていません"
      >
        {disclosureView.generatedText ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              lineHeight: 1.9,
              margin: 0,
            }}
          >
            {disclosureView.generatedText}
          </pre>
        ) : (
          <p style={{ color: "var(--ink-faint)" }}>下書きを組み立てる材料がまだありません。</p>
        )}

        {unfilledRequirements.length > 0 && (
          <>
            <hr className="rule" />
            <div className="section-label">材料が足りず記載できていない項目</div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {unfilledRequirements.map((requirement) => (
                <li key={requirement} style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                  {requirement}
                </li>
              ))}
            </ul>
            <p className="tooltip-note">空欄を文章で埋めることはしません。材料が揃った時点で自動的に記載されます。</p>
          </>
        )}

        <p className="tooltip-note" style={{ marginTop: 10 }}>
          SSBJ等の基準のどの開示項目に何を載せるかは未確定です(基準本文の取得待ち)。この下書きは社内確認用です。
        </p>
      </Card>

      <StepNav current="/disclosure" result={result} />
    </div>
  );
}
