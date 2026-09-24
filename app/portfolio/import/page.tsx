import Link from "next/link";
import { loadPipelineView } from "@/lib/views/pipeline";
import { METRICS, TARGET_CATEGORIES } from "@/lib/environment/metrics";
import { Card, ScreenLead } from "../../components/ui";
import { ImportForm } from "./import-form";
export const metadata = { title: "環境指標を一括取込 | PRISM" };
export default async function ImportPage() {
  const result = await loadPipelineView();
  return <div className="screen">
    <div className="screen__head"><h1 className="screen__title">環境指標を一括取込</h1><ScreenLead>複数拠点・指標の実測値、目標、根拠、担当・期限をまとめて登録・更新します。保存前に判定結果を確認できます。</ScreenLead><p><Link href="/portfolio">← 統合管理へ</Link></p></div>
    <Card title="CSVを準備する">
      <p>新規登録は空のテンプレートを使い、管理IDと版を空欄にします。更新は編集用CSVの管理ID・版を残して、値を変更してください。拠点・指標・対象年・測定範囲の変更は新規登録として扱います。</p>
      <div className="portfolio-list-head"><a download="prism-targets-template.csv" className="pill-btn" href="/portfolio/export?mode=template">空のテンプレートを保存</a><a download="prism-targets-editable.csv" className="pill-btn" href="/portfolio/export">有効な指標の編集用CSVを保存</a></div>
      <p className="field-hint">1回200件まで。値の空欄は未入力に戻します。保管中の指標は個別画面で復帰してください。通常の一覧共有用CSVとは列が異なります。</p>
      <details className="foldout"><summary>拠点IDと使用できる指標・単位</summary>
        <table className="data-table"><thead><tr><th>拠点</th><th>拠点ID</th></tr></thead><tbody>{result.assessment.sites.map((site) => <tr key={site.id}><td>{site.name}</td><td>{site.id}</td></tr>)}</tbody></table>
        <table className="data-table"><thead><tr><th>種類</th><th>指標（CSVに記入する名前）</th><th>単位</th></tr></thead><tbody>{METRICS.map((metric) => <tr key={metric.id}><td>{TARGET_CATEGORIES[metric.category]}</td><td>{metric.label}</td><td>{metric.unit}</td></tr>)}</tbody></table>
        <p>達成条件は「以下」または「以上」。日付はYYYY-MM-DD、対象年は整数で入力してください。</p>
      </details>
    </Card>
    <Card title="CSVを読み込み、内容を確認する"><ImportForm /></Card>
  </div>;
}
