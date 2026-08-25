import Link from "next/link";
import { listConfirmedDecisionSnapshots } from "@/lib/db/repositories/decision-counts";
import { detectReassessmentAlerts } from "@core/decision/reassessment";
import { loadInteractivePipelineView } from "@/lib/views/pipeline";
import { Num, pickYenScale } from "../components/numeric";
import { Card, GuideBox, GuideButton, ScreenLead, Stat, Tag } from "../components/ui";
import { bindingLabel, formatDominantAssumption, verdictLabel, verdictTagVariant } from "../components/labels";
import { methodLabel } from "../components/method-labels";
import { StepNav } from "../components/step-nav";
import { TaskBanner } from "../components/task-banner";
import { Scatter } from "../components/charts/Scatter";
import { CountermeasureSelector } from "./countermeasure-selector";
import { BindingForm } from "./binding-form";
import { DecisionParametersForm } from "./parameters-form";
import { PipelineWarnings } from "../components/pipeline-warnings";

/**
 * ★判定の意味を一文にする(指示15 → 第4版 D-13で拡張)。
 *
 * **PRISMは投資可否そのものを断定しない**(構想書の規律)。「投資して良い」とは書かず、
 * 「結論(判定)が変わるか」の言い回しに徹する。保留中は本文先頭の first-action
 * (閾値入力の案内)がこの役割を担うため、ここではnullを返す。
 */
function verdictMeaningSentence(verdict: string): string | null {
  if (verdict === "does_not_cross")
    return "自然関連コストを織り込んでも投資判断の結論は変わらない、と確定できました。この課題の追加調査は不要です。";
  if (verdict === "crosses")
    return "自然関連コストを織り込むと、投資の承認ラインを上回るか下回るかが変わる可能性があります。結論を確定するには、幅を支配する前提の詳細調査が必要です。";
  return null;
}

export default async function DecisionPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const { site: siteParam } = await searchParams;
  const { tenantId, result, interactions } = await loadInteractivePipelineView();
  const { decisions } = result;
  // 入力済みの投資判断の前提(フォームの初期値に使う)
  const { decisionParameters } = interactions;

  /**
   * 前提が変わった判定の洗い直し(GAP-20)。
   * 課金対象として確定した時点のスナップショットと、現在の判定を突き合わせる。
   * **システムが過去の判定を書き換えることはしない。**見直しが必要だと伝えるだけ。
   */
  const reassessmentAlerts = detectReassessmentAlerts(
    await listConfirmedDecisionSnapshots(tenantId),
    decisions.map((entry) => ({
      decisionRecordId: entry.decision.decisionRecord.id,
      verdict: entry.decision.decisionRecord.verdict,
      recalculationHash: entry.decision.decisionRecord.recalculationHash,
    }))
  );
  /**
   * 表示先を失ったアラートを黙って消さないための安全弁(指示15)。
   * 第6版D-23で詳細が「選択中の1拠点だけ」の描画になったため、「画面に表示したか」ではなく
   * 「どの拠点の判定にも対応しないか(真のはぐれ)」で判定する。拠点に紐づくアラートは、
   * 選択中の拠点なら判定結果カード直下に、他の拠点ならサマリーテーブルの残タスク列
   * (「判定の見直し」)で伝わる。
   */

  if (decisions.length === 0) {
    return (
      <div className="screen">
        <div className="screen__head">
          <div className="screen__title-row">
            <h1 className="screen__title">対策と判定</h1>
          </div>
          <ScreenLead>対策を選び、投資の結論が変わるかの判定を確定します</ScreenLead>
        </div>
        {/* 空状態の3点セット(指示11):いま何がない/なぜないか/どこで何をするか+リンク */}
        <Card title="対策案を比較する対象がまだありません">
          <p style={{ color: "var(--ink-faint)" }}>
            評価対象の絞り込みで課題を「詳細評価」に切り替え、価値の算定と代表値の選択で代表値を選ぶと、
            ここに判定結果が表示されます。
          </p>
          <Link href="/assessment" className="pill-btn pill-btn--sm">
            評価対象の絞り込みへ →
          </Link>
        </Card>
      </div>
    );
  }

  /**
   * 第4版 D-11:拠点サマリーに出す1行分。判定・選択中の対策・反映先・残タスクを
   * 詳細カード群と同じデータからここで1度だけ導出する。
   */
  const siteRows = decisions.map((entry) => {
    const record = entry.decision.decisionRecord;
    const alerts = reassessmentAlerts.filter((alert) => alert.decisionRecordId === record.id);
    const remaining: string[] = [];
    if (record.verdict === "pending") remaining.push("承認ラインの入力");
    if (record.bindingMechanism.kind === "weak_reference") remaining.push("反映先の決定");
    if (alerts.some((alert) => alert.level === "verdict_changed")) remaining.push("判定の見直し");
    return {
      ...entry,
      record,
      alerts,
      remaining,
      selectedLabel: entry.countermeasureCandidates.find((c) => c.key === entry.selectedCountermeasureKey)?.label ?? "—",
    };
  });

  /** 既定で展開する拠点:残タスクがある先頭の拠点、なければ先頭。URLの?site=を優先。 */
  const defaultOpenSiteId = siteRows.find((row) => row.remaining.length > 0)?.siteId ?? siteRows[0]?.siteId;
  const openSiteId = siteRows.some((row) => row.siteId === siteParam) ? siteParam : defaultOpenSiteId;

  /** どの拠点の判定にも対応しない「真のはぐれ」アラート(D-23。上の安全弁コメント参照)。 */
  const knownDecisionRecordIds = new Set(siteRows.map((row) => row.record.id));
  const orphanAlerts = reassessmentAlerts.filter((alert) => !knownDecisionRecordIds.has(alert.decisionRecordId));

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">対策と判定</h1>
          <GuideButton />
        </div>
        <ScreenLead>対策を選び、投資の結論が変わるかの判定を確定します</ScreenLead>
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        <GuideBox>
          この画面では、投資の承認ラインと照らした判定を確定させます。<b>1.</b>{" "}
          拠点サマリーで判定と残タスクを確認し、対象拠点の詳細を開きます → <b>2.</b>{" "}
          「投資判断の前提」で投資価値(NPV)・割引率・投資の承認ラインを入力します → <b>3.</b>{" "}
          「対策案の比較」で対策を1つ選ぶと、投資対効果が自然への影響を加味して再計算されます → <b>4.</b>{" "}
          「この結果の反映先」で、この結果を社内のどの仕組みで使うかを決めます(変更には理由の入力が必須です) →{" "}
          <b>5.</b> 確定したら「開示への反映」へ進みます。
          {/* D-13:3値の読み方。投資可否は断定しない(「結論が変わるか」の言い回しに徹する)。 */}
          判定は3値です:「結論は変わらない」=自然関連コストを織り込んでも投資判断の結論は変わらないと確定/
          「結論が変わる可能性」=承認ラインを上回るか下回るかが変わりうるため、前提の詳細調査が必要/
          「保留」=承認ラインが未入力のため未確定。未入力の間は、仮の値を置かず判定を保留にします。
          保留を解くには財務・経営企画部門への確認が必要です。
        </GuideBox>
      </div>

      {/* D-01-3:保存済みの操作のうち、今回の計算に反映できなかったものを黙って捨てない。 */}
      <PipelineWarnings warnings={result.warnings} screen="/decision" />

      {/* D-11-1:残タスクの頭出し(最下部までスクロールしなくても見える)。 */}
      <TaskBanner current="/decision" result={result} />

      {/* D-11-3:サマリーが先、詳細は要求時。1拠点1行で判定・対策・反映先・残タスクを見渡す。 */}
      <Card
        id="site-summary"
        title="拠点サマリー"
        subtitle="1拠点1行。行の「詳細」から下の拠点別詳細が開きます"
        padBody={false}
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>拠点</th>
              <th>判定</th>
              <th>選択中の対策</th>
              <th>反映先</th>
              <th>残タスク</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {siteRows.map((row) => (
              <tr key={row.siteId} style={row.siteId === openSiteId ? { background: "var(--accent-soft)" } : undefined}>
                <td>
                  <b>{row.siteName}</b>
                </td>
                <td>
                  <Tag variant={verdictTagVariant(row.record.verdict)}>
                    {row.record.verdict === "pending" ? "保留中" : verdictLabel(row.record.verdict)}
                  </Tag>
                </td>
                <td>{row.selectedLabel}</td>
                <td style={{ fontSize: 12 }}>{bindingLabel(row.record.bindingMechanism.kind)}</td>
                <td style={{ fontSize: 12 }}>{row.remaining.length > 0 ? row.remaining.join("・") : "—"}</td>
                <td>
                  <Link
                    href={`/decision?site=${encodeURIComponent(row.siteId)}#site-${row.siteId}`}
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
        拠点別詳細(D-11 → 第6版D-23で改稿)。**選択中の1拠点だけを描画する。**
        以前は全拠点分を`<details>`(既定は閉)でDOMに載せていたが、100拠点では
        対策比較テーブル・散布図×100がHTMLに含まれ、畳んであっても破綻する。
        他の拠点はサマリーテーブルの行リンク(?site=...)から開く。
      */}
      {siteRows
        .filter((row) => row.siteId === openSiteId)
        .map(({ siteId, siteName, decision, countermeasureCandidates, selectedCountermeasureKey, alerts }) => {
        const record = decision.decisionRecord;
        const threshold = record.approvalThreshold === "pending" ? null : (record.approvalThreshold.value);
        /**
         * 「投資1億円あたり」に揃える(指示09)。100_000_000円=1億円。
         *
         * 第5版レビュー(2026-08-17):**通常NPV(全候補共通の巨大な定数)を含む絶対値**で
         * 割っていたため、投資額がわずかな候補(保険契約・監視継続)だけ分母が極小になり、
         * 比率が桁違いに跳ね上がっていた(例:site-042で「監視継続」は2,400億/投資1億円、
         * 「効率化投資」は15億/投資1億円 —— 300倍以上の差)。線形軸では他候補がすべて
         * 原点付近に押しつぶされ、比較として機能しない。**その対策案が通常NPVに対して
         * 追加でもたらす分(natureAdjustedNpv − baselineNpv)**を使うべきで、これなら
         * 「対策を実施しない」案は自然に0(追加投資も追加効果もない)に収まる。
         */
        const invPerOku = (c: (typeof countermeasureCandidates)[number]) => {
          const invest = c.investmentCost.initial + c.investmentCost.recurring;
          if (invest === 0) return 0;
          const npv = c.decisionRecord.natureAdjustedNpv.central;
          const baseline = c.decisionRecord.baselineNpv.value;
          return ((npv - baseline) / invest) * 100_000_000;
        };
        const avoidedPerOku = (c: (typeof countermeasureCandidates)[number]) => {
          const invest = c.investmentCost.initial + c.investmentCost.recurring;
          if (invest === 0) return 0;
          return (c.avoidedPhysicalQuantity / invest) * 100_000_000;
        };
        const meaningSentence = verdictMeaningSentence(record.verdict);
        // 指示09:⑤の対策表で列ごとに単位を揃える(初期投資額は拠点によって百万円台と
        // 億円台が混在し、そのまま自動判定すると同じ列内で単位が割れる)。
        const investInitialScale = pickYenScale(
          ...countermeasureCandidates.map((c) => c.investmentCost.initial)
        );
        const investRecurringScale = pickYenScale(
          ...countermeasureCandidates.map((c) => c.investmentCost.recurring)
        );
        const npvScale = pickYenScale(
          ...countermeasureCandidates.map((c) => c.decisionRecord.natureAdjustedNpv.central)
        );

        return (
          <details key={siteId} id={`site-${siteId}`} className="foldout" open>
            <summary>
              {siteName} の詳細
              <small>判定結果・対策案の比較・結果の反映先 ・ 他の拠点の詳細は上の拠点サマリーの行から開けます</small>
            </summary>
            <div className="foldout__body">
              {/* (1) 判定結果を先頭・大きく(指示15。プロダクトの価値の中心) */}
              <Card
                title="判定結果"
                subtitle={`対象:${countermeasureCandidates.find((c) => c.key === selectedCountermeasureKey)?.label}`}
                headExtra={
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Tag variant={verdictTagVariant(record.verdict)}>
                      {record.verdict === "pending" ? "判定は保留中" : verdictLabel(record.verdict)}
                    </Tag>
                    {/*
                      C-06:保留中は本文先頭の主要ボタンが主導線になるため、ここには出さない
                      (同じフォームを開くボタンを1画面に2つ並べない)。確定後は従来どおり
                      見出し脇の小さな更新ボタンとして残す。
                    */}
                    {record.verdict !== "pending" && (
                      <DecisionParametersForm siteId={siteId} current={decisionParameters.get(siteId)} />
                    )}
                  </div>
                }
              >
                {/*
                  C-06:保留のときは「この画面の最初の仕事は承認基準の入力」であることを本文先頭で示す。
                  M6 D-10(段階的開示)の規律は維持:仮の閾値は置かず、NPVのレンジと自然関連コストは
                  下に通常どおり表示したまま、★判定だけを保留にする。
                  D-13:確定後は判定タグ直後のこの一文が「結論が変わるか」の含意を伝える。
                */}
                {record.verdict === "pending" ? (
                  <div className="first-action">
                    <p className="first-action__text">
                      まず投資の承認ライン(社内で投資が承認される基準の金額)を入力してください(財務・経営企画部門への確認が必要です)。
                      入力すると判定が確定します。分かるまで判定は保留のままです(仮の値は置きません)。
                      保留の間はこの判定を件数に計上しません。
                    </p>
                    <DecisionParametersForm siteId={siteId} current={decisionParameters.get(siteId)} emphasis />
                  </div>
                ) : (
                  meaningSentence && (
                    <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, lineHeight: 1.6 }}>{meaningSentence}</p>
                  )
                )}
                <div className="grid-3">
                  <Stat label="投資の承認ライン" value={threshold !== null ? <Num value={threshold} unit="円" /> : "未入力"} />
                  <Stat
                    label={<span title="投資価値(NPV)に自然関連のコスト・便益を加えた値。この幅が承認ラインと交差するかで判定が決まります">投資価値の幅(自然コスト反映後)</span>}
                    value={
                      <>
                        <Num value={record.natureAdjustedNpv.quantileRange.p5} /> 〜{" "}
                        <Num value={record.natureAdjustedNpv.quantileRange.p95} />
                      </>
                    }
                    unit={`(中心 ${new Intl.NumberFormat("ja-JP").format(record.natureAdjustedNpv.central)})`}
                  />
                  <Stat
                    label="結果の反映先"
                    value={
                      // 生値(weak_reference 等)ではなくBindingFormと同じ日本語ラベルを出す(指示06)。
                      // 文なので、数値用の等幅20pxではなく本文サイズで表示する。
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, lineHeight: 1.5 }}>
                        {bindingLabel(record.bindingMechanism.kind)}
                      </span>
                    }
                  />
                </div>
                {record.deepDiveRecommendation && (
                  // B-04(点検分):coreの推奨文は先頭に内部の手法ID(例:replacement-cost)が
                  // そのまま出るため、③と同じmethodLabel辞書で日本語ラベルに差し替える。
                  <p className="tooltip-note">
                    詳細評価推奨:{formatDominantAssumption(record.deepDiveRecommendation.dominantAssumption, methodLabel)}
                  </p>
                )}
              </Card>

              {/*
                「前提が変わった判定」アラートは判定結果カードの直下(指示15。見落とさない位置)。
                GAP-20:過去の判定は書き換えず、見直しが必要かどうかを伝えるだけ。
              */}
              {alerts.length > 0 && (
                <Card
                  title="前提が変わった判定"
                  padBody={false}
                  foot="過去の判定は書き換えていません。見直しが必要かどうかは利用者の判断です"
                >
                  <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {alerts.map((alert, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <Tag variant={alert.level === "verdict_changed" ? "warn" : "neutral"}>
                          {alert.level === "verdict_changed"
                            ? "判定が変わった"
                            : alert.level === "verdict_resolved"
                              ? "判定が確定した"
                              : "前提が変わった"}
                        </Tag>
                        <span style={{ fontSize: 12.5 }}>{alert.message}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* (2) 対策案の比較:表→散布図の順(指示15) */}
              <Card
                title="対策案の比較"
                foot="縦軸:投資1億円あたりの回避物理量 ・ 横軸:投資1億円あたりの追加リターン(投資価値の純増)。「対策を実施しない」案は追加投資も追加効果もないため原点付近になります"
              >
                <table className="data-table" style={{ margin: "0 0 16px" }}>
                  <thead>
                    <tr>
                      <th>対策</th>
                      <th>投資額</th>
                      <th>回避物理量/年</th>
                      <th title="投資価値(NPV)に自然関連のコスト・便益を加えた値と、その判定">投資価値(反映後)と判定</th>
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
                            <Num value={c.investmentCost.initial} unit="円" scale={investInitialScale} />(初期) /{" "}
                            <Num value={c.investmentCost.recurring} unit="円/年" scale={investRecurringScale} />
                          </td>
                          <td className="num">
                            <Num value={c.avoidedPhysicalQuantity} unit="m3" />
                          </td>
                          <td className="num" style={{ fontWeight: 700 }}>
                            <Num value={c.decisionRecord.natureAdjustedNpv.central} unit="円" scale={npvScale} />(
                            {verdictLabel(c.decisionRecord.verdict)})
                          </td>
                          <td>
                            <CountermeasureSelector siteId={siteId} candidateKey={c.key} selected={selected} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <Scatter
                  points={countermeasureCandidates.map((c) => ({
                    x: invPerOku(c),
                    y: avoidedPerOku(c),
                    label: c.label,
                    color: c.key === selectedCountermeasureKey ? "#33564A" : "#8B8F86",
                  }))}
                  xLabel="投資1億円あたりの追加リターン"
                  yLabel="投資1億円あたりの回避物理量"
                />
              </Card>

              {/* (3) この結果の反映先(指示15) */}
              <Card title="この結果の反映先">
                <BindingForm siteId={siteId} currentKind={record.bindingMechanism.kind} />
                {record.bindingMechanismHistory.length > 0 && (
                  <div style={{ marginTop: 16, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
                    <div className="section-label">反映先の変更履歴</div>
                    {record.bindingMechanismHistory.map((h, i) => (
                      <p key={i} style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                        {h.changedAt.slice(0, 10)}: {bindingLabel(h.previousMechanism.kind)} →{" "}
                        {bindingLabel(h.newMechanism.kind)}(理由:{h.reason})
                      </p>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </details>
        );
      })}

      {/*
        GAP-20:どの拠点の判定にも対応しないアラート(例:対象拠点が詳細評価から外れた等)を
        黙って消さないための安全弁。拠点に紐づくアラートは、判定結果カード直下(選択中の拠点)
        またはサマリーテーブルの残タスク列(その他の拠点)で伝わる(D-23)。
      */}
      {orphanAlerts.length > 0 && (
        <Card
          title="前提が変わった判定(その他)"
          padBody={false}
          foot="過去の判定は書き換えていません。見直しが必要かどうかは利用者の判断です"
        >
          <table className="data-table">
            <tbody>
              {orphanAlerts
                .map((alert) => (
                  <tr key={alert.decisionRecordId}>
                    <td>
                      <Tag variant={alert.level === "verdict_changed" ? "warn" : "neutral"}>
                        {alert.level === "verdict_changed"
                          ? "判定が変わった"
                          : alert.level === "verdict_resolved"
                            ? "判定が確定した"
                            : "前提が変わった"}
                      </Tag>
                    </td>
                    <td className="num" style={{ fontSize: 11 }}>
                      {alert.decisionRecordId}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{alert.message}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}

      <StepNav current="/decision" result={result} />
    </div>
  );
}
