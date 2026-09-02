import type { Metadata } from "next";
import Link from "next/link";
import { loadSitesView } from "@/lib/views/pipeline";
import { Card, ScreenLead } from "../../../components/ui";
import { StepNav } from "../../../components/step-nav";
import { PrtrImportForm } from "../../prtr-import-form";

export const metadata: Metadata = {
  title: "PRTR取込 | PRISM",
};

export default async function PrtrImportPage() {
  const { result } = await loadSitesView();

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">PRTR排出量を取り込む</h1>
        </div>
        <ScreenLead>汚染物質算定に使う対象施設行と拠点対応表を取り込みます</ScreenLead>
      </div>

      <Card
        title="PRTR取込"
        subtitle="4ファイルを同時に指定します"
        foot="指定されていない全国事業所は取り込みません"
      >
        <PrtrImportForm />
      </Card>

      <p className="page-back">
        <Link href="/sites">拠点一覧へ戻る</Link>
      </p>
      <StepNav current="/sites" result={result} />
    </div>
  );
}
