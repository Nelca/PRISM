import Link from "next/link";
import { getTenantId } from "@/lib/db/client";
import { loadInteractionState } from "@/lib/db/repositories/interactions";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { deriveMoneySummary, deriveOpenTasks } from "@/lib/pipeline/open-tasks";
import { CompanyFinancialsForm } from "./financials-form";
import { buildWaterfallSteps } from "@core/financial-bridge/bridge1";
import { Num, pickYenScale } from "../components/numeric";
import { Card, GuideBox, GuideButton, KV, ScreenLead, Stat, Tag, Term } from "../components/ui";
import { financialDisplayLabel, financialTermNote } from "../components/labels";
import { StepNav } from "../components/step-nav";
import { TaskBanner } from "../components/task-banner";
import { Waterfall } from "../components/charts/Waterfall";
import { PipelineWarnings } from "../components/pipeline-warnings";

/** D-12:辞書に必ずある用語。辞書から引けなければ用語名をそのままtitleにする(文章を発明しない)。 */
function term(label: string) {
  return <Term note={financialTermNote(label) ?? label}>{label}</Term>;
}

export default async function FinancialBridgePage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const { site: siteParam } = await searchParams;
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

  /**
   * 第4版 D-11:拠点サマリーに出す1行分の値。金額の計算は deriveMoneySummary に集約し、
   * ホームの「金額でみる評価結果」とこの画面のサマリー行で数値が食い違わないようにする。
   */
  const moneyRowBySite = new Map(deriveMoneySummary(result).rows.map((row) => [row.siteId, row]));
  const siteRows = decisions.map((entry) => {
    const money = moneyRowBySite.get(entry.siteId);
    return {
      ...entry,
      adjustmentRatioPct: money?.profitImpactPct ?? 0,
      expectedLoss: money?.natureDebt ?? 0,
      impairmentAffected: money?.impairmentAffected ?? false,
    };
  });

  /**
   * 既定で展開する「最重要拠点」:減損テストの前提に抵触している拠点があればその先頭、
   * なければ調整幅(絶対値)が最大の拠点。URLの?site=は明示指定として優先する。
   */
  const defaultOpenSiteId =
    siteRows.find((row) => row.impairmentAffected)?.siteId ??
    [...siteRows].sort((a, b) => Math.abs(b.adjustmentRatioPct) - Math.abs(a.adjustmentRatioPct))[0]?.siteId;
  const openSiteId = siteRows.some((row) => row.siteId === siteParam) ? siteParam : defaultOpenSiteId;

  const expectedLossScale = pickYenScale(...siteRows.map((row) => row.expectedLoss));

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
          上部の「企業全体の財務データ」から、自社の財務データ(売上・営業利益など)を登録します(全拠点の計算に共通で使われます)
          → <b>2.</b> 拠点サマリーで、利益への影響・自然債務・減損リスクを拠点ごとに見比べます → <b>3.</b>{" "}
          気になる拠点の行から詳細を開き、決算値の利益からの調整と「期待損失」、比較先(営業利益比・減損リスク)を確認します →{" "}
          <b>4.</b> 「重要な論点」に挙がった項目を処理してから「対策と判定」へ進みます。
          社会全体への影響(開示専用の参考値)は別枠で表示し、利益の試算には加算しません。
          この画面の数値は決算書の数値ではなく、社内試算値(参考値)です。
          格付・資本コストへの影響を予測・断定することはしません。
        </GuideBox>
      </div>

      {/* D-01-3:保存済みの操作のうち、今回の計算に反映できなかったものを黙って捨てない。 */}
      <PipelineWarnings warnings={result.warnings} screen="/financial-bridge" />

      {/* D-11-1:残タスクの頭出し(最下部までスクロールしなくても見える)。 */}
      <TaskBanner current="/financial-bridge" result={result} />

      {/*
        D-10:companyFinancialsはテナント単位の値なのに、入力ボタンが各拠点のカード内にあり、
        拠点ごとに入力できるかのような誤解を招いていた。ページ上部の1箇所に移す。
      */}
      <Card
        title="企業全体の財務データ"
        subtitle="全拠点の計算に共通で使われます"
        headExtra={<CompanyFinancialsForm current={companyFinancials} />}
      >
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>
          営業利益(決算値)・内部化済みコスト・減損の目安額・信用指標は企業単位の値です。
          {companyFinancials
            ? "入力済みの実データで計算しています。"
            : "未入力のため、デモの既定値で計算しています(入力するとこの画面全体が再計算されます)。"}
        </p>
      </Card>

      {/*
        D-11-2:サマリー(やるべきこと)が先、詳細は要求時。
        1拠点1行のサマリーテーブルを先頭に置き、詳細は下の折りたたみから開く。
        拠点が100件規模になっても、この表と「重要な論点」までで全体が判断できる。
      */}
      <Card
        id="site-summary"
        title="拠点サマリー"
        subtitle="1拠点1行。行の「詳細」から下の拠点別詳細が開きます"
        padBody={false}
        foot="利益への影響:自然関連コストを織り込んだときの、営業利益(決算値)からの変化率(マイナスは利益の下振れ)"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>拠点</th>
              <th>{term("利益への影響")}</th>
              <th>{term("自然債務(期待損失)")}</th>
              <th>{term("減損リスク")}</th>
              <th>重要な論点</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {siteRows.map((row) => (
              <tr key={row.siteId} style={row.siteId === openSiteId ? { background: "var(--accent-soft)" } : undefined}>
                <td>
                  <b>{row.siteName}</b>
                </td>
                <td className="num">{`${row.adjustmentRatioPct >= 0 ? "+" : ""}${row.adjustmentRatioPct.toFixed(1)}%`}</td>
                <td className="num">
                  <Num value={row.expectedLoss} unit="円" scale={expectedLossScale} />
                </td>
                <td>
                  {row.impairmentAffected ? <Tag variant="warn">見直しが必要</Tag> : <Tag variant="neutral">範囲内</Tag>}
                </td>
                <td>{row.impairmentAffected ? <Tag variant="warn">あり</Tag> : "—"}</td>
                <td>
                  <Link
                    href={`/financial-bridge?site=${encodeURIComponent(row.siteId)}#site-${row.siteId}`}
                    className="pill-btn pill-btn--sm"
                  >
                    詳細 →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/*
        T-07:以前はデータに関係なく常に表示される固定文言だった。実データでは
        レッドフラグの信頼性を損なうため、すべて実際の計算結果から導出する。
        該当がなければ行を出さない。D-11:最下部からサマリー直後(上部)へ移動。
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

      {/*
        拠点別詳細(D-11 → 第6版D-23で改稿)。**選択中の1拠点だけを描画する。**
        以前は全拠点分を`<details>`(既定は閉)でDOMに載せていたが、100拠点では
        ウォーターフォールSVG・比較テーブル×100がHTMLに含まれ、畳んであっても
        転送量・描画コストが破綻する。他の拠点はサマリーテーブルの行リンク
        (?site=...)から開く。中身の既存カード群と並び順は維持。
      */}
      {siteRows
        .filter((row) => row.siteId === openSiteId)
        .map(({ siteId, siteName, financialBridge, comparisonTargets }) => {
        const waterfallSteps = buildWaterfallSteps(financialBridge.bridge1);
        const expectedLoss = financialBridge.natureDebt.totalDebt as unknown as number;
        const operatingProfit = financialBridge.bridge1.reportedOperatingProfit as unknown as number;
        const uninternalizedCost = financialBridge.internalizationStatus.uninternalizedCost as unknown as number;
        // 指示09:「期待損失」カード内の未内部化コストと自然債務で単位を揃える(拠点によっては
        // 一方が百万円台・もう一方が億円台になり、そのまま自動判定すると単位が割れる)。
        const lossScale = pickYenScale(uninternalizedCost, expectedLoss);

        return (
          <details key={siteId} id={`site-${siteId}`} className="foldout" open>
            <summary>
              {siteName} の詳細
              <small>自然コスト反映後の利益・期待損失・比較先 ・ 他の拠点の詳細は上の拠点サマリーの行から開けます</small>
            </summary>
            <div className="foldout__body">
              <Card
                title={term("自然コスト反映後の営業利益")}
                subtitle="報告財務からの調整"
                headExtra={
                  <span
                    className="nongaap"
                    title="監査済みの決算書の数値ではなく、PRISMが算出した参考値です(いわゆる非GAAP指標)"
                  >
                    社内試算値(決算数値ではありません)
                  </span>
                }
                foot={`利益への影響:営業利益(決算値)比 ${(
                  (((financialBridge.bridge1.natureAdjustedOperatingProfit as unknown as number) - operatingProfit) /
                    operatingProfit) *
                  100
                ).toFixed(1)}%`}
              >
                <Waterfall
                  steps={waterfallSteps.map((s) => ({ label: financialDisplayLabel(s.label), value: s.value as unknown as number, isTotal: s.isTotal }))}
                />
                {/* D-12:図の中の独自用語はhoverできないため、直下に用語説明を常設する。 */}
                <p className="tooltip-note">
                  {term("依存リスク正常化調整")} ・ {term("将来内部化見込みコスト")}
                  (点線の用語にマウスを載せると説明が出ます)
                </p>
              </Card>

              <div className="grid-2">
                <Card title="期待損失">
                  <KV k={term("未内部化コスト")} v={<Num value={uninternalizedCost} unit="円" scale={lossScale} />} />
                  <KV
                    k={term("内部化率")}
                    v={`${(financialBridge.internalizationStatus.internalizationRate * 100).toFixed(1)}%`}
                  />
                  <hr className="rule" />
                  <KV k={term("自然債務(期待損失)")} v={<Num value={expectedLoss} unit="円" scale={lossScale} />} />
                </Card>

                <Card
                  title="社会全体への影響"
                  subtitle="開示にのみ使用(利益の試算には反映しません)"
                  headExtra={<Tag variant="welfare">投資判断には使用しません</Tag>}
                >
                  {financialBridge.bridge2 ? (
                    <>
                      <Stat
                        label="社会的コスト"
                        value={<Num value={financialBridge.bridge2.socialCost as unknown as number} unit="円/年" />}
                      />
                      <div style={{ marginTop: 10 }}>
                        <KV k="対応率" v={`${(financialBridge.bridge2.internalizationRate * 100).toFixed(1)}%`} />
                      </div>
                      <p className="tooltip-note">この数値は開示の参考情報としてのみ使用され、上の利益の試算には反映されません。</p>
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
                headExtra={
                  <span
                    className="nongaap"
                    title="監査済みの決算書の数値ではなく、PRISMが算出した参考値です(いわゆる非GAAP指標)"
                  >
                    社内試算値
                  </span>
                }
                foot="変化後の比率はPRISMが自然債務・自然コスト反映後の利益から算術で計算したものです"
              >
                <div className="grid-3">
                  <Stat label="期待損失 ÷ 営業利益(決算値)" value={`${(comparisonTargets.operatingProfitRatio * 100).toFixed(2)}%`} />
                  <Stat
                    label={term("減損リスク")}
                    value={comparisonTargets.impairmentTestImpact.changesAssumption ? "見直しが必要" : "範囲内"}
                  />
                  <Stat label={term("格付・資本コスト")} value="定量予測は行いません" />
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
          </details>
        );
      })}

      <StepNav current="/financial-bridge" result={result} />
    </div>
  );
}
