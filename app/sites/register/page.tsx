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
        subtitle="CSV一括登録と直接入力を切り替えられます"
        foot="登録後は拠点一覧で座標解決の状態を確認してください"
      >
        <RegisterTabs />
      </Card>

      <Card title="CSVフォーマット" subtitle="ダウンロードした記入例は、日本語の列名のまま取り込めます" padBody={false}>
        <table className="data-table csv-format-table">
          <thead>
            <tr>
              <th>ファイル</th>
              <th>列名</th>
              <th>選択値</th>
              <th>記入例</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>拠点一覧</b><span className="id-note">sites.csv</span></td>
              <td>拠点ID、拠点名、拠点区分、業種、緯度、経度、住所</td>
              <td>own_site（自社拠点） / supplier_site（サプライヤー拠点）</td>
              <td><a href="/api/intake-template?name=sites" download="sites.csv" className="pill-btn pill-btn--sm">ダウンロード</a></td>
            </tr>
            <tr>
              <td><b>自然との接点</b><span className="id-note">nature-interfaces.csv</span></td>
              <td>拠点ID、レイヤー種別、データソース、照会結果、利用条件</td>
              <td>照会結果: true / false / 数値</td>
              <td><a href="/api/intake-template?name=nature-interfaces" download="nature-interfaces.csv" className="pill-btn pill-btn--sm">ダウンロード</a></td>
            </tr>
          </tbody>
        </table>
      </Card>

      <p className="page-back">
        <Link href="/sites">← 拠点一覧へ戻る</Link>
      </p>
      <StepNav current="/sites" result={result} />
    </div>
  );
}
