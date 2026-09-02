import type { Metadata } from "next";
import { buildDisclosureView } from "@core/disclosure/build-disclosure-view";
import { INTERNAL_REVIEW_TEMPLATE } from "@core/disclosure/templates/internal-review-template";
import { loadPipelineView } from "@/lib/views/pipeline";
import { Card, ScreenLead, Tag } from "../../components/ui";
import Link from "next/link";

export const metadata: Metadata = {
  title: "開示文下書き | PRISM",
};

export default async function DisclosureDraftPage() {
  const result = await loadPipelineView();
  const { view, unfilledRequirements } = buildDisclosureView(
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
          <h1 className="screen__title">開示文の下書き</h1>
        </div>
        <ScreenLead>登録済みレコードから組み立てた文案だけを確認します</ScreenLead>
      </div>

      {unfilledRequirements.length > 0 && (
        <Card title="下書きに不足している項目" headExtra={<Tag variant="warn">{unfilledRequirements.length}件</Tag>}>
          <ul className="task-list" style={{ margin: 0 }}>
            {unfilledRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
          </ul>
          <p className="page-back"><Link href="/disclosure">指摘の一覧で根拠を確認する →</Link></p>
        </Card>
      )}

      <Card title="下書き" headExtra={<Tag variant="neutral">基準へのマッピング前</Tag>}>
        <pre className="draft-text">{view.generatedText || "下書きに使えるレコードがまだありません。"}</pre>
      </Card>
    </div>
  );
}
