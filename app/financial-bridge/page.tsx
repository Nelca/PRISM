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

  // --- レッドフラグ(T-07:固定文言をやめ、実際の計算結果から導出する) ---
  const redFlags: { text: string; href: string; linkLabel: string }[] = [];

  // 手法間の乖離:実際の分解結果から最大倍率を取る
  const maxRatio = Math.max(
    0,
    ...result.valuation.divergenceDecompositions
      .flatMap((d) => d.groups.flatMap((g) => g.pairwiseDecompositions.map((p) => p.ratio)))
      .filter((r): r is number => r !== null)
  );
  if (maxRatio > 1.5) {
    redFlags.push({
      text: `算定方法によって試算結果に最大${maxRatio.toFixed(1)}倍の差がある。代表値の選択理由を確認してください。`,
      href: "/decomposition",
      linkLabel: "確認する",
    });
  }

  // 代表値が未選択(既定値のまま)の課題があるか
  const unselected = result.valuation.divergenceDecompositions.filter((d) => !d.representativeValueSelection).length;
  if (unselected > 0) {
    redFlags.push({
      text: `${unselected}件の課題で、投資判断に使う代表値がまだ選択されていない(既定値を使用中)。`,
      href: "/decomposition",
      linkLabel: "代表値を選ぶ",
    });
  }

  if (gapsFound > 0) {
    redFlags.push({
      text: `開示文言${gapsFound}件で、記載内容に対する根拠が不足している。`,
      href: "/disclosure",
      linkLabel: "確認する",
    });
  }

  // 拘束方式が「弱」(参考記載)のままの拠点。R-3(単一値方式と同じ運命)への対応。
  const weakBinding = decisions.filter((d) => d.decision.decisionRecord.bindingMechanism.kind === "weak_reference").length;
  if (weakBinding > 0) {
    redFlags.push({
      text: `${weakBinding}件の判定が「稟議書に参考値として記載」のままで、社内制度に拘束されていない。`,
      href: "/decision",
      linkLabel: "反映先を決める",
    });
  }

  // 減損テストの前提を変える拠点があるか(実際の比較先の判定を使う)
  const impairmentAffected = decisions.filter((d) => d.comparisonTargets.impairmentTestImpact.changesAssumption).length;
  if (impairmentAffected > 0) {
    redFlags.push({
      text: `${impairmentAffected}拠点で、自然債務が既存の減損テスト前提の閾値を上回っている。`,
      href: "/decision",
      linkLabel: "対策を検討",
    });
  }

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

      {decisions.map(({ siteId, siteName, financialBridge, comparisonTargets }) => {
        const waterfallSteps = buildWaterfallSteps(financialBridge.bridge1);
        const expectedLoss = financialBridge.natureDebt.totalDebt as unknown as number;
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

            {/*
              M5の位置づけ:金額を単独で出さず、必ず比較先とセットで出す(build-plan §5.6)。
              以前は comparisonTargets を算出しながら画面に一切出していなかった(GAP-10)。
            */}
            <Card
              title="比較先"
              subtitle="この金額が何と比べて大きいのか"
              headExtra={<span className="nongaap">非GAAP指標</span>}
              foot="変化後の比率はPRISMが自然債務・自然調整後利益から算術で計算したものです"
            >
              <div className="grid-3">
                <Stat
                  label="期待損失 ÷ 報告営業利益"
                  value={`${(comparisonTargets.operatingProfitRatio * 100).toFixed(2)}%`}
                />
                <Stat
                  label="減損テストの前提"
                  value={comparisonTargets.impairmentTestImpact.changesAssumption ? "見直しが必要" : "範囲内"}
                />
                <Stat label="格付・資本コスト" value="定量予測は行いません" />
              </div>

              <p className="tooltip-note" style={{ marginTop: 10 }}>
                {comparisonTargets.impairmentTestImpact.details}
              </p>

              <hr className="rule" />
              <div className="section-label">信用格付機関が一般的に参照する財務指標</div>
              {comparisonTargets.ratingCostOfCapitalImpact.ratios.map((change) => (
                <KV
                  key={change.label}
                  k={change.label}
                  v={
                    change.before === null || change.after === null ? (
                      "算出不能(分母が0)"
                    ) : (
                      <>
                        {change.before.toFixed(1)}倍 → {change.after.toFixed(1)}倍(
                        {change.after - change.before >= 0 ? "+" : ""}
                        {(change.after - change.before).toFixed(1)}pt)
                      </>
                    )
                  }
                />
              ))}
              <p className="tooltip-note">
                本システムは、これらの変化が実際の格付・資本コストにどう影響するかを予測・断定するものではありません。
              </p>
            </Card>
          </div>
        );
      })}

      {/*
        T-07:以前はデータに関係なく常に表示される固定文言だった。実データでは
        レッドフラグの信頼性を損なうため、すべて実際の計算結果から導出する。
        該当がなければ行を出さない。
      */}
      <Card title="重要な論点" padBody={false} foot="実際の算定・判定結果から導出しています">
        <table className="data-table">
          <tbody>
            {redFlags.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: "var(--ink-faint)" }}>
                  現時点で確認が必要な論点はありません。
                </td>
              </tr>
            ) : (
              redFlags.map((flag) => (
                <tr key={flag.text}>
                  <td>
                    <Tag variant="warn">中</Tag>
                  </td>
                  <td>{flag.text}</td>
                  <td>
                    <Link href={flag.href} className="pill-btn pill-btn--sm">
                      {flag.linkLabel} →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <p className="footer-note">PRISM design preview — データはすべてデモ用の架空値です。実在の企業を参照しません。</p>
    </div>
  );
}
