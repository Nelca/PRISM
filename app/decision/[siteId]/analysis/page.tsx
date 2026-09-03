import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPipelineView } from "@/lib/views/pipeline";
import { bindingLabel, verdictLabel, verdictTagVariant } from "../../../components/labels";
import { Num, pickYenScale } from "../../../components/numeric";
import { Card, ScreenLead, Stat, TableScroll, Tag } from "../../../components/ui";
import { Scatter } from "../../../components/charts/Scatter";
import { SectionNav } from "../../../components/section-nav";

export const metadata: Metadata = { title: "対策・判定の分析 | PRISM" };

export default async function DecisionAnalysisPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const result = await loadPipelineView();
  const entry = result.decisions.find((decision) => decision.siteId === siteId);
  if (!entry) notFound();

  const { decision, countermeasureCandidates, selectedCountermeasureKey, siteName } = entry;
  const record = decision.decisionRecord;
  const threshold = record.approvalThreshold === "pending" ? null : Number(record.approvalThreshold.value);
  const scale = pickYenScale(...countermeasureCandidates.map((candidate) => Number(candidate.decisionRecord.natureAdjustedNpv.central)));
  const investment = (candidate: (typeof countermeasureCandidates)[number]) =>
    Number(candidate.investmentCost.initial) + Number(candidate.investmentCost.recurring);
  const returnPerOku = (candidate: (typeof countermeasureCandidates)[number]) => {
    const amount = investment(candidate);
    return amount === 0 ? 0 : ((Number(candidate.decisionRecord.natureAdjustedNpv.central) - Number(candidate.decisionRecord.baselineNpv.value)) / amount) * 100_000_000;
  };
  const avoidedPerOku = (candidate: (typeof countermeasureCandidates)[number]) => {
    const amount = investment(candidate);
    return amount === 0 ? 0 : (Number(candidate.avoidedPhysicalQuantity) / amount) * 100_000_000;
  };

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row"><h1 className="screen__title">{siteName}の判定分析</h1></div>
        <ScreenLead>対策候補の比較と、確定済み判定の前提を読み取り専用で確認します</ScreenLead>
        <p className="page-back"><Link href={`/decision/${encodeURIComponent(siteId)}`}>← 判定の編集へ戻る</Link></p>
      </div>

      <SectionNav
        label={`${siteName}の判定内の画面`}
        items={[
          {
            href: `/decision/${encodeURIComponent(siteId)}`,
            label: "判定を編集",
            description: "前提・対策・反映先を変更",
            active: false,
          },
          {
            href: `/decision/${encodeURIComponent(siteId)}/analysis`,
            label: "比較分析",
            description: "回避量と追加リターンを確認",
            active: true,
          },
        ]}
      />

      <Card title="現在の判定" headExtra={<Tag variant={verdictTagVariant(record.verdict)}>{record.verdict === "pending" ? "保留中" : verdictLabel(record.verdict)}</Tag>}>
        <div className="grid-3">
          <Stat label="投資の承認ライン" value={threshold === null ? "未入力" : <Num value={threshold} unit="円" />} />
          <Stat label="自然コスト反映後NPV" value={<Num value={Number(record.natureAdjustedNpv.central)} unit="円" scale={scale} />} />
          <Stat label="結果の反映先" value={<span style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>{bindingLabel(record.bindingMechanism.kind)}</span>} />
        </div>
      </Card>

      <Card title="対策候補の比較" subtitle="選択操作は拠点の判定画面で行います" padBody={false}>
        <TableScroll label="対策候補ごとの投資額と判定">
          <table className="data-table">
            <caption className="sr-only">対策候補ごとの投資額、回避物理量、自然コスト反映後NPV、判定</caption>
            <thead><tr><th scope="col">対策</th><th scope="col">投資額</th><th scope="col">回避物理量</th><th scope="col">NPVと判定</th></tr></thead>
            <tbody>
              {countermeasureCandidates.map((candidate) => (
                <tr key={candidate.key} style={candidate.key === selectedCountermeasureKey ? { background: "var(--accent-soft)" } : undefined}>
                  <th scope="row">{candidate.label}{candidate.key === selectedCountermeasureKey && <span className="cell-note">選択中</span>}</th>
                  <td><Num value={investment(candidate)} unit="円" /></td>
                  <td><Num value={Number(candidate.avoidedPhysicalQuantity)} unit="m3" /></td>
                  <td><Num value={Number(candidate.decisionRecord.natureAdjustedNpv.central)} unit="円" scale={scale} /> ・ {verdictLabel(candidate.decisionRecord.verdict)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        <div style={{ padding: 18 }}>
          <Scatter
            points={countermeasureCandidates.map((candidate) => ({
              x: returnPerOku(candidate),
              y: avoidedPerOku(candidate),
              label: candidate.label,
              color: candidate.key === selectedCountermeasureKey ? "#2F68F6" : "#8B8F86",
            }))}
            xLabel="投資1億円あたりの追加リターン"
            yLabel="投資1億円あたりの回避物理量"
          />
        </div>
      </Card>

      <Card title="反映先の履歴">
        {record.bindingMechanismHistory.length === 0 ? <p className="empty-state">反映先の変更履歴はありません。</p> : record.bindingMechanismHistory.map((history, index) => (
          <p key={`${history.changedAt}-${index}`} className="tooltip-note">
            {history.changedAt.slice(0, 10)}: {bindingLabel(history.previousMechanism.kind)} → {bindingLabel(history.newMechanism.kind)}（{history.reason}）
          </p>
        ))}
      </Card>
    </div>
  );
}
