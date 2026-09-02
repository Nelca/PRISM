import type { Metadata } from "next";
import Link from "next/link";
import { loadSitesView } from "@/lib/views/pipeline";
import { Card, ScreenLead } from "../../components/ui";
import { StepNav } from "../../components/step-nav";
import { RegisterTabs } from "../register-tabs";

export const metadata: Metadata = {
  title: "拠点登録 | PRISM",
};

export default async function SiteRegisterPage() {
  const { result } = await loadSitesView();

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">拠点データを登録する</h1>
        </div>
        <ScreenLead>CSV一括登録または1件追加で、評価に使う拠点を追加します</ScreenLead>
      </div>

      <Card
        title="登録する"
        subtitle="必要なファイルが揃うまで送信できません"
        foot="登録後は拠点一覧で座標解決の状態を確認してください"
      >
        <RegisterTabs />
      </Card>

      <p className="page-back">
        <Link href="/sites">拠点一覧へ戻る</Link>
      </p>
      <StepNav current="/sites" result={result} />
    </div>
  );
}
