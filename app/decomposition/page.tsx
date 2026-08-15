import Link from "next/link";
import type { FactorContribution, PairwiseDecomposition } from "@core/types/divergence";
import { decomposeQuantileRange } from "@core/divergence/quantile-decomposition";
import type { UncertaintyFactor } from "@core/divergence/quantile-decomposition";
import { getTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { Num } from "../components/numeric";
import { Card, Guide, KV, Tag } from "../components/ui";
import { tierLabel } from "../components/tag-utils";
import { Football } from "../components/charts/Football";
import { Waterfall, type WaterfallStepInput } from "../components/charts/Waterfall";
import { RepresentativeSelector } from "./representative-selector";
import { DataSourceAttribution } from "../components/attribution";

const METHOD_LABEL: Record<string, string> = {
  "replacement-cost": "代替費用法(浄水コスト)",
  "lime3-water": "LIME3(水消費統合指標)",
  "ifvi-water-consumption": "IFVI 水ストレス係数",
  "ghg-carbon-price-conversion.ghg-social-cost": "炭素の社会的費用(IFVI GHG方法論)",
  "ghg-carbon-price-conversion.ghg-gx-ets-price": "GX-ETS調整基準取引価格",
};

/** 幅を決める要因(M4 U-3)。中心値の要因とは別の集合。 */
const UNCERTAINTY_FACTOR_LABEL: Record<UncertaintyFactor, string> = {
  parameterUncertainty: "推計値そのもののばらつき(層i)",
  transferError: "他地域の研究値を当てはめる誤差(層ii・適合度ティア)",
};

const FACTOR_LABEL: Record<FactorContribution["factor"], string> = {
  endpointCoverage: "何を測っているかの違い(対象範囲)",
  discountRate: "割引率の違い",
  geographicCalibration: "地域差による調整の違い",
};

function pairwiseToWaterfallSteps(pair: PairwiseDecomposition, labelA: string, labelB: string): WaterfallStepInput[] {
  const steps: WaterfallStepInput[] = [{ label: `${labelA} 中心値`, value: pair.valueA as unknown as number, isTotal: true }];
  let running = pair.valueA as unknown as number;
  for (const c of pair.contributions) {
    const next = running * c.multiplier;
    steps.push({ label: FACTOR_LABEL[c.factor], value: next - running, isTotal: false });
    running = next;
  }
  if (pair.residual) {
    const next = running * pair.residual.multiplier;
    steps.push({ label: "分解不能な残差", value: next - running, isTotal: false });
    running = next;
  }
  steps.push({ label: `${labelB} 中心値`, value: pair.valueB as unknown as number, isTotal: true });
  return steps;
}

export default async function DecompositionPage({ searchParams }: { searchParams: Promise<{ issue?: string }> }) {
  const { issue: issueParam } = await searchParams;
  const result = await getOrCreateLatestResult(await getTenantId());
  const { valuationRecordsByMaterialIssue, divergenceDecompositions, representativeRecordByMaterialIssue, m4ChangeLogByMaterialIssue } =
    result.valuation;
  const materialIssueIds = Object.keys(valuationRecordsByMaterialIssue);

  if (materialIssueIds.length === 0) {
    return (
      <div className="screen">
        <h1 className="screen__title">算定結果の比較</h1>
        <p style={{ color: "var(--ink-faint)", marginTop: 12 }}>深掘り評価に昇格した課題がまだありません。</p>
      </div>
    );
  }

  const selectedIssueId = issueParam && materialIssueIds.includes(issueParam) ? issueParam : materialIssueIds[0];
  const records = valuationRecordsByMaterialIssue[selectedIssueId];
  const decomposition = divergenceDecompositions.find((d) => d.targetPhysicalQuantityId === records[0]?.physicalQuantityId);
  const site = result.assessment.sites.find((s) => s.id === records[0]?.siteId);

  const footballMethods = records.map((r) => ({
    name: METHOD_LABEL[r.methodId] ?? r.methodId,
    tier: r.transferFitness.tier,
    concept: r.valueConcept,
    low: r.quantileRange.p5,
    mid: r.quantileRange.p50,
    high: r.quantileRange.p95,
  }));

  const allRatios = (decomposition?.groups ?? []).flatMap((g) => g.pairwiseDecompositions.map((p) => p.ratio)).filter((r): r is number => r !== null);
  const maxRatio = allRatios.length > 0 ? Math.max(...allRatios) : null;

  /**
   * M4 U-3:レンジの幅の分解。中心値の分解と同じペア(最初の比較対象)について、
   * 「なぜ幅が違うのか」を層i・層iiに分ける。
   */
  const widthPairRecords = records.filter((r) => r.valueConcept === "welfare");
  const quantileDecomposition =
    widthPairRecords.length >= 2 ? decomposeQuantileRange(widthPairRecords[0], widthPairRecords[1]) : null;

  const exchangeGroup = decomposition?.groups.find((g) => g.valueConcept === "exchange");
  const welfareGroup = decomposition?.groups.find((g) => g.valueConcept === "welfare");
  const primaryPair = exchangeGroup?.pairwiseDecompositions[0];

  const currentRepresentativeId = representativeRecordByMaterialIssue[selectedIssueId];
  const changeLog = m4ChangeLogByMaterialIssue[selectedIssueId];

  // M4 §7.4:代表値の選択(利用者が実際に選んだ場合のみ存在する)。
  const selection = decomposition?.representativeValueSelection;
  const selectionStatus = result.valuation.representativeSelectionStatus[selectedIssueId];
  const selectedCentralValue = selection
    ? (records.find((r) => r.methodId === selection.selectedMethodId)?.centralValue as unknown as number | undefined)
    : undefined;

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">算定結果の比較</h1>
          <Guide>
            同じ対象に複数の算定方法を使うと、結果に大きな差が出ることがあります。これは誤差ではなく、各方法が異なる問いに答えているためです。
            差が生じる理由を確認したうえで、投資判断に使う代表値を選びます。推奨値は表示されません。方法を変更する場合は理由の入力が必須です。
          </Guide>
        </div>
      </div>

      {materialIssueIds.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {materialIssueIds.map((id) => (
            <Link
              key={id}
              href={`/decomposition?issue=${encodeURIComponent(id)}`}
              className={`pill-btn pill-btn--sm${id === selectedIssueId ? " pill-btn--accent" : ""}`}
            >
              {id}
            </Link>
          ))}
        </div>
      )}

      <Card
        title="方法別の試算"
        subtitle={site?.name ?? records[0]?.siteId}
        headExtra={maxRatio !== null && maxRatio > 1.5 ? <Tag variant="warn">最大で{maxRatio.toFixed(1)}倍の差</Tag> : undefined}
        foot="単位:円/年 ・ 紫は社会全体への影響(投資判断には使用しません)"
      >
        <Football methods={footballMethods} />
      </Card>

      {/*
        M4 U-3:レンジの幅の分解。中心値の3要因(上のウォーターフォール)は幅を変えないため、
        「なぜ幅が違うのか」は別の要因集合(層i・層ii)で説明する。
      */}
      {quantileDecomposition && (
        <Card
          title="幅が違う理由"
          subtitle={`${METHOD_LABEL[quantileDecomposition.methodIdA] ?? quantileDecomposition.methodIdA} / ${
            METHOD_LABEL[quantileDecomposition.methodIdB] ?? quantileDecomposition.methodIdB
          }`}
          padBody={false}
          foot="中心値の差の要因(上)と幅の差の要因は別です。地域差の調整や対象範囲の違いは、幅ではなく水準を動かします"
        >
          {quantileDecomposition.mode === "not_decomposed" ? (
            <div style={{ padding: "12px 18px", color: "var(--ink-faint)", fontSize: 12.5 }}>
              {quantileDecomposition.notDecomposedReason}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>要因</th>
                  <th>幅への効き</th>
                  <th>寄与</th>
                </tr>
              </thead>
              <tbody>
                {quantileDecomposition.contributions.map((contribution) => (
                  <tr key={contribution.factor}>
                    <td>{UNCERTAINTY_FACTOR_LABEL[contribution.factor]}</td>
                    <td className="num">×{contribution.multiplier.toFixed(2)}</td>
                    <td className="num">
                      {contribution.shareRatio === null ? "—" : `${(contribution.shareRatio * 100).toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>幅の比</b>
                  </td>
                  <td className="num">
                    <b>×{quantileDecomposition.widthRatio!.toFixed(2)}</b>
                  </td>
                  <td className="num">残差 0</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      )}

      {primaryPair && (
        <Card title="差が生じる理由" subtitle="中心値の差を要因に分解">
          <Waterfall
            steps={pairwiseToWaterfallSteps(
              primaryPair,
              METHOD_LABEL[primaryPair.methodIdA] ?? primaryPair.methodIdA,
              METHOD_LABEL[primaryPair.methodIdB] ?? primaryPair.methodIdB
            )}
          />
          <p className="tooltip-note">{primaryPair.narrative}</p>
        </Card>
      )}

      <div className="grid-2">
        {exchangeGroup && (
          <div style={{ border: "1px solid var(--accent-line)", background: "var(--accent-soft)", borderRadius: 6, padding: 14 }}>
            <div className="section-label" style={{ color: "var(--accent-ink)" }}>
              交換価値グループ ・ {exchangeGroup.usage}
            </div>
            {exchangeGroup.methodIds.map((id) => {
              const r = records.find((rec) => rec.methodId === id && rec.valueConcept === "exchange");
              if (!r) return null;
              return <KV key={id} k={METHOD_LABEL[id] ?? id} v={<Num value={r.centralValue as unknown as number} unit="円" />} />;
            })}
            <div style={{ marginTop: 10 }}>
              <Tag variant="exchange">投資判断に反映できます</Tag>
            </div>
          </div>
        )}
        {welfareGroup && (
          <div style={{ border: "1px solid #cbbedd", background: "var(--welfare-soft)", borderRadius: 6, padding: 14 }}>
            <div className="section-label" style={{ color: "var(--welfare)" }}>
              厚生価値グループ ・ {welfareGroup.usage}
            </div>
            {welfareGroup.methodIds.map((id) => {
              const r = records.find((rec) => rec.methodId === id && rec.valueConcept === "welfare");
              if (!r) return null;
              return <KV key={id} k={METHOD_LABEL[id] ?? id} v={<Num value={r.centralValue as unknown as number} unit="円" />} />;
            })}
            <div style={{ marginTop: 10 }}>
              <Tag variant="welfare">開示にのみ使用します</Tag>
            </div>
            <p className="tooltip-note">この値は投資判断には使用せず、開示の参考情報としてのみ使用します。</p>
          </div>
        )}
      </div>

      <Card title="投資判断に使う代表値の選択" padBody={false}>
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>方法</th>
              <th>適合度ティア</th>
              <th>中心値</th>
            </tr>
          </thead>
          <tbody>
            {records
              .filter((r) => r.valueConcept === "exchange")
              .map((r) => {
                const selected = r.id === currentRepresentativeId;
                return (
                  <tr key={r.id} style={selected ? { background: "var(--accent-soft)" } : undefined}>
                    <td>
                      {selected ? (
                        <Tag variant="ok">選択中</Tag>
                      ) : (
                        <RepresentativeSelector
                          materialIssueId={selectedIssueId}
                          recordId={r.id}
                          methodId={r.methodId}
                          valueConcept={r.valueConcept}
                          fromLabel={METHOD_LABEL[records.find((rr) => rr.id === currentRepresentativeId)?.methodId ?? ""] ?? "—"}
                          toLabel={METHOD_LABEL[r.methodId] ?? r.methodId}
                        />
                      )}
                    </td>
                    <td>
                      <b>{METHOD_LABEL[r.methodId] ?? r.methodId}</b>
                    </td>
                    <td>{tierLabel(r.transferFitness.tier)}</td>
                    <td className="num">
                      <Num value={r.centralValue as unknown as number} unit="円" />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        <div style={{ padding: "12px 18px" }}>
          {changeLog ? (
            <>
              <div className="section-label">変更履歴</div>
              <KV k="変更前" v={changeLog.from} />
              <KV k="変更後" v={changeLog.to} />
              <KV k="変更理由" v={changeLog.reason} />
            </>
          ) : (
            <p style={{ color: "var(--ink-faint)", fontSize: 12 }}>代表値の変更履歴はまだありません。</p>
          )}
        </div>
      </Card>

      {/*
        M4 §7.4・構想書9.3の必須要件:手法を変更したときは、前年度手法での再計算値を並記する。
        これがないと、手法変更による差分と実態変化による差分が混ざる(GAP-09)。
      */}
      {selection && (
        <Card title="前年度手法との比較" subtitle="手法変更による差分を切り分ける">
          <KV k="前年度に採用していた手法" v={METHOD_LABEL[selection.priorYearMethodId ?? ""] ?? selection.priorYearMethodId ?? "記録なし(初年度)"} />
          <KV k="今年度に選択した手法" v={METHOD_LABEL[selection.selectedMethodId] ?? selection.selectedMethodId} />
          <KV k="選択理由" v={selection.reason} />
          <hr className="rule" />

          {selectionStatus?.status === "recalculated" && selection.recalculatedWithPriorMethod !== undefined ? (
            <>
              <KV
                k="前年度手法を今年度の物理量で再計算した値"
                v={<Num value={selection.recalculatedWithPriorMethod} unit="円" />}
              />
              <KV k="今年度の選択手法の値" v={<Num value={selectedCentralValue ?? 0} unit="円" />} />
              <KV
                k="手法変更による差分"
                v={<Num value={(selectedCentralValue ?? 0) - selection.recalculatedWithPriorMethod} unit="円" />}
              />
              <p className="tooltip-note">
                いずれも<b>今年度の物理量</b>で計算した値です。したがってこの差分は手法変更のみによるものです。
                実態変化による差分を出すには前年度の実績値が必要ですが、本システムはまだ過年度の実績を保持していないため算出しません。
              </p>
            </>
          ) : selectionStatus?.status === "method_unavailable" ? (
            <p className="tooltip-note">{selectionStatus.unavailableReason}</p>
          ) : (
            <p className="tooltip-note">前年度から手法を変更していないため、再計算値の並記は行いません。</p>
          )}
        </Card>
      )}

      <DataSourceAttribution sources={["World Bank"]} />
      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
