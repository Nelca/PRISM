import { getDefaultTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { Card, Guide } from "../components/ui";
import { ImportForm } from "./import-form";

export default async function IntakePage() {
  const result = await getOrCreateLatestResult(getDefaultTenantId());
  const { sites, ingestionErrors } = result.assessment;

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">データの取込</h1>
          <Guide>
            3つのファイルをまとめて検証します。由来の異なるデータ(顧客提供・PRISM運用チームの調査・
            顧客財務部門)を1つのファイルに混ぜないため、ファイルを分けています。
            記入方法は <code>docs/data-intake-guide.md</code> を参照してください。
          </Guide>
        </div>
      </div>

      <div className="grid-2">
        <Card title="ファイルの取込" subtitle="3ファイルすべてが必要です">
          <ImportForm />
        </Card>

        <div>
          <Card title="現在の取込状況" subtitle={`登録拠点 ${sites.length}件`}>
            {sites.length === 0 ? (
              <p style={{ color: "var(--ink-faint)" }}>まだ拠点が登録されていません。</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {sites.map((site) => (
                  <li key={site.id} style={{ fontSize: 12.5 }}>
                    {site.name}({site.id})
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/*
            build-plan §6「データ取込のエラーハンドリング:実データは汚れている前提。
            どこで落ちたかが分かること」。M1が返すingestionErrorsは従来どこにも
            表示されていなかった(GAP-02)。
          */}
          <Card title="取込時に除外された行" subtitle={`${ingestionErrors.length}件`}>
            {ingestionErrors.length === 0 ? (
              <p style={{ color: "var(--ink-faint)" }}>除外された行はありません。</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {ingestionErrors.map((error) => (
                  <li key={error.rowId} style={{ fontSize: 12.5 }}>
                    <b>{error.rowId}</b>: {error.reason}
                  </li>
                ))}
              </ul>
            )}
            <p className="tooltip-note">
              座標も住所もない拠点は評価に進めません。除外した事実と理由は記録され、監査時に説明できます。
            </p>
          </Card>
        </div>
      </div>

      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
