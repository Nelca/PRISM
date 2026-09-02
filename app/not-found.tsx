import Link from "next/link";
import { Card } from "./components/ui";

export default function NotFound() {
  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row"><h1 className="screen__title">対象が見つかりません</h1></div>
        <p className="screen__lead">削除されたか、URLが古い可能性があります。別の対象を一覧から選び直してください。</p>
      </div>
      <Card title="一覧へ戻る">
        <div className="detail-actions">
          <Link href="/assessment">評価対象</Link>
          <Link href="/valuation">価値の算定</Link>
          <Link href="/decision">対策と判定</Link>
          <Link href="/disclosure">開示の指摘</Link>
          <Link href="/">ホーム</Link>
        </div>
      </Card>
    </div>
  );
}
