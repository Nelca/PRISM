import type { Metadata } from "next";
import Link from "next/link";
import { loadPipelineView } from "@/lib/views/pipeline";
import { Card, ScreenLead } from "../../components/ui";
import { StepNav } from "../../components/step-nav";
import { PdfIntakeForm } from "../pdf-intake-form";

export const metadata: Metadata = {
  title: "開示PDF取込 | PRISM",
};

export default async function DisclosureIntakePage() {
  const result = await loadPipelineView();

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">開示PDFから主張を抽出する</h1>
        </div>
        <ScreenLead>PDF取込だけを独立して実行します</ScreenLead>
      </div>

      <Card title="PDFから主張を抽出する">
        <PdfIntakeForm />
      </Card>

      <p className="page-back">
        <Link href="/disclosure">指摘の一覧へ戻る</Link>
      </p>
      <StepNav current="/disclosure" result={result} />
    </div>
  );
}
