import Link from "next/link";
import { getDefaultTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { Card, Stat, Tag } from "./components/ui";
import { Num } from "./components/numeric";

export default async function Home() {
  const result = await getOrCreateLatestResult(getDefaultTenantId());

  const promoted = result.assessment.depthDecisions.filter((d) => d.depth === "deep_dive").length;
  const gapsFound = result.disclosure.gapFindings.filter((f) => f.gapType !== null).length;

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">{result.companyName}</h1>
        </div>
        <p style={{ marginTop: 6, fontSize: 12.5, color: "var(--ink-faint)" }}>
          ダミーデータによるM1〜M8の通し確認(実在の企業・実データではありません)。左のナビゲーションから各モジュールへ。
        </p>
      </div>

      <div className="grid-3">
        <Card>
          <Stat label="登録拠点数" value={result.assessment.sites.length} />
        </Card>
        <Card>
          <Stat label="深掘り昇格件数" value={promoted} unit="件" />
        </Card>
        <Card>
          <Stat label="開示ギャップ検出件数" value={gapsFound} unit="件" />
        </Card>
      </div>

      <Card title="意思決定(M6)" subtitle="対策案の選択・反映先の記録">
        {result.decisions.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>拠点</th>
                <th>判定</th>
                <th>選択中の対策案</th>
              </tr>
            </thead>
            <tbody>
              {result.decisions.map(({ siteId, siteName, decision, selectedCountermeasureKey }) => (
                <tr key={siteId}>
                  <td>
                    <b>{siteName}</b>
                  </td>
                  <td>
                    <Tag variant={decision.decisionRecord.verdict === "crosses" ? "warn" : "ok"}>
                      {decision.decisionRecord.verdict}
                    </Tag>
                  </td>
                  <td>{selectedCountermeasureKey}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--ink-faint)" }}>対象となる交換価値ValuationRecordがありません。</p>
        )}
      </Card>

      <Card
        title="記録・版管理(M8)"
        foot={
          <span>
            詳細は<Link href="/ledger">変更履歴</Link>を参照
          </span>
        }
      >
        <p>
          AssumptionEntry <Num value={result.assumptionEntries.length} />件、変更履歴 <Num value={result.actionLog.length} />件を記録済み。
        </p>
      </Card>

      <p className="footer-note">
        PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。
      </p>
    </div>
  );
}
