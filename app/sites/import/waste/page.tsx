import type { Metadata } from "next";
import Link from "next/link";
import { loadSitesView } from "@/lib/views/pipeline";
import { Card, ScreenLead } from "../../../components/ui";
import { StepNav } from "../../../components/step-nav";
import { CategoryCsvForm } from "../../category-input-import-forms";

export const metadata: Metadata = {
  title: "廃棄物取込 | PRISM",
};

export default async function WasteImportPage() {
  const { result } = await loadSitesView();

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">廃棄物データを取り込む</h1>
        </div>
        <ScreenLead>廃棄物カテゴリのCSVを取り込み、追加カテゴリの算定に接続します</ScreenLead>
      </div>

      <Card title="廃棄物CSVの取込" subtitle="必要な列をテンプレートで確認してからアップロードしてください">
        <CategoryCsvForm category="waste" />
      </Card>

      <p className="page-back">
        <Link href="/sites">拠点一覧へ戻る</Link>
      </p>
      <StepNav current="/sites" result={result} />
    </div>
  );
}
