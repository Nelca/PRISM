import { getDefaultTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { Mono } from "../components/numeric";
import { Card } from "../components/ui";

export default async function LedgerPage() {
  const result = await getOrCreateLatestResult(getDefaultTenantId());

  const recordHashes = [
    ...Object.values(result.valuation.valuationRecordsByMaterialIssue)
      .flat()
      .map((record) => ({ id: record.id, kind: "算定(ValuationRecord)", hash: record.recalculationHash })),
    ...result.valuation.divergenceDecompositions.map((decomposition) => ({
      id: decomposition.id,
      kind: "比較(DivergenceDecomposition)",
      hash: decomposition.recalculationHash,
    })),
    ...result.decisions.map((entry) => ({
      id: entry.decision.decisionRecord.id,
      kind: "判定(DecisionRecord)",
      hash: entry.decision.decisionRecord.recalculationHash,
    })),
  ];

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">変更履歴</h1>
        </div>
      </div>

      <Card title="RecalculationHash" subtitle="パイプライン全体の版情報">
        <p>
          <Mono>{result.recalculationHash.hash}</Mono>
        </p>
      </Card>

      {/* GAP-06:レコード1件からも「何で計算したか」を辿れる。以前はすべてplaceholderだった。 */}
      <Card title="レコード単位の再計算ハッシュ" subtitle="1件ごとに、計算に入った係数版・較正パラメータの指紋" padBody={false}>
        <table className="data-table">
          <thead>
            <tr>
              <th>レコード</th>
              <th>種別</th>
              <th>ハッシュ</th>
            </tr>
          </thead>
          <tbody>
            {recordHashes.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: "var(--ink-faint)" }}>
                  まだ算定結果がありません。
                </td>
              </tr>
            ) : (
              recordHashes.map((row) => (
                <tr key={row.id}>
                  <td className="num" style={{ fontSize: 11 }}>
                    <Mono>{row.id}</Mono>
                  </td>
                  <td>{row.kind}</td>
                  <td className="num" style={{ fontSize: 11 }}>
                    <Mono>{row.hash}</Mono>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <div className="grid-2">
        <Card title="変更履歴" subtitle="誰がいつ何を選び、なぜか" padBody={false}>
          <table className="data-table">
            <thead>
              <tr>
                <th>日時</th>
                <th>担当</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {result.actionLog.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ color: "var(--ink-faint)" }}>
                    まだ操作の記録はありません。
                  </td>
                </tr>
              ) : (
                result.actionLog.map((entry, i) => (
                  <tr key={i}>
                    <td className="num" style={{ fontSize: 11 }}>
                      {entry.date.slice(0, 16).replace("T", " ")}
                    </td>
                    <td>{entry.who}</td>
                    <td>{entry.what}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        <Card title="AssumptionEntry" subtitle={`システム記録 ${result.assumptionEntries.length}件`} padBody={false}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>モジュール</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {result.assumptionEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="num" style={{ fontSize: 11 }}>
                    <Mono>{entry.id}</Mono>
                  </td>
                  <td>{entry.sourceModule}</td>
                  <td>{entry.payload.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
