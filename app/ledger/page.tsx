import Link from "next/link";
import type { Metadata } from "next";
import { loadLedgerView } from "@/lib/views/pipeline";
import { recalculateWithPriorParameters } from "@core/ledger/recalculate-with-prior-parameters";
import { Mono, Num, pickYenScale } from "../components/numeric";
import { Card, ScreenLead, Stat, Tag } from "../components/ui";
import { categoryLabel, materialIssueLabel, verdictLabel } from "../components/labels";
import { methodLabel, withMethodLabelsInText } from "../components/method-labels";
import { DataSourceAttribution } from "../components/attribution";
import { SectionNav } from "../components/section-nav";

export const metadata: Metadata = {
  title: "記録 | PRISM",
};

/**
 * 記録(監査証跡、指示05)。
 *
 * 業務フローの外にある参照画面。先頭は人が読める2表(変更履歴/係数・パラメータの版)と
 * 判定件数(⑤から移設した従量課金の根拠)。ハッシュ類・レコード単位の照合・旧版係数での
 * 再計算は、日常業務では読む必要がないため「技術的な検証情報」として折りたたむ
 * (第1波が /valuation で使った details.foldout パターンを踏襲)。
 */
type LedgerSection = "overview" | "history" | "inputs" | "parameter-versions" | "billing";

const PARAMETER_SET_LABEL: Record<string, string> = {
  "aop-mapping": "健康・生態系影響の対応表",
  "carbon-price-scenarios": "炭素価格シナリオ",
  "ghg-carbon-price-conversion": "GHGの金額換算",
  "m1-sensitivity-criteria": "自然との関わりの判定基準",
  "m2-priority-formula": "評価優先度の算定式",
  "m3-fitness-tier-threshold": "手法適合度の判定基準",
  "m3-geo-calibration": "地域差の調整",
  "m4-decomposition-algorithm": "手法差の要因分解",
  "m6-binding-mechanism-definition": "結果の反映先の定義",
  "m7-gap-detection-rule": "開示と根拠の照合ルール",
};

function parameterSetLabel(setId: string): string {
  return PARAMETER_SET_LABEL[setId] ?? methodLabel(setId);
}

export default async function LedgerPage({ searchParams, section = "overview" }: { searchParams: Promise<{ compareWith?: string }>; section?: LedgerSection }) {
  const { compareWith } = await searchParams;
  const { result, parameterVersions, runs, decisionCounts, priorRun } = await loadLedgerView(compareWith);
  const { decisions } = result;
  const sectionTitle: Record<LedgerSection, string> = {
    overview: "記録",
    history: "変更履歴",
    inputs: "入力・係数の追跡",
    "parameter-versions": "係数・パラメータの版",
    billing: "判定件数",
  };
  const sectionLead: Record<LedgerSection, string> = {
    overview: "確認したい記録を選びます",
    history: "誰がいつ何を変更したかを確認します",
    inputs: "算定に使った入力・対応表・係数を照合します",
    "parameter-versions": "使用中の版と過去の版による再計算を確認します",
    billing: "確定した判定と従量課金の根拠を確認します",
  };
  const displayActionText = (text: string) => {
    let display = withMethodLabelsInText(text)
      .replaceAll("IFVI VFaccess", "IFVI 水ストレス係数(将来の水アクセス費用)")
      .replaceAll("深掘り", "詳細評価");
    const issues = [...result.assessment.materialIssues].sort((a, b) => b.id.length - a.id.length);
    for (const issue of issues) {
      const siteName = result.assessment.sites.find((site) => site.id === issue.siteId)?.name;
      display = display.replaceAll(issue.id, materialIssueLabel(siteName, issue.impactCategory, issue.id));
    }
    for (const site of [...result.assessment.sites].sort((a, b) => b.id.length - a.id.length)) {
      display = display.replaceAll(site.id, site.name);
    }
    return display;
  };

  // --- M8 D-3:版レジストリと、旧版パラメータでの再計算(GAP-07)---
  // 比較元:URLで指定がなければ1つ前のrun。無ければ比較しない。
  const priorRunId = compareWith ?? runs[1]?.id;

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
      .map((record) => ({ id: record.id, kind: "算定結果", hash: record.recalculationHash })),
    ...result.valuation.divergenceDecompositions.map((decomposition) => ({
      id: decomposition.id,
      kind: "比較(手法間の差の分解)",
      hash: decomposition.recalculationHash,
    })),
    ...result.decisions.map((entry) => ({
      id: entry.decision.decisionRecord.id,
      kind: "判定の記録",
      hash: entry.decision.decisionRecord.recalculationHash,
    })),
  ];
  const inputTraceRows = currentRecords.flatMap((record) => {
    const input = record.inputSnapshot;
    if (!input || (!record.factorSnapshot && !record.mappingSnapshot)) return [];
    const inputHash = "sourceRecordHash" in input ? input.sourceRecordHash : undefined;
    return [{
      id: record.id,
      category: input.category,
      physicalQuantityId: record.physicalQuantityId,
      inputHash,
      factor: record.factorSnapshot,
      mapping: record.mappingSnapshot,
      currencyConversion: record.currencyConversion,
    }];
  });

  // 判定件数(従量課金の根拠、M6 D-8・D-30)。⑤対策と判定から移設した(指示05)。
  // 意思決定の最中に課金明細が見えるのは判断を歪めうるノイズであり、日常業務の外にある
  // この記録画面に置くほうがふさわしい。

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">{sectionTitle[section]}</h1>
        </div>
        <ScreenLead>{sectionLead[section]}</ScreenLead>
      </div>

      <SectionNav
        label="記録内の画面"
        items={[
          ...(section === "overview"
            ? []
            : [{ href: "/ledger", label: "記録メニュー", description: "確認する記録を選択", active: false }]),
          { href: "/ledger/history", label: "変更履歴", description: "担当・日時・変更内容", active: section === "history" },
          { href: "/ledger/inputs", label: "入力・係数", description: "算定根拠を照合", active: section === "inputs" },
          { href: "/ledger/parameter-versions", label: "版と再計算", description: "現在版と旧版を比較", active: section === "parameter-versions" },
          { href: "/ledger/billing", label: "判定件数", description: "従量課金の根拠", active: section === "billing" },
        ]}
      />

      {(section === "history" || section === "parameter-versions") && <div>
        {section === "history" && <Card id="history" padBody={false}>
          <table className="data-table">
            <thead>
              <tr>
                <th>日時（日本時間）</th>
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
                      {new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(entry.date))}
                    </td>
                    <td>{entry.who}</td>
                    {/* 第4版 D-03:古い記録に残る手法IDは、記録を書き換えず表示時だけ読める名前にする。 */}
                    <td>{displayActionText(entry.what)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>}

        {/* M8 D-3:係数セット・パラメータの版管理。旧版は削除せず保持し続ける。 */}
        {section === "parameter-versions" && <Card
          id="parameter-versions"
          padBody={false}
          foot="パイプラインが実際に使った版を自動で取り込みます。変更理由は自動では付きません(システムが理由を作らないため)"
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>係数・ルール</th>
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
                    <td>{parameterSetLabel(version.setId)}</td>
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
        </Card>}
      </div>}

      {section === "inputs" && <Card
        id="inputs"
        title="追加カテゴリの入力・係数の追跡"
        subtitle="算定行ごとに入力、対応表、係数を照合できます"
        padBody={false}
        foot="顧客の元ファイル本文は保存・表示しません。正規化入力と出典ハッシュだけを記録します。"
      >
        {inputTraceRows.length === 0 ? (
          <p style={{ padding: "12px 18px", color: "var(--ink-faint)" }}>追加カテゴリの算定行はまだありません。</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>カテゴリ・物理量</th>
                <th>入力ハッシュ</th>
                <th>対応表</th>
                <th>係数</th>
              </tr>
            </thead>
            <tbody>
              {inputTraceRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{categoryLabel(row.category)}</b>
                    <span className="id-note">{row.physicalQuantityId}</span>
                  </td>
                  <td className="num" style={{ fontSize: 11 }}><Mono>{row.inputHash ?? "—"}</Mono></td>
                  <td style={{ fontSize: 11.5 }}>
                    {row.mapping ? <><b>{row.mapping.mappingVersion}</b><span className="id-note"><Mono>{row.mapping.mappingHash}</Mono></span></> : "—"}
                  </td>
                  <td style={{ fontSize: 11.5 }}>
                    {row.factor ? <><b>{row.factor.factorId}</b><span className="id-note"><Mono>{row.factor.sourceHash}</Mono></span></> : "—"}
                    {row.currencyConversion && <span className="id-note">{row.currencyConversion.fromCurrency}→JPY {row.currencyConversion.rate} ({row.currencyConversion.source})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>}

      {/*
        M6 D-8 / D-30:従量課金は「判定超過」1本のみで、結論の向きを問わず一律。
        構想書6.4が「課金の発生根拠が顧客にとって説明可能である」ことを設計要件としているため、
        件数だけでなく、どの判定がいつ数えられたかの明細も出す。⑤から本画面へ移設(指示05)。
      */}
      {section === "billing" && <Card
        id="billing"
        padBody={false}
        foot="判定が確定した時点で1件。判定の内容(結論が変わるか変わらないか)は課金に影響しません。未確定(保留)は数えません"
      >
        <div style={{ padding: "12px 18px" }}>
          <Stat label="確定した判定" value={`${decisionCounts.length}件`} />
        </div>
        {decisionCounts.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>判定ID</th>
                <th>拠点</th>
                <th>判定</th>
                <th>計上日時</th>
              </tr>
            </thead>
            <tbody>
              {decisionCounts.map((entry) => (
                <tr key={entry.decisionRecordId}>
                  <td className="num" style={{ fontSize: 11 }}>
                    {entry.decisionRecordId}
                  </td>
                  <td>{decisions.find((d) => d.siteId === entry.siteId)?.siteName ?? entry.siteId ?? "—"}</td>
                  <td>{verdictLabel(entry.verdict)}</td>
                  <td className="num" style={{ fontSize: 11 }}>
                    {entry.countedAt.slice(0, 16).replace("T", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>}

      {/*
        技術的な検証情報(指示05)。ハッシュ・レコード単位の照合・旧版係数での再計算は
        監査対応には必要だが日常業務では読む必要がないため、折りたたみに格下げする
        (第1波が /valuation で使った details.foldout パターンを踏襲)。
      */}
      {section === "parameter-versions" && <details className="foldout" open>
        <summary>
          技術的な検証情報
          <small>ハッシュ・レコード単位の照合・旧版係数での再計算(監査対応向け)</small>
        </summary>
        <div className="foldout__body">
          <Card title="パイプライン全体の版情報" subtitle="RecalculationHash">
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

          <Card title="前提の記録" subtitle={`システム記録 ${result.assumptionEntries.length}件`} padBody={false}>
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
                    href={`/ledger/parameter-versions?compareWith=${encodeURIComponent(run.id)}`}
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
                    const current = record.centralValue;
                    // 指示09:レコードごとに算定対象(水・GHG等)が異なり金額の桁も大きく違うため、
                    // 行ではなくレコード単位(現在値・再計算値・差分の3列)で単位を揃える。
                    const rowScale = pickYenScale(
                      current,
                      outcome.status === "recalculated" ? outcome.recalculatedValue! : current,
                      outcome.status === "recalculated" ? current - outcome.recalculatedValue! : 0
                    );
                    return (
                      <tr key={record.id}>
                        {/* 第4版 D-03:生の手法ID(サブ係数付き)を画面に出さない。 */}
                        <td style={{ fontSize: 12 }}>{methodLabel(record.methodId)}</td>
                        <td className="num">
                          <Num value={current} unit="円" scale={rowScale} />
                        </td>
                        <td className="num">
                          {outcome.status === "recalculated" ? (
                            <Num value={outcome.recalculatedValue!} unit="円" scale={rowScale} />
                          ) : outcome.status === "identical_parameters" ? (
                            <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>パラメータに変更なし</span>
                          ) : (
                            <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>再計算不能</span>
                          )}
                        </td>
                        <td className="num">
                          {outcome.status === "recalculated" ? (
                            <Num value={current - outcome.recalculatedValue!} unit="円" scale={rowScale} />
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
        </div>
      </details>}

      {section === "inputs" && <DataSourceAttribution sources={["World Bank"]} />}
    </div>
  );
}
