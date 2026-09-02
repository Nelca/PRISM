import Link from "next/link";
import type { Metadata } from "next";
import { loadPipelineView } from "@/lib/views/pipeline";
import { buildDisclosureView } from "@core/disclosure/build-disclosure-view";
import { INTERNAL_REVIEW_TEMPLATE } from "@core/disclosure/templates/internal-review-template";
import { Card, GuideBox, GuideButton, KV, ScreenLead, Tag } from "../components/ui";
import { categoryLabel, formatDepthReason, gapTypeLabel, materialIssueLabel } from "../components/labels";
import { Num } from "../components/numeric";
import { StepNav } from "../components/step-nav";
import { AcquireEvidenceAction, RecordIntentionalDecisionAction, WeakenClaimAction } from "./actions-ui";
import { TaskBanner } from "../components/task-banner";
import { inputSourceLabel } from "../valuation/category-expansion";

export const metadata: Metadata = {
  title: "開示への反映 | PRISM",
};

const EXCLUSION_KIND_LABEL: Record<string, string> = {
  not_assessed: "評価対象に入っていない",
  not_deep_dived: "詳細評価をしていない",
  criteria_unevaluated: "一部の基準を評価できていない",
};

/** サマリーテーブルの「記載」列用。全文はtitle属性で読める。 */
function truncateClaim(text: string | undefined, max = 34): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default async function DisclosurePage({
  searchParams,
  detailOnly = false,
}: {
  searchParams: Promise<{ finding?: string }>;
  detailOnly?: boolean;
}) {
  const { finding: findingParam } = await searchParams;
  const result = await loadPipelineView();
  const claimsById = new Map(result.disclosureClaims.map((claim) => [claim.id, claim]));
  const issueById = new Map(result.assessment.materialIssues.map((issue) => [issue.id, issue]));
  const siteNameById = new Map(result.assessment.sites.map((site) => [site.id, site.name]));
  const coverageSummaries = Object.entries(result.valuation.coverageByMaterialIssue).map(([materialIssueId, coverage]) => ({
    materialIssueId,
    coverage,
    issue: issueById.get(materialIssueId),
  }));

  /**
   * 第6版 D-22:対応状況の判定はホームの進捗(`countProgress`)と同じソースから導く。
   * gapTypeがnull=根拠充足(対応不要)、意図的判断の記録があれば「理由記録済み」。
   */
  const handledFindingIds = new Set(result.disclosure.intentionalDecisionRecords.map((record) => record.gapFindingId));
  const findings = result.disclosure.gapFindings;
  const defaultFindingId = findings.find((f) => f.gapType !== null && !handledFindingIds.has(f.id))?.id ?? findings[0]?.id;
  const selectedFindingId = findings.some((f) => f.id === findingParam) ? findingParam : defaultFindingId;
  const selectedFinding = findings.find((f) => f.id === selectedFindingId);

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
          <h1 className="screen__title">{detailOnly ? "開示の指摘に対応する" : "開示への反映"}</h1>
          {!detailOnly && <GuideButton />}
        </div>
        <ScreenLead>{detailOnly ? "選択した記載の根拠を確認し、対応を記録します" : "開示文言と根拠の整合を確認します"}</ScreenLead>
        {detailOnly && <p className="page-back"><Link href="/disclosure">← 指摘の一覧へ戻る</Link></p>}
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        {!detailOnly && <GuideBox>
          PDFを取り込み、根拠不足の記載を確認します。不足があれば記載修正、根拠取得、理由記録のいずれかで対応します。
        </GuideBox>}
      </div>

      {!detailOnly && <>

      {/* D-11-1:残タスクの頭出しバナー(全6画面共通。残タスクがある時だけ出る)。 */}
      <TaskBanner current="/disclosure" result={result} />

      <Card title="開示作業" subtitle="未対応の指摘を確認し、必要なときだけ取込・下書きへ進みます">
        <div className="action-list">
          <Link href="#gap-findings" className="action-link">
            <b>未対応の指摘を確認する</b>
            <span>根拠不足の記載と、対応操作を先に確認します</span>
          </Link>
          <Link href="/disclosure/intake" className="action-link">
            <b>PDFから主張を抽出する</b>
            <span>AIは抽出だけを行い、根拠の十分性判定は既存ルールで行います</span>
          </Link>
          <Link href="/disclosure/draft" className="action-link">
            <b>開示文の下書きを確認する</b>
            <span>登録済みレコードから機械的に組み立てた文案を確認します</span>
          </Link>
        </div>
      </Card>

      {coverageSummaries.length > 0 && (
        <Card
          title="追加カテゴリの算定範囲と除外"
          subtitle="開示の根拠にできる範囲を明示します"
          padBody={false}
          foot="PRTRデータの取込・LIME3算定は、TNFD、ESRS、SSBJ、ISSB等への完全準拠を単独で示すものではありません。"
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>評価対象</th>
                <th>入力元・期間</th>
                <th>算定済み</th>
                <th>除外・未算定</th>
              </tr>
            </thead>
            <tbody>
              {coverageSummaries.map(({ materialIssueId, coverage, issue }) => {
                const calculated = coverage.quantities
                  .filter((quantity) => quantity.rowCounts.calculated > 0)
                  .map((quantity) => `${new Intl.NumberFormat("ja-JP").format(quantity.calculated)} ${quantity.unit}（${quantity.rowCounts.calculated}行）`);
                const exclusions = coverage.quantities.flatMap((quantity) => [
                  quantity.rowCounts.unmapped > 0 ? `係数未対応 ${quantity.unmapped} ${quantity.unit}（${quantity.rowCounts.unmapped}行）` : null,
                  quantity.rowCounts.transferOnly > 0 ? `移動量 ${quantity.transferOnly} ${quantity.unit}（${quantity.rowCounts.transferOnly}行）` : null,
                  quantity.rowCounts.blocked > 0 ? `算定停止 ${quantity.blocked} ${quantity.unit}（${quantity.rowCounts.blocked}行、未報告量を含む）` : null,
                ]).filter((entry): entry is string => entry !== null);
                return (
                  <tr key={materialIssueId}>
                    <td>
                      <b>{issue ? materialIssueLabel(siteNameById.get(issue.siteId), issue.impactCategory, issue.id) : materialIssueId}</b>
                      {issue && <span className="id-note">{categoryLabel(issue.impactCategory)}</span>}
                    </td>
                    <td>{inputSourceLabel(coverage.sourceKind)} ・ {coverage.reportingPeriod}</td>
                    <td className="num">{calculated.length > 0 ? calculated.join("、") : "0"}</td>
                    <td>{exclusions.length > 0 ? exclusions.join("、") : "なし"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/*
        第6版 D-22:サマリー(一覧)が先、詳細は要求時(第4版D-11と同じ型の適用漏れの解消)。
        以前は1指摘=1フルカードの縦積みで、指摘が多いと全体を見渡せなかった。
        1指摘=1行の一覧で全体を確認し、詳細は選択した1件だけを下に描画する。
      */}
      {findings.length > 0 && (
        <Card
          id="gap-findings"
          title="指摘の一覧"
          subtitle="1記載1行。行の「詳細」から下の詳細と対応操作が開きます"
          padBody={false}
          foot="記載の真偽は断定せず、根拠の充足状況だけを示します"
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>記載</th>
                <th>種別</th>
                <th>一致した根拠</th>
                <th>対応状況</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => {
                const claim = claimsById.get(finding.claimId);
                return (
                  <tr
                    key={finding.id}
                    style={finding.id === selectedFindingId ? { background: "var(--accent-soft)" } : undefined}
                  >
                    <td title={claim?.rawText}>
                      <b>{truncateClaim(claim?.rawText)}</b>
                      {claim && (
                        <span className="id-note">
                          {claim.sourceDocument} {claim.sourcePageOrSection}
                        </span>
                      )}
                    </td>
                    <td>
                      {finding.gapType ? (
                        <Tag variant="warn">{gapTypeLabel(finding.gapType)}</Tag>
                      ) : (
                        <Tag variant="ok">根拠充足</Tag>
                      )}
                      {claim?.extractionConfidence === "low" && (
                        <span className="id-note">AI抽出確信度低・要レビュー</span>
                      )}
                    </td>
                    <td className="num">{finding.evidenceMatch.matchedRecordIds.length}件</td>
                    <td>
                      {finding.gapType === null ? (
                        "—"
                      ) : handledFindingIds.has(finding.id) ? (
                        <Tag variant="ok">理由記録済み</Tag>
                      ) : (
                        <Tag variant="warn">未対応</Tag>
                      )}
                    </td>
                    <td>
                      <Link
                        href={`/disclosure/${encodeURIComponent(finding.id)}`}
                        className="pill-btn pill-btn--sm"
                      >
                        詳細 →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      </>}

      {/* 詳細は選択した1件だけを描画する(指摘が100件でもDOMは1件分)。 */}
      {[selectedFinding].filter((finding) => finding !== undefined).map((finding) => {
        const claim = claimsById.get(finding.claimId);
        const siteId = result.disclosureClaimSiteId[finding.claimId];
        const materialIssueId = siteId
          ? result.assessment.materialIssues.find(
              (issue) => issue.siteId === siteId && issue.impactCategory === claim?.extractedMetadata.category
            )?.id ?? result.decisions.find((decision) => decision.siteId === siteId)?.materialIssueId
          : undefined;
        return (
          <Card
            key={finding.id}
            id="finding-detail"
            title={claim?.rawText}
            subtitle={claim ? `${claim.sourceDocument} ${claim.sourcePageOrSection} ・ 他の記載は上の一覧から開けます` : undefined}
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
                {materialIssueId && <AcquireEvidenceAction materialIssueId={materialIssueId} />}
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
      {!detailOnly && <Card
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
      </Card>}

      <StepNav current="/disclosure" result={result} />
    </div>
  );
}
