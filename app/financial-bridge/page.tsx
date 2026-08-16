import Link from "next/link";
import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { deriveOpenTasks } from "@/lib/pipeline/open-tasks";
import { CompanyFinancialsForm } from "./financials-form";
import { buildWaterfallSteps } from "@core/financial-bridge/bridge1";
import { Num, pickYenScale } from "../components/numeric";
import { Card, GuideBox, GuideButton, KV, ScreenLead, Stat, Tag } from "../components/ui";
import { StepNav } from "../components/step-nav";
import { Waterfall } from "../components/charts/Waterfall";

export default async function FinancialBridgePage() {
  const tenantId = await getTenantId();
  const result = await getOrCreateLatestResult(tenantId);
  const { decisions } = result;
  // 入力済みの企業財務データ(未入力ならデモの既定値で計算されている)
  const { companyFinancials } = await loadInteractionState(tenantId);

  if (decisions.length === 0) {
    return (
      <div className="screen">
        <div className="screen__head">
          <div className="screen__title-row">
            <h1 className="screen__title">財務への影響</h1>
          </div>
          <ScreenLead>選んだ代表値が利益・リスクにどう効くかを確認します</ScreenLead>
        </div>
        {/* 空状態の3点セット(指示11):いま何がない/なぜないか/どこで何をするか+リンク */}
        <Card title="財務への影響を試算する対象がまだありません">
          <p style={{ color: "var(--ink-faint)" }}>
            評価対象の絞り込みで課題を「詳細評価」に切り替え、価値の算定と代表値の選択で代表値を選ぶと、
            ここに試算結果が表示されます。
          </p>
          <Link href="/assessment" className="pill-btn pill-btn--sm">
            評価対象の絞り込みへ →
          </Link>
        </Card>
      </div>
    );
  }

  /**
   * レッドフラグ(T-07:固定文言をやめ、実際の計算結果から導出する)。
   * 導出そのものは lib/pipeline/open-tasks.ts に移した(指示13)。この画面と
   * ホームの「次にやること」が同じ関数を参照する。
   */
  const redFlags = deriveOpenTasks(result);

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">財務への影響</h1>
          <GuideButton />
        </div>
        <ScreenLead>選んだ代表値が利益・リスクにどう効くかを確認します</ScreenLead>
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        <GuideBox>
          この画面では、選んだ代表値が財務にどう効くかを読み取ります。<b>1.</b>{" "}
          「自然調整後利益」の右の入力から、自社の財務データ(売上・営業利益など)を登録します → <b>2.</b>{" "}
          報告利益からの調整幅と「期待損失」を確認します → <b>3.</b>{" "}
          「比較先」で、その金額が何と比べて大きいのか(営業利益比・減損テストの前提)を確認します → <b>4.</b>{" "}
          末尾の「重要な論点」に挙がった項目を処理してから「対策と判定」へ進みます。
          社会全体への影響(開示専用の参考値)は別枠で表示し、利益の試算には加算しません。
          この画面の数値は監査済み財務諸表の数値ではなく、管理会計上の参考値(非GAAP指標)です。
          格付・資本コストへの影響を予測・断定することはしません。
        </GuideBox>
      </div>

      {decisions.map(({ siteId, siteName, financialBridge, comparisonTargets }) => {
        const waterfallSteps = buildWaterfallSteps(financialBridge.bridge1);
        const expectedLoss = financialBridge.natureDebt.totalDebt as unknown as number;
        const operatingProfit = financialBridge.bridge1.reportedOperatingProfit as unknown as number;
        const uninternalizedCost = financialBridge.internalizationStatus.uninternalizedCost as unknown as number;
        // 指示09:「期待損失」カード内の未内部化コストと自然債務で単位を揃える(拠点によっては
        // 一方が百万円台・もう一方が億円台になり、そのまま自動判定すると単位が割れる)。
        const expectedLossScale = pickYenScale(uninternalizedCost, expectedLoss);

        return (
          <div key={siteId} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 15, marginBottom: 10 }}>{siteName}</h2>

            <Card
              title="自然調整後利益"
              subtitle="報告財務からの調整"
              headExtra={
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="nongaap" title="監査済み財務諸表の数値ではありません。社内の管理会計上の参考値です">
                    非GAAP指標 ・ 管理会計上の参考値
                  </span>
                  <CompanyFinancialsForm current={companyFinancials} />
                </div>
              }
              foot={`調整幅:報告営業利益比 ${(
                (((financialBridge.bridge1.natureAdjustedOperatingProfit as unknown as number) - operatingProfit) / operatingProfit) *
                100
              ).toFixed(1)}%`}
            >
              <Waterfall steps={waterfallSteps.map((s) => ({ label: s.label, value: s.value as unknown as number, isTotal: s.isTotal }))} />
            </Card>

            <div className="grid-2">
              <Card title="期待損失">
                <KV k="未内部化コスト" v={<Num value={uninternalizedCost} unit="円" scale={expectedLossScale} />} />
                <KV k="内部化率" v={`${(financialBridge.internalizationStatus.internalizationRate * 100).toFixed(1)}%`} />
                <hr className="rule" />
                <KV k="自然債務(期待損失)" v={<Num value={expectedLoss} unit="円" scale={expectedLossScale} />} />
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
                  <p style={{ color: "var(--ink-faint)" }}>この拠点には厚生価値(welfare)のレコードがありません。</p>
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
                <tr key={flag.id}>
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

      <StepNav current="/financial-bridge" result={result} />
    </div>
  );
}
