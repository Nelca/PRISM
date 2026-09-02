import type { Metadata } from "next";
import Link from "next/link";
import { loadSitesView } from "@/lib/views/pipeline";
import { Card, ScreenLead } from "../../../components/ui";
import { StepNav } from "../../../components/step-nav";
import { CategoryCsvForm } from "../../category-input-import-forms";

export const metadata: Metadata = {
  title: "土地利用取込 | PRISM",
};

export default async function LandUseImportPage() {
  const { result } = await loadSitesView();

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">土地利用データを取り込む</h1>
        </div>
        <ScreenLead>土地利用・改変CSVを取り込み、LIME3単独パイロットの算定に接続します</ScreenLead>
      </div>

      <Card title="土地利用・改変CSVの取込" subtitle="必要な列をテンプレートで確認してからアップロードしてください">
        <CategoryCsvForm category="land-use" />
      </Card>

      <p className="page-back">
        <Link href="/sites">拠点一覧へ戻る</Link>
      </p>
      <StepNav current="/sites" result={result} />
    </div>
  );
}
