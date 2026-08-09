import { getDefaultTenantId } from "@/lib/db/client";
import { listDecisionCounts } from "@/lib/db/repositories/decision-counts";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { Num } from "../components/numeric";
import { Card, Guide, Stat, Tag } from "../components/ui";
import { Scatter } from "../components/charts/Scatter";
import { CountermeasureSelector } from "./countermeasure-selector";
import { BindingForm } from "./binding-form";

export default async function DecisionPage() {
  const tenantId = getDefaultTenantId();
  const result = await getOrCreateLatestResult(tenantId);
  const { decisions } = result;
  // 従量課金の根拠(M6 D-8・D-30)。件数だけでなく明細も出す(構想書6.4)。
  const decisionCounts = await listDecisionCounts(tenantId);

  if (decisions.length === 0) {
    return (
      <div className="screen">
        <h1 className="screen__title">対策の検討</h1>
        <p style={{ color: "var(--ink-faint)", marginTop: 12 }}>対象となる交換価値ValuationRecordがないため、DecisionRecordを生成できません。</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">対策の検討</h1>
          <Guide>
            対策案を選ぶと、投資対効果が自然への影響を加味して再計算され、承認基準と照らした判定結果が表示されます。
            基準をまたぐ場合のみ詳しい調査をおすすめします。反映先を選ぶと、この結果を社内のどの仕組みで使うかが変わります。
          </Guide>
        </div>
      </div>

      {decisions.map(({ siteId, siteName, decision, countermeasureCandidates, selectedCountermeasureKey }) => {
        const record = decision.decisionRecord;
        const threshold = record.approvalThreshold === "pending" ? null : (record.approvalThreshold.value as unknown as number);
        const invPer100M = (c: (typeof countermeasureCandidates)[number]) => {
          const invest = c.investmentCost.initial + c.investmentCost.recurring;
          if (invest === 0) return 0;
          const npv = c.decisionRecord.natureAdjustedNpv.central as unknown as number;
          return (npv / invest) * 100_000_000;
        };
        const avoidedPer100M = (c: (typeof countermeasureCandidates)[number]) => {
          const invest = c.investmentCost.initial + c.investmentCost.recurring;
          if (invest === 0) return 0;
          return (c.avoidedPhysicalQuantity / invest) * 100_000_000;
        };

        return (
          <div key={siteId} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 15, marginBottom: 10 }}>{siteName}</h2>

            <Card title="対策案の比較" foot="縦軸:投資額100百万円あたりの回避物理量 ・ 横軸:投資額100百万円あたりの自然調整後NPV">
              <Scatter
                points={countermeasureCandidates.map((c) => ({
                  x: invPer100M(c),
                  y: avoidedPer100M(c),
                  label: c.label,
                  color: c.key === selectedCountermeasureKey ? "#33564A" : "#8B8F86",
                }))}
                xLabel="単位投資あたり財務効果(NPV/100百万円投資)"
                yLabel="単位投資あたり回避物理量(/100百万円投資)"
              />
            </Card>

            <table className="data-table" style={{ margin: "0 0 16px" }}>
              <thead>
                <tr>
                  <th>対策</th>
                  <th>投資額</th>
                  <th>回避物理量/年</th>
                  <th>自然調整後NPV(★判定)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {countermeasureCandidates.map((c) => {
                  const selected = c.key === selectedCountermeasureKey;
                  return (
                    <tr key={c.key} style={selected ? { background: "var(--accent-soft)" } : undefined}>
                      <td>
                        <b>{c.label}</b>
                      </td>
                      <td className="num">
                        <Num value={c.investmentCost.initial} unit="円" />(初期) / <Num value={c.investmentCost.recurring} unit="円/年" />
                      </td>
                      <td className="num">
                        <Num value={c.avoidedPhysicalQuantity} unit="m3" />
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        <Num value={c.decisionRecord.natureAdjustedNpv.central as unknown as number} unit="円" />(
                        {c.decisionRecord.verdict})
                      </td>
                      <td>
                        <CountermeasureSelector siteId={siteId} candidateKey={c.key} selected={selected} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <Card
              title="判定結果"
              subtitle={`対象:${countermeasureCandidates.find((c) => c.key === selectedCountermeasureKey)?.label}`}
              headExtra={<Tag variant={record.verdict === "crosses" ? "warn" : "ok"}>{record.verdict === "crosses" ? "承認基準をまたぐ" : record.verdict === "pending" ? "承認基準未設定" : "承認基準をまたがない"}</Tag>}
            >
              <div className="grid-3">
                <Stat label="承認基準" value={threshold !== null ? <Num value={threshold} unit="円" /> : "未設定"} />
                <Stat
                  label="自然調整後NPVの幅"
                  value={
                    <>
                      <Num value={record.natureAdjustedNpv.quantileRange.p5} /> 〜 <Num value={record.natureAdjustedNpv.quantileRange.p95} />
                    </>
                  }
                  unit={`(中心 ${new Intl.NumberFormat("ja-JP").format(record.natureAdjustedNpv.central as unknown as number)})`}
                />
                <Stat label="拘束方式" value={record.bindingMechanism.kind} />
              </div>
              {record.deepDiveRecommendation && (
                <p className="tooltip-note">深掘り推奨:{record.deepDiveRecommendation.dominantAssumption}</p>
              )}
            </Card>

            <Card title="この結果の反映先">
              <BindingForm siteId={siteId} currentKind={record.bindingMechanism.kind} />
              {record.bindingMechanismHistory.length > 0 && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
                  <div className="section-label">反映先の変更履歴</div>
                  {record.bindingMechanismHistory.map((h, i) => (
                    <p key={i} style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {h.changedAt.slice(0, 10)}: {h.previousMechanism.kind} → {h.newMechanism.kind}(理由:{h.reason})
                    </p>
                  ))}
                </div>
              )}
            </Card>
          </div>
        );
      })}

      {/*
        M6 D-8 / D-30:従量課金は「判定超過」1本のみで、結論の向きを問わず一律。
        構想書6.4が「課金の発生根拠が顧客にとって説明可能である」ことを設計要件としているため、
        件数だけでなく、どの判定がいつ数えられたかの明細も出す。
      */}
      <Card
        title="判定件数"
        subtitle="従量課金の根拠"
        padBody={false}
        foot="判定が確定した時点で1件。結論の向き(またぐ/またがない)は課金に影響しません。未確定(pending)は数えません"
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
                  <td>{entry.siteId ?? "—"}</td>
                  <td>{entry.verdict === "crosses" ? "基準をまたぐ" : "基準をまたがない"}</td>
                  <td className="num" style={{ fontSize: 11 }}>
                    {entry.countedAt.slice(0, 16).replace("T", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
