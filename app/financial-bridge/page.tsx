import Link from "next/link";
import { getDefaultTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { buildWaterfallSteps } from "@core/financial-bridge/bridge1";
import { Num } from "../components/numeric";
import { Card, Guide, KV, Stat, Tag } from "../components/ui";
import { Waterfall } from "../components/charts/Waterfall";

export default async function FinancialBridgePage() {
  const result = await getOrCreateLatestResult(getDefaultTenantId());
  const { decisions, disclosure } = result;

  if (decisions.length === 0) {
    return (
      <div className="screen">
        <h1 className="screen__title">財務への影響</h1>
        <p style={{ color: "var(--ink-faint)", marginTop: 12 }}>対象となる交換価値ValuationRecordがありません。</p>
      </div>
    );
  }

  const gapsFound = disclosure.gapFindings.filter((f) => f.gapType !== null).length;

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">財務への影響</h1>
          <Guide>
            選んだ代表値をもとに、報告されている利益への影響を試算します。社会全体への影響(開示専用の参考値)は別枠で表示し、
            利益の試算には加算しません。
          </Guide>
        </div>
      </div>

      {decisions.map(({ siteId, siteName, financialBridge }) => {
        const waterfallSteps = buildWaterfallSteps(financialBridge.bridge1);
        const expectedLoss = financialBridge.natureDebt.breakdown.reduce(
          (sum, b) => sum + (b.discountedAmount as unknown as number),
          0
        );
        const operatingProfit = financialBridge.bridge1.reportedOperatingProfit as unknown as number;

        return (
          <div key={siteId} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 15, marginBottom: 10 }}>{siteName}</h2>

            <Card
              title="自然調整後利益"
              subtitle="報告財務からの調整"
              headExtra={<span className="nongaap">非GAAP指標 ・ 管理会計上の参考値</span>}
              foot={`調整幅:報告営業利益比 ${(
                (((financialBridge.bridge1.natureAdjustedOperatingProfit as unknown as number) - operatingProfit) / operatingProfit) *
                100
              ).toFixed(1)}%`}
            >
              <Waterfall steps={waterfallSteps.map((s) => ({ label: s.label, value: s.value as unknown as number, isTotal: s.isTotal }))} />
            </Card>

            <div className="grid-2">
              <Card title="期待損失">
                <KV k="未内部化コスト" v={<Num value={financialBridge.internalizationStatus.uninternalizedCost as unknown as number} unit="円" />} />
                <KV k="内部化率" v={`${(financialBridge.internalizationStatus.internalizationRate * 100).toFixed(1)}%`} />
                <hr className="rule" />
                <KV k="自然債務(期待損失)" v={<Num value={expectedLoss} unit="円" />} />
              </Card>

              <Card title="社会全体への影響" subtitle="開示にのみ使用(利益の試算には反映しません)" headExtra={<Tag variant="welfare">投資判断には使用しません</Tag>}>
                {financialBridge.bridge2 ? (
                  <>
                    <Stat label="社会的コスト" value={<Num value={financialBridge.bridge2.socialCost as unknown as number} unit="円/年" />} />
                    <div style={{ marginTop: 10 }}>
                      <KV k="対応率" v={`${(financialBridge.bridge2.internalizationRate * 100).toFixed(1)}%`} />
                    </div>
                    <p className="tooltip-note">この数値は開示の参考情報としてのみ使用され、上の自然調整後利益には反映されません。</p>
                  </>
                ) : (
                  <p style={{ color: "var(--ink-faint)" }}>この拠点はlime3-water(厚生価値)レコードがありません。</p>
                )}
              </Card>
            </div>
          </div>
        );
      })}

      <Card title="重要な論点" padBody={false}>
        <table className="data-table">
          <tbody>
            <tr>
              <td>
                <Tag variant="warn">中</Tag>
              </td>
              <td>算定方法によって試算結果に差がある。代表値の選択理由を確認してください。</td>
              <td>
                <Link href="/decomposition" className="pill-btn pill-btn--sm">
                  確認する →
                </Link>
              </td>
            </tr>
            {gapsFound > 0 && (
              <tr>
                <td>
                  <Tag variant="warn">中</Tag>
                </td>
                <td>開示文言{gapsFound}件で、記載内容に対する根拠が不足している。</td>
                <td>
                  <Link href="/disclosure" className="pill-btn pill-btn--sm">
                    確認する →
                  </Link>
                </td>
              </tr>
            )}
            <tr>
              <td>
                <Tag variant="tierB">中</Tag>
              </td>
              <td>対策案の投資判断がまだ反映先を確定していない可能性がある。</td>
              <td>
                <Link href="/decision" className="pill-btn pill-btn--sm">
                  対策を検討 →
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
