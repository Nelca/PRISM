import Link from "next/link";
import { Card, Tag } from "../components/ui";

export function DeferredDecisions({ sites }: { sites: { siteId: string; siteName: string }[] }) {
  if (sites.length === 0) return null;
  return (
    <Card id="deferred-decisions" title="投資の前提を追加する" headExtra={<Tag variant="neutral">後から入力できます</Tag>}>
      <p>次の拠点は、NPV・初期投資額・年間継続費用のいずれかが未入力です。価値算定は利用できます。財務・経営企画部門と確認できたら、拠点の「編集」から前提を追加してください。</p>
      <ul className="task-list">
        {sites.map((site) => <li key={site.siteId}><Link href={`/sites#site-${encodeURIComponent(site.siteId)}`}>{site.siteName}の登録内容を編集する →</Link></li>)}
      </ul>
      <p className="field-hint">NPV・ROIはまだ算出せず、この拠点の判定件数にも計上しません。</p>
    </Card>
  );
}
