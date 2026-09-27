import type { Metadata } from "next";
import Link from "next/link";
import { buildDisclosureView } from "@core/disclosure/build-disclosure-view";
import { INTERNAL_REVIEW_TEMPLATE } from "@core/disclosure/templates/internal-review-template";
import { physicalDisclosureBundle } from "@/lib/environment/review";
import { hasRepresentativeSelection } from "@/lib/pipeline/valuation-insights";
import { loadPipelineView } from "@/lib/views/pipeline";
import { Card, ScreenLead, Tag } from "../../components/ui";
import { SectionNav } from "../../components/section-nav";
import { TextExport } from "../../components/text-export";

export const metadata: Metadata = {
  title: "開示文下書き | PRISM",
};

export default async function DisclosureDraftPage() {
  const result = await loadPipelineView();
  const siteNames = new Map(result.assessment.sites.map((site) => [site.id, site.name]));
  const { view, unfilledRequirements } = buildDisclosureView(
    `dv-${result.recalculationHash.hash}`,
    INTERNAL_REVIEW_TEMPLATE,
    {
      materialIssues: result.assessment.materialIssues,
      valuationRecords: Object.values(result.valuation.valuationRecordsByMaterialIssue).flat(),
      decisionRecords: result.decisions.map((entry) => entry.decision.decisionRecord),
      confirmedBindingDecisionIds: result.decisions.filter((entry) => entry.bindingConfirmed).map((entry) => entry.decision.decisionRecord.id),
      selectedValuationRecordIds: Object.entries(result.valuation.representativeRecordByMaterialIssue)
        .filter(([issueId]) => hasRepresentativeSelection(result, issueId))
        .map(([, recordId]) => recordId),
      siteNames: Object.fromEntries(siteNames),
    },
    new Date().toISOString()
  );

  const physical = physicalDisclosureBundle(result.environmentalTargets, siteNames, result.disclosureClaims);
  // コピー・保存用。後から照合できるよう、作成日時・テンプレート版・計算識別子・未記入項目を添える。
  const exportText = [
    "PRISM 開示文の下書き（社内確認用・基準へのマッピング前）",
    `作成日時: ${view.generatedAt}`,
    `テンプレート: ${INTERNAL_REVIEW_TEMPLATE.version}`,
    `計算識別子: ${result.recalculationHash.hash}`,
    ...(unfilledRequirements.length > 0 ? [`未記入: ${unfilledRequirements.join("、")}`] : []),
    "",
    view.generatedText,
    "",
    "確認済みの物理指標",
    physical.text || "確認済みの文案はありません。",
    `未確認・再確認待ち: ${physical.pending.length}件`,
    "",
    "公開前に対象範囲・原データ・利用条件・適用する開示基準との対応を確認してください。",
  ].join("\n");

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">開示文の下書き</h1>
        </div>
        <ScreenLead>評価結果を社内確認用の文案にまとめ、コピーまたはテキストで保存できます。公開前に内容と開示基準との対応を確認してください。</ScreenLead>
      </div>

      <SectionNav
        label="開示内の画面"
        items={[
          { href: "/disclosure", label: "指摘", description: "根拠との不一致に対応", active: false },
          { href: "/disclosure/intake", label: "PDF取込", description: "開示文から主張を抽出", active: false },
          { href: "/disclosure/draft", label: "下書き", description: "登録済みレコードから作成", active: true },
        ]}
      />

      {unfilledRequirements.length > 0 && (
        <Card title="下書きに不足している項目" headExtra={<Tag variant="warn">{unfilledRequirements.length}件</Tag>}>
          <ul className="task-list" style={{ margin: 0 }}>
            {unfilledRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
          </ul>
          <p className="field-hint">財務影響の試算が未記入の場合は、各対象の交換価値の代表値を選択してください。別手法の金額を自動で合算することはありません。</p>
          <p className="page-back"><Link href="/valuation">算定結果と代表値を確認する →</Link></p>
        </Card>
      )}

      <Card title="資源・生態系などの物理指標">
        <p>根拠との対応を確認済みの文案 {physical.count}件 / 未確認・再確認待ち {physical.pending.length}件</p>
        <p className="field-hint">目標達成状況の記述です。適用する開示基準やPDFの記載との整合確認は別途必要です。入力変更後の文案は再確認まで出力しません。</p>
        {physical.text && <pre className="draft-text">{physical.text}</pre>}
        {physical.pending.length > 0 && (
          <details className="foldout">
            <summary>確認が必要な指標</summary>
            <ul>{physical.pending.map((label, index) => <li key={index}>{label}</li>)}</ul>
          </details>
        )}
        <p><Link href="/portfolio">指標の文案と根拠を確認する →</Link></p>
      </Card>
      <Card
        title="下書き"
        headExtra={<Tag variant="neutral">基準へのマッピング前</Tag>}
        foot="金額の評価は固定の文章テンプレートに数値を埋め込み、物理指標は利用者が確認した文案を出力します。AIによる文章生成は行っていません"
      >
        <TextExport text={exportText} filename="prism-disclosure-draft.txt" />
        <pre className="draft-text">{view.generatedText || "下書きに使えるレコードがまだありません。"}</pre>
      </Card>
    </div>
  );
}
