import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPipelineView } from "@/lib/views/pipeline";
import { maxDivergenceRatio, pairDivergenceRatio } from "@/lib/pipeline/open-tasks";
import { Card, ScreenLead, Stat, TableScroll, Tag } from "../components/ui";
import { Num, pickYenScale } from "../components/numeric";
import { decompositionFactorLabel, materialIssueLabel } from "../components/labels";
import { methodLabel, methodShortLabel, withMethodLabelsInText } from "../components/method-labels";
import { readablePairNarrative } from "../valuation/view-model";

export const metadata: Metadata = {
  title: "手法比較・不確実性 | PRISM",
};

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ issue?: string; pair?: string }>;
}) {
  const { issue: issueParam, pair: pairParam } = await searchParams;
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
  const pairs = selected?.decomposition.groups.flatMap((group) =>
    group.pairwiseDecompositions.map((pair) => ({ valueConcept: group.valueConcept, pair }))
  ) ?? [];
  const pairKey = (pair: (typeof pairs)[number]["pair"]) => `${pair.methodIdA}~${pair.methodIdB}`;
  if (pairParam && !pairs.some(({ pair }) => pairKey(pair) === pairParam)) notFound();
  const selectedPair = pairs.find(({ pair }) => pairKey(pair) === pairParam) ??
    pairs.reduce<(typeof pairs)[number] | undefined>((best, candidate) => {
      if (!best) return candidate;
      return (pairDivergenceRatio(candidate.pair) ?? 0) > (pairDivergenceRatio(best.pair) ?? 0) ? candidate : best;
    }, undefined);
  const records = selected?.issueId ? result.valuation.valuationRecordsByMaterialIssue[selected.issueId] ?? [] : [];
  const selectedRecords = selectedPair
    ? records.filter((record) => [selectedPair.pair.methodIdA, selectedPair.pair.methodIdB].includes(record.methodId))
    : [];
  const scale = pickYenScale(
    ...selectedRecords.flatMap((record) => [
      Number(record.centralValue),
      Number(record.quantileRange?.p5 ?? 0),
      Number(record.quantileRange?.p95 ?? 0),
    ])
  );

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">手法比較・不確実性</h1>
        </div>
        <ScreenLead>代表値を決める前に、手法間の差と試算幅の理由を確認します</ScreenLead>
      </div>

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
          {pairs.length > 1 && (
            <div className="selector-pills" aria-label="比較する手法ペア">
              {pairs.map(({ pair, valueConcept }) => {
                const key = pairKey(pair);
                return (
                  <Link
                    key={`${valueConcept}-${key}`}
                    href={`/analysis?issue=${encodeURIComponent(selected.issueId ?? "")}&pair=${encodeURIComponent(key)}#pair-comparison`}
                    className={`pill-btn pill-btn--sm${selectedPair && pairKey(selectedPair.pair) === key ? " pill-btn--accent" : ""}`}
                  >
                    {methodShortLabel(pair.methodIdA)} × {methodShortLabel(pair.methodIdB)}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {selectedPair && (
        <>
          <Card
            title="中心値の差"
            subtitle={`${methodLabel(selectedPair.pair.methodIdA)} と ${methodLabel(selectedPair.pair.methodIdB)}`}
            headExtra={
              <Tag variant={selectedPair.valueConcept === "welfare" ? "welfare" : "exchange"}>
                {selectedPair.valueConcept === "welfare" ? "厚生価値" : "交換価値"}
              </Tag>
            }
          >
            <div className="grid-3">
              {selectedRecords.map((record) => (
                <Stat
                  key={record.id}
                  label={methodShortLabel(record.methodId)}
                  value={<Num value={Number(record.centralValue)} unit="円/年" scale={scale} />}
                />
              ))}
              <Stat
                label="差の倍率"
                value={pairDivergenceRatio(selectedPair.pair) ? `${pairDivergenceRatio(selectedPair.pair)!.toFixed(1)}倍` : "倍率なし"}
              />
            </div>
            <p className="chart-narrative">{withMethodLabelsInText(readablePairNarrative(selectedPair.pair))}</p>
          </Card>

          <Card title="差を生む要因" subtitle="倍率は手法Bを基準にした計算値です" padBody={false}>
            <TableScroll label="手法間差の要因分解">
              <table className="data-table">
                <caption className="sr-only">選択中の手法ペアの要因分解</caption>
                <thead>
                  <tr><th scope="col">要因</th><th scope="col">状態</th><th scope="col">倍率</th><th scope="col">寄与</th></tr>
                </thead>
                <tbody>
                  {selectedPair.pair.contributions.map((contribution) => (
                    <tr key={contribution.factor}>
                      <th scope="row">{decompositionFactorLabel(contribution.factor)}</th>
                      <td>{contribution.status === "decomposed" ? "分解済み" : contribution.exclusionReason ?? "分解不能"}</td>
                      <td className="num">×{Math.abs(contribution.multiplier) < 0.01 ? contribution.multiplier.toPrecision(2) : contribution.multiplier.toFixed(2)}</td>
                      <td className="num">{contribution.shareRatio === null ? "—" : `${Math.round(contribution.shareRatio * 100)}%`}</td>
                    </tr>
                  ))}
                  {selectedPair.pair.contributions.length === 0 && <tr><td colSpan={4}>分解できる要因はありません。</td></tr>}
                </tbody>
              </table>
            </TableScroll>
          </Card>

          <Card title="不確実性の幅" subtitle="出典に幅がない場合は、根拠のないP5・P95を補いません" padBody={false}>
            <TableScroll label="選択中の手法の不確実性レンジ">
              <table className="data-table">
                <caption className="sr-only">選択中の手法の中心値とP5からP95</caption>
                <thead><tr><th scope="col">算定方法</th><th scope="col">P5</th><th scope="col">中心値</th><th scope="col">P95</th></tr></thead>
                <tbody>
                  {selectedRecords.map((record) => (
                    <tr key={record.id}>
                      <th scope="row">{methodLabel(record.methodId)}</th>
                      <td><Num value={Number(record.quantileRange?.p5 ?? record.centralValue)} unit="円/年" scale={scale} /></td>
                      <td><Num value={Number(record.centralValue)} unit="円/年" scale={scale} /></td>
                      <td><Num value={Number(record.quantileRange?.p95 ?? record.centralValue)} unit="円/年" scale={scale} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </Card>
        </>
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
