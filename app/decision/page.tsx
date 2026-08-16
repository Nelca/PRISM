import Link from "next/link";
import { getTenantId } from "@/lib/db/client";
import { listConfirmedDecisionSnapshots } from "@/lib/db/repositories/decision-counts";
import { detectReassessmentAlerts } from "@core/decision/reassessment";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { Num, pickYenScale } from "../components/numeric";
import { Card, GuideBox, GuideButton, ScreenLead, Stat, Tag } from "../components/ui";
import { bindingLabel, formatDominantAssumption, verdictLabel, verdictTagVariant } from "../components/labels";
import { methodLabel } from "../components/method-labels";
import { StepNav } from "../components/step-nav";
import { Scatter } from "../components/charts/Scatter";
import { CountermeasureSelector } from "./countermeasure-selector";
import { BindingForm } from "./binding-form";
import { DecisionParametersForm } from "./parameters-form";
import { loadInteractionState } from "@/lib/db/repositories/interactions";

/**
 * ★判定の意味を一文にする(指示15)。「またがない」も確定した結論であり、
 * ホームの発見サマリー(lib/pipeline/open-tasks.ts の deriveFindings)と同じ言い回しに揃える。
 * 保留中は段階的開示のtooltip-note(下)がこの役割を担うため、ここでは出さない。
 */
function verdictMeaningSentence(verdict: string): string | null {
  if (verdict === "does_not_cross") return "自然関連コストを織り込んでも、この投資の結論は変わりません。";
  if (verdict === "crosses")
    return "自然関連コストを織り込むと、この投資の結論が変わりうる水準です。対策案や結果の反映先の見直しを検討してください。";
  return null;
}

export default async function DecisionPage() {
  const tenantId = await getTenantId();
  const result = await getOrCreateLatestResult(tenantId);
  const { decisions } = result;
  // 入力済みの投資判断の前提(フォームの初期値に使う)
  const { decisionParameters } = await loadInteractionState(tenantId);

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
  // 各拠点の判定結果カードの直下に出すため、どのアラートを表示済みにしたかを記録しておく
  // (指示15。表示先を失ったアラートを黙って消さないための安全弁、下の「その他」に回す)。
  const shownAlertIds = new Set<string>();

  if (decisions.length === 0) {
    return (
      <div className="screen">
        <div className="screen__head">
          <div className="screen__title-row">
            <h1 className="screen__title">対策と判定</h1>
          </div>
          <ScreenLead>対策を選び、承認基準と照らした判定を確定します</ScreenLead>
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

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">対策と判定</h1>
          <GuideButton />
        </div>
        <ScreenLead>対策を選び、承認基準と照らした判定を確定します</ScreenLead>
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        <GuideBox>
          この画面では、承認基準と照らした判定を確定させます。<b>1.</b>{" "}
          「投資判断の前提」で通常NPV・割引率・承認閾値(稟議の承認ライン)を入力します → <b>2.</b>{" "}
          「対策案の比較」で対策を1つ選ぶと、投資対効果が自然への影響を加味して再計算されます → <b>3.</b>{" "}
          先頭の「判定結果」で、承認基準をまたぐかどうかを確認します → <b>4.</b>{" "}
          「この結果の反映先」で、この結果を社内のどの仕組みで使うかを決めます(変更には理由の入力が必須です) →{" "}
          <b>5.</b> 確定したら「開示への反映」へ進みます。 承認閾値が未入力の間は、仮の値を置かず判定を保留にします。
          保留を解くには財務・経営企画部門への確認が必要です。
        </GuideBox>
      </div>

      {decisions.map(({ siteId, siteName, decision, countermeasureCandidates, selectedCountermeasureKey }) => {
        const record = decision.decisionRecord;
        const threshold = record.approvalThreshold === "pending" ? null : (record.approvalThreshold.value as unknown as number);
        // 「投資1億円あたり」に揃える(指示09)。100_000_000円=1億円なので係数自体は従来と同じ。
        const invPerOku = (c: (typeof countermeasureCandidates)[number]) => {
          const invest = c.investmentCost.initial + c.investmentCost.recurring;
          if (invest === 0) return 0;
          const npv = c.decisionRecord.natureAdjustedNpv.central as unknown as number;
          return (npv / invest) * 100_000_000;
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
          ...countermeasureCandidates.map((c) => c.investmentCost.initial as unknown as number)
        );
        const investRecurringScale = pickYenScale(
          ...countermeasureCandidates.map((c) => c.investmentCost.recurring as unknown as number)
        );
        const npvScale = pickYenScale(
          ...countermeasureCandidates.map((c) => c.decisionRecord.natureAdjustedNpv.central as unknown as number)
        );
        const siteAlerts = reassessmentAlerts.filter((alert) => alert.decisionRecordId === record.id);
        siteAlerts.forEach((alert) => shownAlertIds.add(alert.decisionRecordId));

        return (
          <div key={siteId} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 15, marginBottom: 10 }}>{siteName}</h2>

            {/* (1) 判定結果を先頭・大きく(指示15。プロダクトの価値の中心) */}
            <Card
              title="判定結果"
              subtitle={`対象:${countermeasureCandidates.find((c) => c.key === selectedCountermeasureKey)?.label}`}
              headExtra={
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Tag variant={verdictTagVariant(record.verdict)}>
                    {record.verdict === "pending" ? "判定は保留中" : `承認${verdictLabel(record.verdict)}`}
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
              */}
              {record.verdict === "pending" ? (
                <div className="first-action">
                  <p className="first-action__text">
                    まず投資判断の承認基準(閾値)を入力してください(財務・経営企画部門への確認が必要です)。
                    入力すると判定が確定します。閾値が分かるまで、判定は保留のままです(仮の閾値は置きません)。
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
                <Stat label="承認基準" value={threshold !== null ? <Num value={threshold} unit="円" /> : "未入力"} />
                <Stat
                  label={<span title="自然関連のコスト・便益を加味した正味現在価値">投資対効果(NPV)の幅</span>}
                  value={
                    <>
                      <Num value={record.natureAdjustedNpv.quantileRange.p5} /> 〜 <Num value={record.natureAdjustedNpv.quantileRange.p95} />
                    </>
                  }
                  unit={`(中心 ${new Intl.NumberFormat("ja-JP").format(record.natureAdjustedNpv.central as unknown as number)})`}
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
            {siteAlerts.length > 0 && (
              <Card
                title="前提が変わった判定"
                padBody={false}
                foot="過去の判定は書き換えていません。見直しが必要かどうかは利用者の判断です"
              >
                <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {siteAlerts.map((alert, i) => (
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
            <Card title="対策案の比較" foot="縦軸:投資1億円あたりの回避物理量 ・ 横軸:投資1億円あたりの投資対効果(NPV)">
              <table className="data-table" style={{ margin: "0 0 16px" }}>
                <thead>
                  <tr>
                    <th>対策</th>
                    <th>投資額</th>
                    <th>回避物理量/年</th>
                    <th>投資対効果(NPV、★判定)</th>
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
                          <Num value={c.decisionRecord.natureAdjustedNpv.central as unknown as number} unit="円" scale={npvScale} />(
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
                xLabel="投資1億円あたりの投資対効果(NPV)"
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
        );
      })}

      {/*
        GAP-20:表示先の拠点が見つからなかったアラート(例:対象拠点が詳細評価から外れた等)を
        黙って消さないための安全弁。通常は各拠点の判定結果カード直下にすべて表示される。
      */}
      {reassessmentAlerts.filter((alert) => !shownAlertIds.has(alert.decisionRecordId)).length > 0 && (
        <Card
          title="前提が変わった判定(その他)"
          padBody={false}
          foot="過去の判定は書き換えていません。見直しが必要かどうかは利用者の判断です"
        >
          <table className="data-table">
            <tbody>
              {reassessmentAlerts
                .filter((alert) => !shownAlertIds.has(alert.decisionRecordId))
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
