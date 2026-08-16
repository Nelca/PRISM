import Link from "next/link";
import { computeTornadoChart } from "@core/monetization/tornado";
import type { PairwiseDecomposition } from "@core/types/divergence";
import { decomposeQuantileRange } from "@core/divergence/quantile-decomposition";
import type { UncertaintyFactor } from "@core/divergence/quantile-decomposition";
import type { ValuationRecord } from "@core/types/valuation";
import { getTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import { maxDivergenceRatio } from "@/lib/pipeline/open-tasks";
import { Num, pickYenScale } from "../components/numeric";
import { Card, GuideBox, GuideButton, KV, ScreenLead, Stat, Tag } from "../components/ui";
import { tierLabel, tierTagVariant } from "../components/tag-utils";
import { methodLabel } from "../components/method-labels";
import { categoryLabel, decompositionFactorLabel, materialIssueLabel } from "../components/labels";
import { StepNav } from "../components/step-nav";
import { Football } from "../components/charts/Football";
import { Tornado } from "../components/charts/Tornado";
import { Waterfall, type WaterfallStepInput } from "../components/charts/Waterfall";
import { RepresentativeSelector } from "./representative-selector";
import { DataSourceAttribution } from "../components/attribution";

/** 幅を決める要因(M4 U-3)。中心値の要因とは別の集合。 */
const UNCERTAINTY_FACTOR_LABEL: Record<UncertaintyFactor, string> = {
  parameterUncertainty: "推計値そのもののばらつき(層i)",
  transferError: "他地域の研究値を当てはめる誤差(層ii・確からしさ)",
};

function pairwiseToWaterfallSteps(pair: PairwiseDecomposition, labelA: string, labelB: string): WaterfallStepInput[] {
  const steps: WaterfallStepInput[] = [{ label: `${labelA} 中心値`, value: pair.valueA as unknown as number, isTotal: true }];
  let running = pair.valueA as unknown as number;
  for (const c of pair.contributions) {
    const next = running * c.multiplier;
    steps.push({ label: decompositionFactorLabel(c.factor), value: next - running, isTotal: false });
    running = next;
  }
  if (pair.residual) {
    const next = running * pair.residual.multiplier;
    steps.push({ label: "分解不能な残差", value: next - running, isTotal: false });
    running = next;
  }
  steps.push({ label: `${labelB} 中心値`, value: pair.valueB as unknown as number, isTotal: true });
  return steps;
}

/**
 * 価値の算定と代表値の選択(指示03。旧 /valuation + /decomposition)。
 *
 * 利用者のタスクは「複数の算定結果を見る→差の理由を理解する→代表値を選ぶ」という一続きなので、
 * 上から (1)対象と手法一覧 →(2)試算の幅(フットボール、1回だけ)→(3)差が生じる理由 →
 * (4)幅が違う理由 →(5)代表値の選択(この画面の出口)→(6)前年度手法との比較 の順に並べる。
 * トルネード図と除外項目は折りたたみに格下げした。
 */
export default async function ValuationPage({ searchParams }: { searchParams: Promise<{ issue?: string }> }) {
  const { issue: issueParam } = await searchParams;
  const result = await getOrCreateLatestResult(await getTenantId());
  const { valuationRecordsByMaterialIssue, divergenceDecompositions, representativeRecordByMaterialIssue, m4ChangeLogByMaterialIssue } =
    result.valuation;
  const materialIssueIds = Object.keys(valuationRecordsByMaterialIssue);

  if (materialIssueIds.length === 0) {
    return (
      <div className="screen">
        <div className="screen__head">
          <div className="screen__title-row">
            <h1 className="screen__title">価値の算定と代表値の選択</h1>
          </div>
          <ScreenLead>差の理由を確認し、投資判断に使う代表値を1つ選びます</ScreenLead>
        </div>
        {/* 空状態の3点セット(指示11):いま何がない/なぜないか/どこで何をするか+リンク */}
        <Card title="詳細評価の対象がまだありません">
          <p style={{ color: "var(--ink-faint)" }}>
            評価対象の絞り込みで課題を「詳細評価」に切り替えると、ここに算定結果が表示されます。
          </p>
          <Link href="/assessment" className="pill-btn pill-btn--sm">
            評価対象の絞り込みへ →
          </Link>
        </Card>
      </div>
    );
  }

  const siteNameById = new Map(result.assessment.sites.map((s) => [s.id, s.name]));
  const issueById = new Map(result.assessment.materialIssues.map((i) => [i.id, i]));
  const labelForIssueId = (id: string) => {
    const issue = issueById.get(id);
    if (!issue) return id;
    return materialIssueLabel(siteNameById.get(issue.siteId), issue.impactCategory, issue.siteId);
  };

  /**
   * C-05:課題が複数ある場合、片方で代表値を選んでも、もう片方が未選択のままであることに
   * 気づけなかった。「代表値が未選択の課題」の集合をここで1度だけ導出し、
   * 課題切替ピルのドットと、選択カード直下の案内リンクの両方に使う。
   * 判定条件は `deriveOpenTasks` の representative-value タスクと同じ
   * (DivergenceDecomposition.representativeValueSelection の有無)。
   */
  const decompositionForIssueId = (id: string) => {
    const pq = valuationRecordsByMaterialIssue[id]?.[0]?.physicalQuantityId;
    return pq ? divergenceDecompositions.find((d) => d.targetPhysicalQuantityId === pq) : undefined;
  };
  const unselectedIssueIds = materialIssueIds.filter((id) => {
    const target = decompositionForIssueId(id);
    return target !== undefined && !target.representativeValueSelection;
  });

  const selectedIssueId = issueParam && materialIssueIds.includes(issueParam) ? issueParam : materialIssueIds[0];
  const records = valuationRecordsByMaterialIssue[selectedIssueId];
  const site = result.assessment.sites.find((s) => s.id === records[0]?.siteId);
  const issue = issueById.get(selectedIssueId);
  const physicalQuantityId = records[0]?.physicalQuantityId;

  // 指示09:③のこの画面では同じ対象の中心値・幅・代表値選択の各表に同じ金額群が繰り返し出る。
  // 行ごとに単位が割れないよう(百万円の行と億円の行が混ざらないよう)、この対象に出てくる
  // すべての金額から表全体で使うスケールを1つ決めて明示的に揃える。
  const recordScale = pickYenScale(
    ...records.flatMap((r) => [r.centralValue as unknown as number, r.quantileRange.p5, r.quantileRange.p95])
  );

  const footballMethods = records.map((r) => ({
    name: methodLabel(r.methodId),
    tier: r.transferFitness.tier,
    concept: r.valueConcept,
    low: r.quantileRange.p5,
    mid: r.quantileRange.p50,
    high: r.quantileRange.p95,
  }));

  const decomposition = divergenceDecompositions.find((d) => d.targetPhysicalQuantityId === physicalQuantityId);

  // 手法間の倍率は④の「重要な論点」・ホームの発見サマリーと同じ関数から取る(比が1未満の
  // ペアも逆数にして「何倍の差か」に揃える)。
  const maxRatio = decomposition ? maxDivergenceRatio(decomposition) : null;

  /**
   * M4 U-3:レンジの幅の分解。中心値の分解と同じペア(最初の比較対象)について、
   * 「なぜ幅が違うのか」を層i・層iiに分ける。
   */
  const widthPairRecords = records.filter((r) => r.valueConcept === "welfare");
  const quantileDecomposition =
    widthPairRecords.length >= 2 ? decomposeQuantileRange(widthPairRecords[0], widthPairRecords[1]) : null;

  const exchangeGroup = decomposition?.groups.find((g) => g.valueConcept === "exchange");
  const welfareGroup = decomposition?.groups.find((g) => g.valueConcept === "welfare");
  const primaryPair = exchangeGroup?.pairwiseDecompositions[0];

  const currentRepresentativeId = representativeRecordByMaterialIssue[selectedIssueId];
  const changeLog = m4ChangeLogByMaterialIssue[selectedIssueId];

  // M4 §7.4:代表値の選択(利用者が実際に選んだ場合のみ存在する)。
  const selection = decomposition?.representativeValueSelection;
  const selectionStatus = result.valuation.representativeSelectionStatus[selectedIssueId];
  const selectedCentralValue = selection
    ? (records.find((r) => r.methodId === selection.selectedMethodId)?.centralValue as unknown as number | undefined)
    : undefined;

  // 指示09:「前年度手法との比較」カード内の3つの金額(再計算値・今年度値・差分)で単位を揃える。
  const priorMethodScale =
    selection && selectionStatus?.status === "recalculated" && selection.recalculatedWithPriorMethod !== undefined
      ? pickYenScale(
          selection.recalculatedWithPriorMethod,
          selectedCentralValue ?? 0,
          (selectedCentralValue ?? 0) - selection.recalculatedWithPriorMethod
        )
      : undefined;

  // 折りたたみに格下げした「試算の幅に影響する要因」(トルネード図)。
  const primaryRecord: ValuationRecord | undefined = records.find((r) => r.methodId === "replacement-cost") ?? records[0];
  const tornadoEntries = primaryRecord ? computeTornadoChart(primaryRecord) : [];
  const tornadoCenter = primaryRecord ? (primaryRecord.centralValue as unknown as number) : 0;
  const tornadoFactors = tornadoEntries.map((e, i) => ({
    name: e.label,
    low: tornadoCenter * (1 - e.sigma),
    high: tornadoCenter * (1 + e.sigma),
    dominant: i === 0,
  }));

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">価値の算定と代表値の選択</h1>
          <GuideButton />
        </div>
        <ScreenLead>差の理由を確認し、投資判断に使う代表値を1つ選びます</ScreenLead>
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        <GuideBox>
          この画面では、投資判断に使う代表値を決めます。<b>1.</b> 「試算の幅(手法別)」で方法ごとの結果を見ます →{" "}
          <b>2.</b> 「差が生じる理由」「幅が違う理由」で、その差が何から来ているのかを確認します → <b>3.</b>{" "}
          「投資判断に使う代表値の選択」で1つ選び、変更する場合は理由を入力します → <b>4.</b>{" "}
          課題が複数ある場合は上の切替で他の課題も同じ手順で選びます → <b>5.</b> 選び終えたら「財務への影響」へ進みます。
          方法によって結果に大きな差が出ることがありますが、これは誤差ではなく、各方法が異なる問いに答えているためです。
          推奨値は表示されません。方法を変更する場合は理由の入力が必須です。
        </GuideBox>
      </div>

      {materialIssueIds.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {materialIssueIds.map((id) => (
            <Link
              key={id}
              href={`/valuation?issue=${encodeURIComponent(id)}`}
              className={`pill-btn pill-btn--sm${id === selectedIssueId ? " pill-btn--accent" : ""}`}
              title={id}
            >
              {labelForIssueId(id)}
              {/* C-05:代表値が未選択の課題に、ナビの要対応ドットと同じ意匠の小さなドットを出す。 */}
              {unselectedIssueIds.includes(id) && (
                <span className="pill-btn__dot" role="img" aria-label="代表値が未選択です" title="代表値が未選択です" />
              )}
            </Link>
          ))}
        </div>
      )}

      {/* (1) 算定対象と手法一覧 */}
      <Card title="算定の対象" subtitle={labelForIssueId(selectedIssueId)}>
        <div className="grid-3">
          <Stat
            label="対象拠点"
            value={
              <span style={{ fontFamily: "var(--font-body)", fontSize: 15 }}>{site?.name ?? records[0]?.siteId ?? "—"}</span>
            }
          />
          <Stat
            label="対象カテゴリ"
            value={<span style={{ fontFamily: "var(--font-body)", fontSize: 15 }}>{categoryLabel(issue?.impactCategory ?? "water")}</span>}
          />
          <Stat label="感応度" value={issue ? `${issue.sensitivityScore}/5` : "—"} />
        </div>
        {/* 物理量入力IDは照合用の内部ID。本文からは外し、小書きに退避する(指示06)。 */}
        {physicalQuantityId && <span className="id-note">算定に使った物理量:{physicalQuantityId}</span>}
      </Card>

      <Card
        title="適用している算定方法"
        subtitle={`${records.length}件を並行して適用中`}
        padBody={false}
        foot="単位:円/年 ・ 使用した基準データのバージョンも記録されます"
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>方法</th>
              <th>価値の性質</th>
              <th title="算定の確からしさ。A=現地評価に近い/B=補正付きで実務利用可/C=桁の把握のみ">確からしさ</th>
              <th>中心値</th>
              <th>幅(P5〜P95)</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{methodLabel(r.methodId)}</b>
                </td>
                <td>
                  <Tag variant={r.valueConcept === "welfare" ? "welfare" : "exchange"}>
                    {r.valueConcept === "welfare" ? "厚生価値" : "交換価値"}
                  </Tag>
                </td>
                <td>
                  <Tag variant={tierTagVariant(r.transferFitness.tier)}>{tierLabel(r.transferFitness.tier)}</Tag>
                </td>
                <td className="num" style={{ fontWeight: 700 }}>
                  <Num value={r.centralValue as unknown as number} unit="円" scale={recordScale} />
                </td>
                <td className="num">
                  <Num value={r.quantileRange.p5} unit="円" scale={recordScale} /> 〜{" "}
                  <Num value={r.quantileRange.p95} unit="円" scale={recordScale} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* (2) 試算の幅(フットボールチャートは画面に1回だけ) */}
      <Card
        title="試算の幅(手法別)"
        headExtra={maxRatio !== null && maxRatio > 1.5 ? <Tag variant="warn">最大で{maxRatio.toFixed(1)}倍の差</Tag> : undefined}
        foot="単位:円/年 ・ 紫は社会全体への影響(投資判断には使用しません)"
      >
        <Football methods={footballMethods} />
      </Card>

      {/* (3) 差が生じる理由 */}
      {primaryPair && (
        <Card title="差が生じる理由" subtitle="中心値の差を要因に分解">
          <Waterfall
            steps={pairwiseToWaterfallSteps(primaryPair, methodLabel(primaryPair.methodIdA), methodLabel(primaryPair.methodIdB))}
          />
          <p className="tooltip-note">{primaryPair.narrative}</p>
        </Card>
      )}

      {/*
        (4) M4 U-3:レンジの幅の分解。中心値の3要因(上のウォーターフォール)は幅を変えないため、
        「なぜ幅が違うのか」は別の要因集合(層i・層ii)で説明する。
      */}
      {quantileDecomposition && (
        <Card
          title="幅が違う理由"
          subtitle={`${methodLabel(quantileDecomposition.methodIdA)} / ${methodLabel(quantileDecomposition.methodIdB)}`}
          padBody={false}
          foot="中心値の差の要因(上)と幅の差の要因は別です。地域差の調整や対象範囲の違いは、幅ではなく水準を動かします"
        >
          {quantileDecomposition.mode === "not_decomposed" ? (
            <div style={{ padding: "12px 18px", color: "var(--ink-faint)", fontSize: 12.5 }}>
              {quantileDecomposition.notDecomposedReason}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>要因</th>
                  <th>幅への効き</th>
                  <th>寄与</th>
                </tr>
              </thead>
              <tbody>
                {quantileDecomposition.contributions.map((contribution) => (
                  <tr key={contribution.factor}>
                    <td>{UNCERTAINTY_FACTOR_LABEL[contribution.factor]}</td>
                    <td className="num">×{contribution.multiplier.toFixed(2)}</td>
                    <td className="num">
                      {contribution.shareRatio === null ? "—" : `${(contribution.shareRatio * 100).toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>幅の比</b>
                  </td>
                  <td className="num">
                    <b>×{quantileDecomposition.widthRatio!.toFixed(2)}</b>
                  </td>
                  <td className="num">残差 0</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/*
        価値概念の分離(concept-v2 §8.2の合算禁止・X7ガードのUI表現)。
        色分けと「投資判断には使用しません」の明示は統合後もそのまま残す。
      */}
      <div className="grid-2" style={{ marginTop: 16 }}>
        {exchangeGroup && (
          <div style={{ border: "1px solid var(--accent-line)", background: "var(--accent-soft)", borderRadius: 6, padding: 14 }}>
            <div className="section-label" style={{ color: "var(--accent-ink)" }}>
              交換価値グループ ・ {exchangeGroup.usage}
            </div>
            {exchangeGroup.methodIds.map((id) => {
              const r = records.find((rec) => rec.methodId === id && rec.valueConcept === "exchange");
              if (!r) return null;
              return <KV key={id} k={methodLabel(id)} v={<Num value={r.centralValue as unknown as number} unit="円" scale={recordScale} />} />;
            })}
            <div style={{ marginTop: 10 }}>
              <Tag variant="exchange">投資判断に反映できます</Tag>
            </div>
          </div>
        )}
        {welfareGroup && (
          <div style={{ border: "1px solid #cbbedd", background: "var(--welfare-soft)", borderRadius: 6, padding: 14 }}>
            <div className="section-label" style={{ color: "var(--welfare)" }}>
              厚生価値グループ ・ {welfareGroup.usage}
            </div>
            {welfareGroup.methodIds.map((id) => {
              const r = records.find((rec) => rec.methodId === id && rec.valueConcept === "welfare");
              if (!r) return null;
              return <KV key={id} k={methodLabel(id)} v={<Num value={r.centralValue as unknown as number} unit="円" scale={recordScale} />} />;
            })}
            <div style={{ marginTop: 10 }}>
              <Tag variant="welfare">開示にのみ使用します</Tag>
            </div>
            <p className="tooltip-note">この値は投資判断には使用せず、開示の参考情報としてのみ使用します。</p>
          </div>
        )}
      </div>

      {/* (5) 代表値の選択 = この画面の出口(必須アクション) */}
      <Card title="投資判断に使う代表値の選択" subtitle="この画面ですべきこと。推奨値は表示しません" padBody={false}>
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>方法</th>
              <th>確からしさ</th>
              <th>中心値</th>
            </tr>
          </thead>
          <tbody>
            {records
              .filter((r) => r.valueConcept === "exchange")
              .map((r) => {
                const selected = r.id === currentRepresentativeId;
                return (
                  <tr key={r.id} style={selected ? { background: "var(--accent-soft)" } : undefined}>
                    <td>
                      {selected ? (
                        <Tag variant="ok">選択中</Tag>
                      ) : (
                        <RepresentativeSelector
                          materialIssueId={selectedIssueId}
                          recordId={r.id}
                          methodId={r.methodId}
                          valueConcept={r.valueConcept}
                          fromLabel={methodLabel(records.find((rr) => rr.id === currentRepresentativeId)?.methodId)}
                          toLabel={methodLabel(r.methodId)}
                        />
                      )}
                    </td>
                    <td>
                      <b>{methodLabel(r.methodId)}</b>
                    </td>
                    <td>{tierLabel(r.transferFitness.tier)}</td>
                    <td className="num">
                      <Num value={r.centralValue as unknown as number} unit="円" scale={recordScale} />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        <div style={{ padding: "12px 18px" }}>
          {changeLog ? (
            <>
              <div className="section-label">変更履歴</div>
              <KV k="変更前" v={changeLog.from} />
              <KV k="変更後" v={changeLog.to} />
              <KV k="変更理由" v={changeLog.reason} />
            </>
          ) : (
            <p style={{ color: "var(--ink-faint)", fontSize: 12 }}>代表値の変更履歴はまだありません。</p>
          )}
        </div>
      </Card>

      {/*
        C-05:この画面の出口(代表値の選択)の直下で、他の課題がまだ未選択であることを知らせる。
        課題切替ピルのドットと同じ状態(unselectedIssueIds)から出す。
      */}
      {unselectedIssueIds.filter((id) => id !== selectedIssueId).length > 0 && (
        <div className="cross-issue-note">
          <div className="section-label">まだ代表値を選んでいない課題</div>
          {unselectedIssueIds
            .filter((id) => id !== selectedIssueId)
            .map((id) => (
              <Link key={id} href={`/valuation?issue=${encodeURIComponent(id)}`} className="cross-issue-note__link">
                {labelForIssueId(id)}の代表値がまだ選ばれていません →
              </Link>
            ))}
        </div>
      )}

      {/*
        (6) M4 §7.4・構想書9.3の必須要件:手法を変更したときは、前年度手法での再計算値を並記する。
        これがないと、手法変更による差分と実態変化による差分が混ざる(GAP-09)。
      */}
      {selection && (
        <Card title="前年度手法との比較" subtitle="手法変更による差分を切り分ける">
          <KV k="前年度に採用していた手法" v={selection.priorYearMethodId ? methodLabel(selection.priorYearMethodId) : "記録なし(初年度)"} />
          <KV k="今年度に選択した手法" v={methodLabel(selection.selectedMethodId)} />
          <KV k="選択理由" v={selection.reason} />
          <hr className="rule" />

          {selectionStatus?.status === "recalculated" && selection.recalculatedWithPriorMethod !== undefined ? (
            <>
              <KV
                k="前年度手法を今年度の物理量で再計算した値"
                v={<Num value={selection.recalculatedWithPriorMethod} unit="円" scale={priorMethodScale} />}
              />
              <KV k="今年度の選択手法の値" v={<Num value={selectedCentralValue ?? 0} unit="円" scale={priorMethodScale} />} />
              <KV
                k="手法変更による差分"
                v={
                  <Num
                    value={(selectedCentralValue ?? 0) - selection.recalculatedWithPriorMethod}
                    unit="円"
                    scale={priorMethodScale}
                  />
                }
              />
              <p className="tooltip-note">
                いずれも<b>今年度の物理量</b>で計算した値です。したがってこの差分は手法変更のみによるものです。
                実態変化による差分を出すには前年度の実績値が必要ですが、本システムはまだ過年度の実績を保持していないため算出しません。
              </p>
            </>
          ) : selectionStatus?.status === "method_unavailable" ? (
            <p className="tooltip-note">{selectionStatus.unavailableReason}</p>
          ) : (
            <p className="tooltip-note">前年度から手法を変更していないため、再計算値の並記は行いません。</p>
          )}
        </Card>
      )}

      {/* 代表値を選ぶうえでは補足情報にあたるため、折りたたみに格下げする(指示03)。 */}
      <details className="collapse">
        <summary>
          詳しく見る:試算の幅に影響する要因
          <small>{primaryRecord ? methodLabel(primaryRecord.methodId) : ""}</small>
        </summary>
        <div className="collapse__body">
          <Tornado center={tornadoCenter} factors={tornadoFactors} />
          <p className="tooltip-note">
            パラメータ不確実性(層i)と確からしさ由来の移転誤差(層ii)のsigmaを中心値からの近似的な振れ幅として表示しています。
          </p>
        </div>
      </details>

      <details className="collapse">
        <summary>
          詳しく見る:試算に含めていない項目
          <small>除外した対象は黙って消さず、ここに残します</small>
        </summary>
        <div className="collapse__body">
          {primaryRecord?.scopeExclusions.length ? (
            primaryRecord.scopeExclusions.map((ex, i) => <KV key={i} k={ex} v="対象外" />)
          ) : (
            <p style={{ color: "var(--ink-faint)" }}>この手法に明示的な除外項目はありません。</p>
          )}
        </div>
      </details>

      <DataSourceAttribution sources={["World Bank"]} />
      <StepNav current="/valuation" result={result} />
    </div>
  );
}
