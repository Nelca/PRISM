import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { IntraMethodBreakdownAnalysis, PairwiseDecompositionV2 } from "@core/types/divergence";
import type { DataAcquisitionAction, KnownDifference } from "@core/types/recipe";
import type { ValuationRecord } from "@core/types/valuation";
import { loadPipelineView } from "@/lib/views/pipeline";
import { maxDivergenceRatio, pairDivergenceRatio } from "@/lib/pipeline/open-tasks";
import { Card, KV, ScreenLead, Stat, TableScroll, Tag } from "../components/ui";
import { Mono, Num, pickYenScale } from "../components/numeric";
import { decompositionFactorLabel, flowInterpretationStatusLabel, materialIssueLabel, traceAvailabilityLabel, traceStepRoleLabel } from "../components/labels";
import { methodLabel, methodShortLabel, withMethodLabelsInText } from "../components/method-labels";
import { Waterfall } from "../components/charts/Waterfall";
import {
  breakdownComponentViews,
  breakdownMixedConceptNote,
  chartMode,
  combinedKnownDifferences,
  contributionShareLabel,
  DIAGNOSTICS_THRESHOLD_NOTE,
  KNOWN_DIFFERENCE_FIXED_NOTE,
  evidenceSummary,
  pairImplicationDisplay,
  pairZeroMeaning,
  pairwiseToWaterfallSteps,
  readablePairNarrative,
  residualRatioLabel,
  subsetRows,
  traceAvailabilityEntries,
  traceStepViews,
  pathwayRows,
} from "../valuation/view-model";

export const metadata: Metadata = {
  title: "手法比較・不確実性 | PRISM",
};

type Unit = "cross" | "breakdown";

/** 分類ラベル+説明+A側/B側+根拠+取得アクションの表(T-15 情報設計 4)。 */
function KnownDifferenceTable({ differences }: { differences: KnownDifference[] }) {
  if (differences.length === 0) {
    return <p className="tooltip-note">既知だが数値化できない差異は特定されていません。</p>;
  }
  return (
    <>
      <TableScroll label="既知だが数値化できない差異">
        <table className="data-table">
          <caption className="sr-only">既知だが数値化できない差異の一覧</caption>
          <thead>
            <tr>
              <th scope="col">分類</th>
              <th scope="col">内容</th>
              <th scope="col">A側</th>
              <th scope="col">B側</th>
              <th scope="col">根拠</th>
              <th scope="col">次に取得するもの</th>
            </tr>
          </thead>
          <tbody>
            {differences.map((difference, index) => (
              <tr key={`${difference.category}-${index}`}>
                <th scope="row">{decompositionFactorLabel(difference.category)}</th>
                <td>{difference.description}</td>
                <td>{difference.sideA}</td>
                <td>{difference.sideB}</td>
                <td className="cell-note">{difference.evidence.map(evidenceSummary).join(" / ") || "—"}</td>
                <td className="cell-note">{difference.acquisitionAction ? acquisitionActionText(difference.acquisitionAction) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <p className="tooltip-note">{KNOWN_DIFFERENCE_FIXED_NOTE}</p>
    </>
  );
}

function acquisitionActionText(action: DataAcquisitionAction): string {
  return `${action.item}(候補:${action.candidateSource}${action.gate ? ` ・ ${action.gate}` : ""} ・ 取得後の再計算${action.enablesRecalculation ? "可" : "不可"})`;
}

function NextActionList({ actions }: { actions: DataAcquisitionAction[] }) {
  if (actions.length === 0) return <p className="tooltip-note">次に取得すべきデータは特定できていません。</p>;
  return (
    <ul className="tooltip-note">
      {actions.map((action) => (
        <li key={action.item}>{acquisitionActionText(action)}</li>
      ))}
    </ul>
  );
}

function ZeroMeaningBadge({ pair, side }: { pair: PairwiseDecompositionV2; side: "A" | "B" }) {
  const display = pairZeroMeaning(pair, side);
  if (!display) return null;
  return (
    <Tag variant={display.code === "unconfirmed" ? "warn" : "neutral"} title={display.detail}>
      0の意味:{display.badgeLabel}
    </Tag>
  );
}

/** 監査ドリルダウン(T-15 情報設計 6)。折りたたみ、入力・式・出典・版・反実仮想値を出す。 */
function AuditDrilldown({
  pair,
  recordA,
  recordB,
  labelA,
  labelB,
}: {
  pair: PairwiseDecompositionV2;
  recordA: ValuationRecord | undefined;
  recordB: ValuationRecord | undefined;
  labelA: string;
  labelB: string;
}) {
  const decomposed = pair.status === "decomposed" ? pair : null;
  return (
    <details className="foldout">
      <summary>
        監査ドリルダウン
        <small>入力・式・出典・版・反実仮想値を確認します</small>
      </summary>
      <div className="foldout__body">
        {decomposed && (
          <>
            <div className="section-label">v(S):部分集合ごとの評価値</div>
            <TableScroll label="部分集合ごとの評価値">
              <table className="data-table">
                <caption className="sr-only">反実仮想で差し替えた要因の組合せごとの値</caption>
                <thead>
                  <tr>
                    <th scope="col">差し替えた要因(S)</th>
                    <th scope="col">固定した要因(F∖S)</th>
                    <th scope="col">v(S)</th>
                    <th scope="col">トレースハッシュ</th>
                  </tr>
                </thead>
                <tbody>
                  {subsetRows(decomposed).map((row, index) => (
                    <tr key={`${row.traceHash}-${index}`}>
                      <td>{row.subsetLabel}</td>
                      <td>{row.fixedLabel}</td>
                      <td className="num">{new Intl.NumberFormat("ja-JP").format(row.value)}</td>
                      <td>
                        <Mono>{row.traceHash.slice(0, 12)}</Mono>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>

            <div className="section-label" style={{ marginTop: 14 }}>
              比較レシピ・許容誤差
            </div>
            <KV k="レシピ" v={<Mono>{decomposed.recipe.id} / {decomposed.recipe.version} / {decomposed.recipe.hash.slice(0, 16)}</Mono>} />
            <KV k="レビュー状態" v={decomposed.recipe.reviewStatus} />
            <KV k="許容誤差の版" v={<Mono>{decomposed.tolerance.version}</Mono>} />

            <div className="section-label" style={{ marginTop: 14 }}>
              診断値(§6.3判定に使った補助値)
            </div>
            <KV k="桁差比" v={decomposed.diagnostics.magnitudeGapRatio === null ? "定義できません" : decomposed.diagnostics.magnitudeGapRatio.toFixed(4)} />
            <KV k="対数比" v={decomposed.diagnostics.lnRatio === null ? "定義できません" : decomposed.diagnostics.lnRatio.toFixed(4)} />
            <KV k="金額差" v={decomposed.diagnostics.absoluteDifference === null ? "定義できません" : <Num value={decomposed.diagnostics.absoluteDifference} unit="円" />} />
            <p className="tooltip-note">{DIAGNOSTICS_THRESHOLD_NOTE}</p>

            <div className="section-label" style={{ marginTop: 14 }}>
              A→B反転(反実仮想の対称性)
            </div>
            {decomposed.reverse.defined ? (
              <TableScroll label="逆方向の寄与">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">要因</th>
                      <th scope="col">寄与</th>
                      <th scope="col">寄与割合</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decomposed.reverse.contributions.map((contribution) => (
                      <tr key={contribution.factorId}>
                        <th scope="row">{decompositionFactorLabel(contribution.category)}</th>
                        <td className="num">
                          {contribution.displayMultiplier !== null
                            ? `×${contribution.displayMultiplier.toFixed(2)}`
                            : contribution.displayAmount !== null
                              ? new Intl.NumberFormat("ja-JP").format(contribution.displayAmount)
                              : "—"}
                        </td>
                        <td className="num">{contributionShareLabel(contribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            ) : (
              <p className="tooltip-note">逆方向は定義できません:{decomposed.reverse.reason}</p>
            )}
          </>
        )}

        <div className="section-label" style={{ marginTop: 14 }}>
          計算トレース
        </div>
        <div className="grid-2">
          <TraceDetail label={labelA} record={recordA} />
          <TraceDetail label={labelB} record={recordB} />
        </div>
      </div>
    </details>
  );
}

function TraceDetail({ label, record }: { label: string; record: ValuationRecord | undefined }) {
  if (!record) return <p className="tooltip-note">{label}:レコードが見つかりません。</p>;
  const trace = record.trace;
  if (!trace) {
    return (
      <div>
        <div className="section-label">{label}</div>
        <p className="tooltip-note">計算トレースが保存されていません(trace_insufficient)。</p>
      </div>
    );
  }
  return (
    <div>
      <div className="section-label">{label}</div>
      <KV k="入力の解釈" v={`${trace.flowInterpretation.inputProvides} → ${trace.flowInterpretation.methodAssumes}(${flowInterpretationStatusLabel(trace.flowInterpretation.status)})`} />
      {pathwayRows(trace.pathway).map((row) => (
        <KV key={row.label} k={row.label} v={row.value} />
      ))}
      {traceAvailabilityEntries(trace).map((entry) => (
        <KV
          key={entry.label}
          k={entry.label}
          v={
            <>
              {traceAvailabilityLabel(entry.availability.status)}
              {"reason" in entry.availability && <span className="cell-note">{entry.availability.reason}</span>}
            </>
          }
        />
      ))}
      <details className="foldout" style={{ marginTop: 8 }}>
        <summary>
          計算ステップ({trace.steps.length}件)
          <small>役割・式・単位・適用状況</small>
        </summary>
        <div className="foldout__body">
          <TableScroll label={`${label}の計算ステップ`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">役割</th>
                  <th scope="col">内容</th>
                  <th scope="col">式</th>
                  <th scope="col">単位</th>
                  <th scope="col">適用</th>
                </tr>
              </thead>
              <tbody>
                {traceStepViews(trace).map((step) => (
                  <tr key={step.id}>
                    <td className="cell-note">{traceStepRoleLabel(step.roleLabel)}</td>
                    <td>{step.label}</td>
                    <td className="cell-note">
                      <Mono>{step.formula}</Mono>
                    </td>
                    <td className="cell-note">{step.unit}</td>
                    <td>
                      {step.applied ? <Tag variant="ok">適用</Tag> : <Tag variant="neutral" title={step.skipReason}>未適用</Tag>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </details>
    </div>
  );
}

function CrossMethodPairView({
  pair,
  valueConcept,
  records,
  scale,
}: {
  pair: PairwiseDecompositionV2;
  valueConcept: "exchange" | "welfare";
  records: ValuationRecord[];
  scale: ReturnType<typeof pickYenScale>;
}) {
  const recordA = records.find((record) => record.methodId === pair.methodIdA);
  const recordB = records.find((record) => record.methodId === pair.methodIdB);
  const labelA = methodShortLabel(pair.methodIdA);
  const labelB = methodShortLabel(pair.methodIdB);
  const implication = pairImplicationDisplay(pair);
  const mode = chartMode(pair);
  const decomposed = pair.status === "decomposed" ? pair : null;
  const stopped = pair.status === "stopped" ? pair : null;

  return (
    <>
      {/* 1. 結論 */}
      <Card
        id="pair-conclusion"
        title="結論"
        subtitle="なぜ差が生じるか"
        headExtra={<Tag variant={valueConcept === "welfare" ? "welfare" : "exchange"}>{valueConcept === "welfare" ? "厚生価値" : "交換価値"}</Tag>}
      >
        <div className="grid-3">
          <Stat label={labelA} value={<Num value={Number(pair.valueA)} unit="円/年" scale={scale} />} />
          <Stat label={labelB} value={<Num value={Number(pair.valueB)} unit="円/年" scale={scale} />} />
          <Stat
            label="差の倍率"
            value={pairDivergenceRatio(pair) ? `${pairDivergenceRatio(pair)!.toFixed(1)}倍` : "倍率なし"}
          />
        </div>
        <div className="detail-actions" aria-label="ゼロ値の意味">
          <ZeroMeaningBadge pair={pair} side="A" />
          <ZeroMeaningBadge pair={pair} side="B" />
        </div>
        <p className="chart-narrative">{withMethodLabelsInText(readablePairNarrative(pair))}</p>
      </Card>

      {/* 2. 意思決定への含意 */}
      <Card title={implication.headingLabel} subtitle="意思決定への含意">
        {/* stopped の場合、summary は既に停止理由コード+detail を含む決定論的文なので、detailを二重に出さない。 */}
        <p className="chart-narrative">{withMethodLabelsInText(implication.summary)}</p>
        {implication.stopReasonLabel && <p className="tooltip-note">停止理由:{implication.stopReasonLabel}</p>}
      </Card>

      {/* 3. 数値化できた原因寄与 */}
      <Card title="数値化できた原因寄与" padBody={mode === "waterfall"}>
        {decomposed ? (
          mode === "waterfall" ? (
            <Waterfall steps={pairwiseToWaterfallSteps(decomposed, labelA, labelB)} />
          ) : (
            <div style={{ padding: 0 }}>
              <TableScroll label="手法間差の要因分解">
                <table className="data-table">
                  <caption className="sr-only">選択中の手法ペアの要因分解</caption>
                  <thead>
                    <tr>
                      <th scope="col">要因</th>
                      <th scope="col">{decomposed.mode === "multiplicative" ? "倍率" : "金額"}</th>
                      <th scope="col">寄与割合</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decomposed.contributions.map((contribution) => (
                      <tr key={contribution.factorId}>
                        <th scope="row">{decompositionFactorLabel(contribution.category)}</th>
                        <td className="num">
                          {contribution.displayMultiplier !== null ? (
                            `×${contribution.displayMultiplier.toFixed(2)}`
                          ) : contribution.displayAmount !== null ? (
                            <Num value={contribution.displayAmount} unit="円/年" scale={scale} />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">{contributionShareLabel(contribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          )
        ) : (
          <p className="tooltip-note">このペアは数値分解を停止したため、数値化できた要因はありません。</p>
        )}
      </Card>

      {/* 4. 既知だが数値化できない差異 */}
      <Card title="既知だが数値化できない差異">
        <KnownDifferenceTable differences={combinedKnownDifferences(pair)} />
      </Card>

      {/* 5. 未分類残差と次のアクション */}
      <Card title="未分類残差と次のアクション">
        {decomposed ? (
          <>
            <div className="grid-3">
              <Stat
                label="残差"
                value={
                  decomposed.residual.displayMultiplier !== null ? (
                    `×${decomposed.residual.displayMultiplier.toFixed(2)}`
                  ) : (
                    <Num value={decomposed.residual.value} unit="円/年" scale={scale} />
                  )
                }
              />
              <Stat label="残差比率" value={residualRatioLabel(decomposed.residual)} />
              <Stat label="未分類残差か" value={decomposed.residual.unclassified ? "根拠付き候補理由なし" : "候補理由あり(下表)"} />
            </div>
            <div style={{ padding: "12px 18px 0" }}>
              <div className="section-label">次に取得すべきデータ</div>
              <NextActionList actions={decomposed.residual.nextActions} />
            </div>
          </>
        ) : (
          stopped && (
            <div style={{ padding: "0 18px 12px" }}>
              <div className="section-label">不足しているデータ</div>
              <NextActionList actions={stopped.missingData} />
              <div className="section-label" style={{ marginTop: 10 }}>
                次に取得すべきデータ
              </div>
              <NextActionList actions={stopped.nextActions} />
            </div>
          )
        )}
      </Card>

      {/* 6. 監査ドリルダウン */}
      <AuditDrilldown pair={pair} recordA={recordA} recordB={recordB} labelA={labelA} labelB={labelB} />
    </>
  );
}

function BreakdownAnalysisView({ analysis, scale }: { analysis: IntraMethodBreakdownAnalysis; scale: ReturnType<typeof pickYenScale> }) {
  const components = breakdownComponentViews(analysis);
  const mixedNote = breakdownMixedConceptNote(analysis);
  return (
    <Card title="内訳分析" subtitle={methodLabel(analysis.parentMethodId)}>
      <KV k="集計式" v={<Mono>{analysis.aggregationFormula}</Mono>} />
      <TableScroll label="内訳ごとの値">
        <table className="data-table">
          <caption className="sr-only">同一手法の内訳分析</caption>
          <thead>
            <tr>
              <th scope="col">内訳</th>
              <th scope="col">価値概念</th>
              <th scope="col">値</th>
              <th scope="col">採用</th>
            </tr>
          </thead>
          <tbody>
            {components.map((component) => (
              <tr key={component.subFactorId}>
                <th scope="row">{methodLabel(component.recordMethodId)}</th>
                <td>
                  <Tag variant={component.valueConceptLabel === "厚生価値" ? "welfare" : "exchange"}>{component.valueConceptLabel}</Tag>
                </td>
                <td className="num">
                  <Num value={component.value} unit="円/年" scale={scale} />
                  {component.zeroMeaning && (
                    <span className="cell-note" title={component.zeroMeaning.detail}>
                      0の意味:{component.zeroMeaning.badgeLabel}
                    </span>
                  )}
                </td>
                <td>{component.selected ? <Tag variant="ok">採用</Tag> : <Tag variant="neutral">不採用</Tag>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {analysis.aggregate && (
        <div style={{ padding: "12px 18px" }}>
          <KV k="公式集計値" v={<Num value={analysis.aggregate.value} unit="円/年" scale={scale} />} />
          {mixedNote && <p className="tooltip-note">{mixedNote}</p>}
        </div>
      )}
    </Card>
  );
}

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ issue?: string; pair?: string; unit?: string }>;
}) {
  const { issue: issueParam, pair: pairParam, unit: unitParam } = await searchParams;
  const result = await loadPipelineView();
  const siteNameById = new Map(result.assessment.sites.map((site) => [site.id, site.name]));
  const issueById = new Map(result.assessment.materialIssues.map((issue) => [issue.id, issue]));

  const rows = result.valuation.divergenceDecompositions
    .map((decomposition) => {
      const issueId = Object.keys(result.valuation.valuationRecordsByMaterialIssue).find((candidate) =>
        result.valuation.valuationRecordsByMaterialIssue[candidate].some(
          (record) => record.physicalQuantityId === decomposition.targetPhysicalQuantityId
        )
      );
      const issue = issueId ? issueById.get(issueId) : undefined;
      return {
        id: decomposition.id,
        issueId,
        decomposition,
        label: issue ? materialIssueLabel(siteNameById.get(issue.siteId), issue.impactCategory, issue.siteId) : decomposition.siteId,
        ratio: maxDivergenceRatio(decomposition),
        hasCrossGroup: decomposition.crossGroupComparison !== null,
      };
    })
    .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));

  if (issueParam && !rows.some((row) => row.issueId === issueParam)) notFound();
  const selected = rows.find((row) => row.issueId === issueParam) ?? rows[0];

  if (unitParam !== undefined && unitParam !== "cross" && unitParam !== "breakdown") notFound();
  const unit: Unit = unitParam === "breakdown" ? "breakdown" : "cross";

  const crossEntries =
    selected?.decomposition.groups.flatMap((group) =>
      group.crossMethodPairs.map((pair) => ({ valueConcept: group.valueConcept, pair }))
    ) ?? [];
  const breakdownEntries =
    selected?.decomposition.groups.flatMap((group) =>
      group.breakdownAnalyses.map((analysis) => ({ valueConcept: group.valueConcept, analysis }))
    ) ?? [];

  const crossKey = (pair: PairwiseDecompositionV2) => `${pair.methodIdA}~${pair.methodIdB}`;
  const breakdownKey = (analysis: IntraMethodBreakdownAnalysis) => analysis.parentMethodId;

  if (unit === "cross" && pairParam && !crossEntries.some((entry) => crossKey(entry.pair) === pairParam)) notFound();
  if (unit === "breakdown" && pairParam && !breakdownEntries.some((entry) => breakdownKey(entry.analysis) === pairParam)) notFound();

  const selectedCrossEntry =
    unit === "cross"
      ? (crossEntries.find((entry) => crossKey(entry.pair) === pairParam) ??
        crossEntries.reduce<(typeof crossEntries)[number] | undefined>((best, candidate) => {
          if (!best) return candidate;
          return (pairDivergenceRatio(candidate.pair) ?? 0) > (pairDivergenceRatio(best.pair) ?? 0) ? candidate : best;
        }, undefined))
      : undefined;
  const selectedBreakdownEntry =
    unit === "breakdown"
      ? (breakdownEntries.find((entry) => breakdownKey(entry.analysis) === pairParam) ?? breakdownEntries[0])
      : undefined;

  const records = selected?.issueId ? result.valuation.valuationRecordsByMaterialIssue[selected.issueId] ?? [] : [];
  const scale = pickYenScale(
    ...records.flatMap((record) => [
      Number(record.centralValue),
      Number(record.quantileRange?.p5 ?? 0),
      Number(record.quantileRange?.p95 ?? 0),
    ])
  );

  const issueHref = (overrides: { pair?: string | null; unit?: Unit }) => {
    const params = new URLSearchParams();
    if (selected?.issueId) params.set("issue", selected.issueId);
    if (overrides.unit) params.set("unit", overrides.unit);
    if (overrides.pair) params.set("pair", overrides.pair);
    return `/analysis?${params.toString()}#pair-conclusion`;
  };

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">手法比較・不確実性</h1>
        </div>
        <ScreenLead>結論・意思決定への含意・数値寄与・残差を、この画面だけで確認します</ScreenLead>
      </div>

      <p className="page-back page-back--top">
        <Link href="/valuation#representative-selection">← 価値の算定へ戻る</Link>
      </p>

      {selected && (
        <Card
          id="pair-comparison"
          title="確認中の評価対象"
          subtitle={selected.label}
          headExtra={selected.ratio && selected.ratio > 1.5 ? <Tag variant="warn">最大{selected.ratio.toFixed(1)}倍</Tag> : undefined}
        >
          <div className="detail-actions" aria-label="関連画面">
            {selected.issueId && <Link href={`/valuation/${encodeURIComponent(selected.issueId)}`}>代表値を選ぶ</Link>}
            {selected.issueId && <Link href={`/evidence?issue=${encodeURIComponent(selected.issueId)}`}>入力根拠を見る</Link>}
          </div>

          {breakdownEntries.length > 0 && (
            <div className="selector-pills" aria-label="分析単位の切替" style={{ marginTop: 10 }}>
              <Link href={issueHref({ unit: "cross" })} className={`pill-btn pill-btn--sm${unit === "cross" ? " pill-btn--accent" : ""}`}>
                手法間で比較
              </Link>
              <Link href={issueHref({ unit: "breakdown" })} className={`pill-btn pill-btn--sm${unit === "breakdown" ? " pill-btn--accent" : ""}`}>
                同一手法の内訳
              </Link>
            </div>
          )}

          {unit === "cross" && crossEntries.length > 1 && (
            <div className="selector-pills" aria-label="比較する手法ペア" style={{ marginTop: 10 }}>
              {crossEntries.map(({ pair, valueConcept }) => {
                const key = crossKey(pair);
                return (
                  <Link
                    key={`${valueConcept}-${key}`}
                    href={issueHref({ unit: "cross", pair: key })}
                    className={`pill-btn pill-btn--sm${selectedCrossEntry && crossKey(selectedCrossEntry.pair) === key ? " pill-btn--accent" : ""}`}
                  >
                    {methodShortLabel(pair.methodIdA)} × {methodShortLabel(pair.methodIdB)}
                  </Link>
                );
              })}
            </div>
          )}

          {unit === "breakdown" && breakdownEntries.length > 1 && (
            <div className="selector-pills" aria-label="内訳分析の切替" style={{ marginTop: 10 }}>
              {breakdownEntries.map(({ analysis }) => {
                const key = breakdownKey(analysis);
                return (
                  <Link
                    key={key}
                    href={issueHref({ unit: "breakdown", pair: key })}
                    className={`pill-btn pill-btn--sm${selectedBreakdownEntry && breakdownKey(selectedBreakdownEntry.analysis) === key ? " pill-btn--accent" : ""}`}
                  >
                    {methodLabel(analysis.parentMethodId)}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {unit === "cross" && selectedCrossEntry && (
        <CrossMethodPairView pair={selectedCrossEntry.pair} valueConcept={selectedCrossEntry.valueConcept} records={records} scale={scale} />
      )}
      {unit === "cross" && !selectedCrossEntry && (
        <Card title="手法間ペアがありません">
          <p className="tooltip-note">この評価対象には比較できる手法間ペアがありません。</p>
        </Card>
      )}

      {unit === "breakdown" && selectedBreakdownEntry && (
        <BreakdownAnalysisView analysis={selectedBreakdownEntry.analysis} scale={scale} />
      )}
      {unit === "breakdown" && !selectedBreakdownEntry && (
        <Card title="内訳分析がありません">
          <p className="tooltip-note">この評価対象には同一手法の内訳分析がありません。</p>
        </Card>
      )}

      <Card title="評価対象を切り替える" padBody={false}>
        <TableScroll label="手法間の差が大きい順の評価対象">
          <table className="data-table">
            <caption className="sr-only">手法間の差が大きい順の評価対象一覧</caption>
            <thead><tr><th scope="col">評価対象</th><th scope="col">最大差</th><th scope="col">価値概念の扱い</th><th scope="col">操作</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td className="num">{row.ratio ? `${row.ratio.toFixed(1)}倍` : "倍率なし"}</td>
                  <td>{row.hasCrossGroup ? <Tag variant="welfare">交換価値と厚生価値は分離</Tag> : <Tag variant="neutral">同一概念内</Tag>}</td>
                  <td>{row.issueId && <Link href={`/analysis?issue=${encodeURIComponent(row.issueId)}#pair-comparison`} className="pill-btn pill-btn--sm">分析する</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>
    </div>
  );
}
