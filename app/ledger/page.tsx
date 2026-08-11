import Link from "next/link";
import { getTenantId } from "@/lib/db/client";
import { listParameterVersionsWithStatus } from "@/lib/db/repositories/parameter-versions";
import { getRunById, listRuns } from "@/lib/db/repositories/runs";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { recalculateWithPriorParameters } from "@core/ledger/recalculate-with-prior-parameters";
import { Mono, Num } from "../components/numeric";
import { Card, Tag } from "../components/ui";
import { DataSourceAttribution } from "../components/attribution";

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ compareWith?: string }> }) {
  const { compareWith } = await searchParams;
  const tenantId = await getTenantId();
  const result = await getOrCreateLatestResult(tenantId);

  // --- M8 D-3:版レジストリと、旧版パラメータでの再計算(GAP-07)---
  const parameterVersions = await listParameterVersionsWithStatus(tenantId);
  const runs = await listRuns(tenantId, 10);
  const latestRunId = runs[0]?.id;
  // 比較元:URLで指定がなければ1つ前のrun。無ければ比較しない。
  const priorRunId = compareWith ?? runs[1]?.id;
  const priorRun = priorRunId && priorRunId !== latestRunId ? await getRunById(tenantId, priorRunId) : null;

  const currentRecords = Object.values(result.valuation.valuationRecordsByMaterialIssue).flat();
  const priorRecords = priorRun
    ? Object.values(priorRun.result.valuation.valuationRecordsByMaterialIssue).flat()
    : [];

  const recalculations = priorRun
    ? currentRecords.flatMap((record) => {
        const prior = priorRecords.find((r) => r.id === record.id);
        if (!prior) return [];
        return [
          {
            record,
            prior,
            outcome: recalculateWithPriorParameters(record, {
              methodId: prior.methodId,
              methodVersion: prior.methodVersion,
              geographicCalibration: prior.geographicCalibration,
            }),
          },
        ];
      })
    : [];

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

      {/* M8 D-3:係数セット・パラメータの版管理。旧版は削除せず保持し続ける。 */}
      <Card
        title="係数・パラメータの版"
        subtitle="どの版がいつから有効か"
        padBody={false}
        foot="パイプラインが実際に使った版を自動で取り込みます。変更理由は自動では付きません(システムが理由を作らないため)"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>セット</th>
              <th>版</th>
              <th>有効開始</th>
              <th>状態</th>
              <th>変更理由</th>
            </tr>
          </thead>
          <tbody>
            {parameterVersions.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "var(--ink-faint)" }}>
                  まだ版の記録がありません。
                </td>
              </tr>
            ) : (
              parameterVersions.map((version) => (
                <tr key={`${version.setId}-${version.version}`}>
                  <td>{version.setId}</td>
                  <td className="num">
                    <Mono>{version.version}</Mono>
                  </td>
                  <td className="num" style={{ fontSize: 11 }}>
                    {version.effectiveFrom.slice(0, 10)}
                  </td>
                  <td>
                    {version.active ? (
                      <Tag variant="ok">有効</Tag>
                    ) : (
                      <Tag variant="neutral">旧版 → {version.supersededByDerived}</Tag>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: version.changeReason ? undefined : "var(--ink-faint)" }}>
                    {version.changeReason ?? (version.active && !version.supersededByDerived ? "—" : "変更理由が未記録")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/*
        M8 D-3の完了条件「任意のレコードを旧版係数で再計算できる」(GAP-07)。
        過去のrunが持つ較正パラメータを現在のレコードに当て直して比較する。
      */}
      <Card
        title="旧版パラメータでの再計算"
        subtitle={priorRun ? `比較元:${priorRun.executedAt.slice(0, 16).replace("T", " ")} の計算結果` : undefined}
        padBody={false}
        foot="現在の値を較正前に戻し、旧版の較正パラメータを掛け直しています。手法の係数値そのものは保存していないため、手法の版が変わった差分は再計算できません"
      >
        {runs.length > 1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "12px 18px 0" }}>
            {runs.slice(1).map((run) => (
              <Link
                key={run.id}
                href={`/ledger?compareWith=${encodeURIComponent(run.id)}`}
                className={`pill-btn pill-btn--sm${run.id === priorRunId ? " pill-btn--accent" : ""}`}
              >
                {run.executedAt.slice(0, 16).replace("T", " ")}
              </Link>
            ))}
          </div>
        )}

        {!priorRun ? (
          <div style={{ padding: "12px 18px", color: "var(--ink-faint)" }}>
            比較できる過去の計算結果がまだありません(計算が1回のみ)。
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>レコード</th>
                <th>現在の値</th>
                <th>旧版パラメータでの再計算</th>
                <th>差分</th>
              </tr>
            </thead>
            <tbody>
              {recalculations.map(({ record, outcome }) => {
                const current = record.centralValue as unknown as number;
                return (
                  <tr key={record.id}>
                    <td style={{ fontSize: 12 }}>{record.methodId}</td>
                    <td className="num">
                      <Num value={current} unit="円" />
                    </td>
                    <td className="num">
                      {outcome.status === "recalculated" ? (
                        <Num value={outcome.recalculatedValue!} unit="円" />
                      ) : outcome.status === "identical_parameters" ? (
                        <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>パラメータに変更なし</span>
                      ) : (
                        <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>再計算不能</span>
                      )}
                    </td>
                    <td className="num">
                      {outcome.status === "recalculated" ? (
                        <Num value={current - outcome.recalculatedValue!} unit="円" />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {recalculations.some((r) => r.outcome.reason) && (
          <div style={{ padding: "12px 18px" }}>
            {[...new Set(recalculations.map((r) => r.outcome.reason).filter(Boolean))].map((reason) => (
              <p key={reason} className="tooltip-note">
                {reason}
              </p>
            ))}
          </div>
        )}
      </Card>

      <DataSourceAttribution sources={["World Bank"]} />
      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
