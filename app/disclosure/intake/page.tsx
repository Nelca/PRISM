import type { Metadata } from "next";
import { Card, ScreenLead } from "../../components/ui";
import { SectionNav } from "../../components/section-nav";
import { PdfIntakeForm } from "../pdf-intake-form";

export const metadata: Metadata = {
  title: "開示PDF取込 | PRISM",
};

export default async function DisclosureIntakePage() {
  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">開示PDFから主張を抽出する</h1>
        </div>
        <ScreenLead>PDF取込だけを独立して実行します</ScreenLead>
      </div>

      <SectionNav
        label="開示内の画面"
        items={[
          { href: "/disclosure", label: "指摘", description: "根拠との不一致に対応", active: false },
          { href: "/disclosure/intake", label: "PDF取込", description: "開示文から主張を抽出", active: true },
          { href: "/disclosure/draft", label: "下書き", description: "登録済みレコードから作成", active: false },
        ]}
      />

      <Card title="PDFから主張を抽出する">
        <PdfIntakeForm />
      </Card>
    </div>
  );
}
