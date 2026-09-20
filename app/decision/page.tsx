import Link from "next/link";
import type { Metadata } from "next";
import { listConfirmedDecisionSnapshots } from "@/lib/db/repositories/decision-counts";
import { detectReassessmentAlerts } from "@core/decision/reassessment";
import { loadInteractivePipelineView } from "@/lib/views/pipeline";
import { Num, pickYenScale } from "../components/numeric";
import { Card, GuideBox, GuideButton, ScreenLead, Stat, Tag } from "../components/ui";
import { bindingLabel, categoryLabel, formatDominantAssumption, materialIssueLabel, verdictLabel, verdictTagVariant } from "../components/labels";
import { methodLabel } from "../components/method-labels";
import { StepNav } from "../components/step-nav";
import { TaskBanner } from "../components/task-banner";
import { CountermeasureSelector } from "./countermeasure-selector";
import { BindingForm } from "./binding-form";
import { DecisionParametersForm } from "./parameters-form";
import { PipelineWarnings } from "../components/pipeline-warnings";
import { SectionNav } from "../components/section-nav";

export const metadata: Metadata = {
  title: "対策と判定 | PRISM",
};

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
  detailOnly = false,
}: {
  searchParams: Promise<{ site?: string }>;
  detailOnly?: boolean;
}) {
  const { site: siteParam } = await searchParams;
  const { tenantId, result, interactions } = await loadInteractivePipelineView();
  const { decisions } = result;
  const siteNameById = new Map(result.assessment.sites.map((site) => [site.id, site.name]));
  const welfareOnlyIssues = result.assessment.materialIssues.filter((issue) => {
    const records = result.valuation.valuationRecordsByMaterialIssue[issue.id] ?? [];
    return records.length > 0 && records.every((record) => record.valueConcept === "welfare");
  });
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
          <ScreenLead>拠点ごとに対策と投資の承認ラインを設定し、自然コストを織り込むと結論が変わるか確認します。</ScreenLead>
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
        {welfareOnlyIssues.length > 0 && (
          <Card title="社会的厚生価値の参考結果" headExtra={<Tag variant="welfare">NPV・ROI対象外</Tag>}>
            <p style={{ margin: 0, color: "var(--ink-soft)" }}>
              追加カテゴリのLIME3結果は社会的な厚生価値です。企業の交換価値が登録されるまで、投資判定には使用しません。
            </p>
          </Card>
        )}
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
  const openSiteName = siteRows.find((row) => row.siteId === openSiteId)?.siteName;

  /** どの拠点の判定にも対応しない「真のはぐれ」アラート(D-23。上の安全弁コメント参照)。 */
  const knownDecisionRecordIds = new Set(siteRows.map((row) => row.record.id));
  const orphanAlerts = reassessmentAlerts.filter((alert) => !knownDecisionRecordIds.has(alert.decisionRecordId));

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">{detailOnly && openSiteName ? `${openSiteName}の対策と判定` : "対策と判定"}</h1>
          {!detailOnly && <GuideButton />}
        </div>
        <ScreenLead>拠点ごとに対策と投資の承認ラインを設定し、自然コストを織り込むと結論が変わるか確認します。</ScreenLead>
        {detailOnly && <p className="page-back"><Link href="/decision">← 拠点一覧へ戻る</Link></p>}
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        {!detailOnly && <GuideBox>
          承認ラインを入力し、対策を選び、結果を反映する社内制度を指定します。
        </GuideBox>}
      </div>

      {detailOnly && openSiteId && (
        <SectionNav
          label={`${openSiteName ?? "拠点"}の判定内の画面`}
          items={[
            {
              href: `/decision/${encodeURIComponent(openSiteId)}`,
              label: "判定を編集",
              description: "前提・対策・反映先を変更",
              active: true,
            },
            {
              href: `/decision/${encodeURIComponent(openSiteId)}/analysis`,
              label: "比較分析",
              description: "回避量と追加リターンを確認",
              active: false,
            },
          ]}
        />
      )}

      {!detailOnly && <>

      {/* D-01-3:保存済みの操作のうち、今回の計算に反映できなかったものを黙って捨てない。 */}
      <PipelineWarnings warnings={result.warnings} screen="/decision" />

      {/* D-11-1:残タスクの頭出し(最下部までスクロールしなくても見える)。 */}
      <TaskBanner current="/decision" result={result} />

      {welfareOnlyIssues.length > 0 && (
        <Card
          title="社会的厚生価値は投資判定に加算しません"
          subtitle="追加カテゴリのLIME3結果"
          headExtra={<Tag variant="welfare">NPV・ROI対象外</Tag>}
        >
          <p style={{ marginTop: 0, color: "var(--ink-soft)" }}>
            次の評価結果は社会全体への影響を示す参考値です。企業の交換価値が入力されるまで、対策ROI、自然調整後NPV、承認ライン判定には使用しません。
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {welfareOnlyIssues.map((issue) => (
              <li key={issue.id}>
                <Link href={`/valuation/${encodeURIComponent(issue.id)}`}>
                  {materialIssueLabel(siteNameById.get(issue.siteId), issue.impactCategory, issue.id)}
                </Link>
                <span className="cell-note">{categoryLabel(issue.impactCategory)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* D-11-3:サマリーが先、詳細は要求時。1拠点1行で判定・対策・反映先・残タスクを見渡す。 */}
      <Card
        id="site-summary"
        title="拠点サマリー"
        subtitle="行の「詳細」から判定と対策の編集へ進みます"
        padBody={false}
      >
        <table className="data-table data-table--linked">
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
              <tr key={row.siteId}>
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
                    href={`/decision/${encodeURIComponent(row.siteId)}`}
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
      </>}

      {/*
        拠点別詳細(D-11 → 第6版D-23で改稿)。**選択中の1拠点だけを描画する。**
        以前は全拠点分を`<details>`(既定は閉)でDOMに載せていたが、100拠点では
        対策比較テーブル・散布図×100がHTMLに含まれ、畳んであっても破綻する。
        他の拠点はサマリーテーブルの行リンク(?site=...)から開く。
      */}
      {detailOnly && siteRows
        .filter((row) => row.siteId === openSiteId)
        .map(({ siteId, decision, countermeasureCandidates, selectedCountermeasureKey, alerts }) => {
        const record = decision.decisionRecord;
        const threshold = record.approvalThreshold === "pending" ? null : (record.approvalThreshold.value);
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
          <div key={siteId} id={`site-${siteId}`} className="detail-stack">
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

              {/* (2) 対策案の比較:一覧画面では要点、拠点画面では専用分析へ分離する。 */}
              <Card
                  title="対策案を選ぶ"
                  subtitle="候補を比較して、この拠点の判定に使う案を選択します"
                  padBody={false}
                >
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>対策</th>
                        <th>投資額</th>
                        <th>投資価値(反映後)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {countermeasureCandidates.map((candidate) => {
                        const selected = candidate.key === selectedCountermeasureKey;
                        return (
                          <tr key={candidate.key} style={selected ? { background: "var(--accent-soft)" } : undefined}>
                            <td>
                              <b>{candidate.label}</b>
                              {selected && <span className="cell-note">選択中</span>}
                            </td>
                            <td className="num">
                              <Num value={candidate.investmentCost.initial} unit="円" scale={investInitialScale} /> /{" "}
                              <Num value={candidate.investmentCost.recurring} unit="円/年" scale={investRecurringScale} />
                            </td>
                            <td className="num">
                              <Num value={candidate.decisionRecord.natureAdjustedNpv.central} unit="円" scale={npvScale} />
                              <span className="cell-note">{verdictLabel(candidate.decisionRecord.verdict)}</span>
                            </td>
                            <td>
                              <CountermeasureSelector siteId={siteId} candidateKey={candidate.key} selected={selected} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="card-action-row">
                    <Link href={`/decision/${encodeURIComponent(siteId)}/analysis`} className="pill-btn pill-btn--sm">
                      回避量と追加リターンを分析する →
                    </Link>
                  </div>
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
        );
      })}

      {/*
        GAP-20:どの拠点の判定にも対応しないアラート(例:対象拠点が詳細評価から外れた等)を
        黙って消さないための安全弁。拠点に紐づくアラートは、判定結果カード直下(選択中の拠点)
        またはサマリーテーブルの残タスク列(その他の拠点)で伝わる(D-23)。
      */}
      {!detailOnly && orphanAlerts.length > 0 && (
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
