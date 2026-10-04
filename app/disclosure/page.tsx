import Link from "next/link";
import type { Metadata } from "next";
import { METRIC_BY_ID } from "@/lib/environment/metrics";
import { disclosureNoteCurrent } from "@/lib/environment/review";
import { loadPipelineView } from "@/lib/views/pipeline";
import { Card, GuideBox, GuideButton, KV, ScreenLead } from "../components/ui";
import { categoryLabel, formatDepthReason, gapTypeLabel, materialIssueLabel } from "../components/labels";
import { Num } from "../components/numeric";
import { StepNav } from "../components/step-nav";
import { SectionNav } from "../components/section-nav";
import { AcquireEvidenceAction, RecordIntentionalDecisionAction, WeakenClaimAction } from "./actions-ui";
import { TaskBanner } from "../components/task-banner";
import { inputSourceLabel } from "../valuation/category-expansion";
import { EmptyState, FeatureCard, FeatureGrid, ProgressRing, StatGrid, StatTile, StatusBadge } from "../components/viz";
import { ACTION_ICON, STAGE_ICON } from "../components/icons";

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

  // 対応が必要な指摘(gapType!==null)のうち、理由記録済みの件数(ProgressRing用)。
  const actionableFindings = findings.filter((f) => f.gapType !== null);
  const handledCount = actionableFindings.filter((f) => handledFindingIds.has(f.id)).length;

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">{detailOnly ? "開示の指摘に対応する" : "開示への反映"}</h1>
          {!detailOnly && <GuideButton />}
        </div>
        <ScreenLead>{detailOnly ? "選択した記載の根拠を確認し、対応を記録します" : "算定結果から開示の下書きを作成します。既存の開示PDFを取り込むと、記載と根拠の整合も確認できます。"}</ScreenLead>
        {detailOnly && <p className="page-back"><Link href="/disclosure">← 指摘の一覧へ戻る</Link></p>}
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        {!detailOnly && <GuideBox>
          PDFを取り込み、根拠不足の記載を確認します。不足があれば記載修正、根拠取得、理由記録のいずれかで対応します。
        </GuideBox>}
      </div>

      {detailOnly ? (
        <SectionNav
          label="開示内の画面"
          items={[
            { href: "/disclosure", label: "指摘", description: "根拠との不一致に対応", active: true },
            { href: "/disclosure/intake", label: "PDF取込", description: "開示文から主張を抽出", active: false },
            { href: "/disclosure/draft", label: "下書き", description: "登録済みレコードから作成", active: false },
          ]}
        />
      ) : (
        <FeatureGrid>
          <FeatureCard icon={STAGE_ICON.disclosure} title="指摘" href="/disclosure" linkLabel="開く">
            根拠との不一致に対応します
          </FeatureCard>
          <FeatureCard icon={ACTION_ICON.upload} title="PDF取込" href="/disclosure/intake" linkLabel="開く">
            開示文から主張を抽出します
          </FeatureCard>
          <FeatureCard icon={ACTION_ICON.inbox} title="下書き" href="/disclosure/draft" linkLabel="開く">
            登録済みレコードから作成します
          </FeatureCard>
        </FeatureGrid>
      )}

      {!detailOnly && <>

      {/* D-11-1:残タスクの頭出しバナー(全6画面共通。残タスクがある時だけ出る)。 */}
      <TaskBanner current="/disclosure" result={result} />

      {actionableFindings.length > 0 && (
        <StatGrid columns={1}>
          <StatTile
            label="根拠確認の進捗"
            value={`${handledCount}/${actionableFindings.length}`}
            unit="件"
            tone={handledCount === actionableFindings.length ? "ok" : "warn"}
            note="対応が必要な指摘のうち、理由記録済みの件数"
            visual={<ProgressRing value={handledCount} total={actionableFindings.length} label="根拠確認の進捗" tone={handledCount === actionableFindings.length ? "ok" : "accent"} showText={false} />}
          />
        </StatGrid>
      )}

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
          subtitle="行の「詳細」から根拠確認と対応操作へ進みます"
          padBody={false}
          foot="記載の真偽は断定せず、根拠の充足状況だけを示します"
        >
          <table className="data-table data-table--linked">
            <thead>
              <tr>
                <th>記載</th>
                <th style={{ minWidth: 110 }}>種別</th>
                <th style={{ minWidth: 90 }}>一致した根拠</th>
                <th style={{ minWidth: 110 }}>対応状況</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => {
                const claim = claimsById.get(finding.claimId);
                return (
                  <tr key={finding.id}>
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
                        <StatusBadge variant="warn">{gapTypeLabel(finding.gapType)}</StatusBadge>
                      ) : (
                        <StatusBadge variant="ok">根拠充足</StatusBadge>
                      )}
                      {claim?.extractionConfidence === "low" && (
                        <span className="id-note">主張の分類・抽出内容を要確認</span>
                      )}
                    </td>
                    <td className="num">{finding.evidenceMatch.matchedRecordIds.length}件</td>
                    <td>
                      {finding.gapType === null ? (
                        "—"
                      ) : handledFindingIds.has(finding.id) ? (
                        <StatusBadge variant="ok">理由記録済み</StatusBadge>
                      ) : (
                        <StatusBadge variant="warn">未対応</StatusBadge>
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

      {findings.length === 0 && (
        <EmptyState icon={STAGE_ICON.disclosure} title="指摘はまだありません">
          開示PDFを取り込むか、算定結果が揃うと根拠との不一致が自動で検出されます。
        </EmptyState>
      )}
      </>}

      {/* 詳細は選択した1件だけを描画する(指摘が100件でもDOMは1件分)。 */}
      {detailOnly && [selectedFinding].filter((finding) => finding !== undefined).map((finding) => {
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
            subtitle={claim ? `${claim.sourceDocument} ${claim.sourcePageOrSection}` : undefined}
            headExtra={
              <>
                {finding.gapType ? <StatusBadge variant="warn">{gapTypeLabel(finding.gapType)}</StatusBadge> : <StatusBadge variant="ok">根拠充足</StatusBadge>}
                {claim?.extractionConfidence === "low" && <StatusBadge variant="warn">主張の分類・抽出内容を要確認</StatusBadge>}
              </>
            }
          >
            {/* 統合管理で、この主張との対応を人が確認した物理指標(自動指摘の解消とは別に示す)。 */}
            {result.environmentalTargets
              .filter((target) => !target.archived && target.disclosureNote?.linkedClaim?.id === finding.claimId)
              .map((target) => (
                <p key={target.id}>
                  確認記録のある物理指標:{" "}
                  <Link href={`/portfolio/${encodeURIComponent(target.id)}`}>
                    {METRIC_BY_ID.get(target.metricId)?.label} · {target.reportingYear}年 · {target.boundary}
                  </Link>
                  {" — "}
                  {disclosureNoteCurrent(target, siteNameById.get(target.siteId), result.disclosureClaims)
                    ? "対応の確認済み（自動指摘の解消とは別）"
                    : "再確認が必要"}
                </p>
              ))}
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

      {!detailOnly && <StepNav current="/disclosure" result={result} />}
    </div>
  );
}
