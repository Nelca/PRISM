import Link from "next/link";
import type { Metadata } from "next";
import { deriveMoneySummary, deriveOpenTasks, joinSiteNames, sitesWithDegenerateRepresentative } from "@/lib/pipeline/open-tasks";
import { loadInteractivePipelineView } from "@/lib/views/pipeline";
import { CompanyFinancialsForm } from "./financials-form";
import { buildWaterfallSteps } from "@core/financial-bridge/bridge1";
import { Num, pickYenScale } from "../components/numeric";
import { Card, GuideBox, GuideButton, KV, ScreenLead, Stat, Tag, Term } from "../components/ui";
import { categoryLabel, financialDisplayLabel, financialTermNote, materialIssueLabel } from "../components/labels";
import { StepNav } from "../components/step-nav";
import { TaskBanner } from "../components/task-banner";
import { Waterfall } from "../components/charts/Waterfall";
import { PipelineWarnings } from "../components/pipeline-warnings";

export const metadata: Metadata = {
  title: "財務への影響 | PRISM",
};

/** D-12:辞書に必ずある用語。辞書から引けなければ用語名をそのままtitleにする(文章を発明しない)。 */
function term(label: string) {
  return <Term note={financialTermNote(label) ?? label}>{label}</Term>;
}

export default async function FinancialBridgePage({
  searchParams,
  detailOnly = false,
}: {
  searchParams: Promise<{ site?: string }>;
  detailOnly?: boolean;
}) {
  const { site: siteParam } = await searchParams;
  const { result, interactions } = await loadInteractivePipelineView();
  const { decisions } = result;
  const siteNameById = new Map(result.assessment.sites.map((site) => [site.id, site.name]));
  const welfareOnlyIssues = result.assessment.materialIssues.filter((issue) => {
    const records = result.valuation.valuationRecordsByMaterialIssue[issue.id] ?? [];
    return records.length > 0 && records.every((record) => record.valueConcept === "welfare");
  });
  // 入力済みの企業財務データ(未入力ならデモの既定値で計算されている)
  const { companyFinancials } = interactions;

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
        {welfareOnlyIssues.length > 0 && (
          <Card title="社会的厚生価値の参考結果" headExtra={<Tag variant="welfare">NPV・ROI対象外</Tag>}>
            <p style={{ margin: 0, color: "var(--ink-soft)" }}>
              追加カテゴリのLIME3結果は社会的な厚生価値です。企業の交換価値が登録されるまで、企業財務への影響は試算しません。
            </p>
          </Card>
        )}
      </div>
    );
  }

  /**
   * レッドフラグ(T-07:固定文言をやめ、実際の計算結果から導出する)。
   * 導出そのものは lib/pipeline/open-tasks.ts に移した(指示13)。この画面と
   * ホームの「次にやること」が同じ関数を参照する。
   */
  const redFlags = deriveOpenTasks(result).filter(
    (task) => task.section === "/valuation" || task.section === "/financial-bridge"
  );

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
  const openSiteName = siteRows.find((row) => row.siteId === openSiteId)?.siteName;

  const expectedLossScale = pickYenScale(...siteRows.map((row) => row.expectedLoss));

  /**
   * 縮退した代表値(中心値0円)が利益への影響をプラス方向に反転させている拠点
   * (2026-08-23レビュー第3回)。判定は `sitesWithDegenerateRepresentative` に集約し、
   * ホームの発見・重要な論点(deriveOpenTasks)と同じ関数を参照する。
   */
  const degenerateSites = sitesWithDegenerateRepresentative(result);

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">{detailOnly && openSiteName ? `${openSiteName}の財務影響` : "財務への影響"}</h1>
          {!detailOnly && <GuideButton />}
        </div>
        <ScreenLead>選んだ代表値が利益・リスクにどう効くかを確認します</ScreenLead>
        {detailOnly && <p className="page-back"><Link href="/financial-bridge">← 拠点一覧へ戻る</Link></p>}
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        {!detailOnly && <GuideBox>
          企業の財務データを登録し、拠点ごとの利益影響、期待損失、減損リスクを確認します。
        </GuideBox>}
      </div>

      {!detailOnly && <>

      {/* D-01-3:保存済みの操作のうち、今回の計算に反映できなかったものを黙って捨てない。 */}
      <PipelineWarnings warnings={result.warnings} screen="/financial-bridge" />

      {/* D-11-1:残タスクの頭出し(最下部までスクロールしなくても見える)。 */}
      <TaskBanner current="/financial-bridge" result={result} />

      {welfareOnlyIssues.length > 0 && (
        <Card
          title="企業財務へ接続していない評価結果"
          subtitle="社会的な厚生価値は企業NPV・ROIには加算しません"
          headExtra={<Tag variant="welfare">参考値</Tag>}
        >
          <p style={{ marginTop: 0, color: "var(--ink-soft)" }}>
            次の追加カテゴリはLIME3による厚生価値のみです。顧客が保有する回避費用など、企業の交換価値入力が登録されるまで、利益・自然債務・減損リスクには反映しません。
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {welfareOnlyIssues.map((issue) => (
              <li key={issue.id}>
                <Link href={`/valuation/${encodeURIComponent(issue.id)}`}>
                  {materialIssueLabel(siteNameById.get(issue.siteId), issue.impactCategory, issue.id)}
                </Link>
                <span className="cell-note">{categoryLabel(issue.impactCategory)}の社会的影響</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
        2026-08-23レビュー第3回:代表値の中心値が0円(IFVIの水ストレス係数など)だと、
        未内部化コストが負になり、下の拠点サマリーの「利益への影響」がプラス(改善方向)に
        反転して表示される。これは自然コストの織り込みによる改善ではなく代表値選択の問題
        なので、サマリーを読む前に気づけるよう直上に警告を出す。判定は
        `sitesWithDegenerateRepresentative` を⑤の重要な論点(redFlags)と共有する。
      */}
      {degenerateSites.length > 0 && (
        <div className="pipeline-warning" role="status">
          <div className="pipeline-warning__title">利益への影響がプラスに出ている拠点があります</div>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink)" }}>
            該当:{joinSiteNames(degenerateSites.map((s) => s.siteName))}。代表値の中心値が0円(または試算値が内部化済みコストを下回る)ためで、
            自然コストの織り込みによる利益改善を意味しません。{" "}
            <Link href="/valuation#representative-selection">価値の算定で代表値を確認してください →</Link>
          </p>
        </div>
      )}

      {/*
        D-11-2:サマリー(やるべきこと)が先、詳細は要求時。
        1拠点1行のサマリーテーブルを先頭に置き、詳細は下の折りたたみから開く。
        拠点が100件規模になっても、この表と「重要な論点」までで全体が判断できる。
      */}
      <Card
        id="site-summary"
        title="拠点サマリー"
        subtitle="行の「詳細」から拠点別の内訳へ進みます"
        padBody={false}
        foot="利益への影響:自然関連コストを織り込んだときの、営業利益(決算値)からの変化率(マイナスは利益の下振れ)"
      >
        <table className="data-table data-table--linked">
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
              <tr key={row.siteId}>
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
                    href={`/financial-bridge/${encodeURIComponent(row.siteId)}`}
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
      <Card title="財務試算の前提で確認すること" padBody={false} foot="代表値と財務試算に関係する論点だけを表示しています">
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
      </>}

      {/*
        拠点別詳細(D-11 → 第6版D-23で改稿)。**選択中の1拠点だけを描画する。**
        以前は全拠点分を`<details>`(既定は閉)でDOMに載せていたが、100拠点では
        ウォーターフォールSVG・比較テーブル×100がHTMLに含まれ、畳んであっても
        転送量・描画コストが破綻する。他の拠点はサマリーテーブルの行リンク
        (?site=...)から開く。中身の既存カード群と並び順は維持。
      */}
      {detailOnly && siteRows
        .filter((row) => row.siteId === openSiteId)
        .map(({ siteId, financialBridge, comparisonTargets }) => {
        const waterfallSteps = buildWaterfallSteps(financialBridge.bridge1);
        const expectedLoss = financialBridge.natureDebt.totalDebt;
        const operatingProfit = financialBridge.bridge1.reportedOperatingProfit;
        const uninternalizedCost = financialBridge.internalizationStatus.uninternalizedCost;
        const verifiedBenefit = financialBridge.bridge1.verifiedIncrementalBenefit;
        // 指示09:「期待損失」カード内の未内部化コストと自然債務で単位を揃える(拠点によっては
        // 一方が百万円台・もう一方が億円台になり、そのまま自動判定すると単位が割れる)。
        const lossScale = pickYenScale(uninternalizedCost, expectedLoss, verifiedBenefit);
        const contributionScale = pickYenScale(
          ...financialBridge.contributionBreakdown.flatMap((entry) => [
            entry.grossCost,
            entry.alreadyInternalizedCost,
            entry.uninternalizedCost,
            entry.verifiedIncrementalBenefit,
            entry.natureDebt,
          ])
        );

        return (
          <div key={siteId} id={`site-${siteId}`} className="detail-stack">
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
                  (((financialBridge.bridge1.natureAdjustedOperatingProfit) - operatingProfit) /
                    operatingProfit) *
                  100
                ).toFixed(1)}%`}
              >
                <Waterfall
                  steps={waterfallSteps.map((s) => ({ label: financialDisplayLabel(s.label), value: s.value, isTotal: s.isTotal }))}
                />
                {/* D-12:図の中の独自用語はhoverできないため、直下に用語説明を常設する。 */}
                <p className="tooltip-note">
                  {term("依存リスク正常化調整")} ・ {term("将来内部化見込みコスト")} ・ {term("確認済み増分便益")}
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
                  <KV k={term("確認済み増分便益")} v={<Num value={verifiedBenefit} unit="円" scale={lossScale} />} />
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
                        value={<Num value={financialBridge.bridge2.socialCost} unit="円/年" />}
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

              <Card
                title="財務ブリッジのカテゴリ別内訳"
                subtitle="企業負担額・既計上額・便益を分離し、同じ拠点について1回だけ集約します"
                padBody={false}
                foot="二重計上防止キーと出典ハッシュは保存run・仮定台帳・再計算ハッシュに記録されます"
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>カテゴリ</th>
                      <th>企業負担総額</th>
                      <th>既に利益へ反映済み</th>
                      <th>未内部化コスト</th>
                      <th>確認済み増分便益</th>
                      <th>自然債務</th>
                      <th>基準</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financialBridge.contributionBreakdown.map((entry) => (
                      <tr key={entry.sourceValuationRecordId}>
                        <td>
                          <b>{categoryLabel(entry.category)}</b>
                          {entry.dataVersion && <span className="id-note">{entry.dataVersion}</span>}
                        </td>
                        <td className="num"><Num value={entry.grossCost} unit="円" scale={contributionScale} /></td>
                        <td className="num"><Num value={entry.alreadyInternalizedCost} unit="円" scale={contributionScale} /></td>
                        <td className="num"><Num value={entry.uninternalizedCost} unit="円" scale={contributionScale} /></td>
                        <td className="num"><Num value={entry.verifiedIncrementalBenefit} unit="円" scale={contributionScale} /></td>
                        <td className="num"><Num value={entry.natureDebt} unit="円" scale={contributionScale} /></td>
                        <td>{entry.amountBasis === "annual" ? "年額" : "一時費用"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

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
                          {(change.after - change.before).toFixed(1)}倍)
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

      <StepNav current="/financial-bridge" result={result} />
    </div>
  );
}
