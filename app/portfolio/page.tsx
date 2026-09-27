import Link from "next/link";
import type { Metadata } from "next";
import { todayInJst } from "@/lib/datetime";
import { buildPortfolioRows } from "@/lib/environment/portfolio";
import { researchEnabled } from "@/lib/research/access";
import { loadPipelineView } from "@/lib/views/pipeline";
import { ScreenLead } from "../components/ui";
import { PortfolioDashboard } from "./portfolio-dashboard";

export const metadata: Metadata = { title: "環境・資源の統合管理 | PRISM" };

export default async function PortfolioPage() {
  const result = await loadPipelineView();
  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">環境・資源の統合管理</h1>
          <Link href="/portfolio/import" className="pill-btn">CSVで一括取込・更新</Link>
          <Link href="/portfolio/new" className="pill-btn pill-btn--accent">管理する指標を追加</Link>
        </div>
        <ScreenLead>
          拠点ごとに環境評価と資源・生態系の目標をまとめて確認します。未達やデータ不足を絞り込み、担当と期限を決めて次の対応につなげます。
        </ScreenLead>
      </div>
      <div className="portfolio-intro">
        <p>
          生物資源の調達量・認証割合、鉱物資源の投入量・再生材割合、生息地の面積・状態指数を実測値で管理できます。GHGのScope 1・2・3や水・汚染物質・廃棄物・土地利用の目標管理も同じ画面で扱います。
        </p>
        <p className="field-hint">物理指標は入力した目標との比較です。貨幣化・投資承認判定・法令適合判定とは区別して表示します。</p>
      </div>
      {researchEnabled() && (
        <p className="portfolio-detail-actions">
          <Link href="/research" className="pill-btn">公開データ・合成データで検証する</Link>
          <Link href="/research/gvfd" className="pill-btn">GVFDで環境影響を算定する</Link>
        </p>
      )}
      <PortfolioDashboard
        rows={buildPortfolioRows(result, todayInJst())}
        sites={result.assessment.sites.map((site) => ({ id: site.id, name: site.name }))}
      />
    </div>
  );
}
