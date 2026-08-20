import Link from "next/link";
import { computeTornadoChart } from "@core/monetization/tornado";
import type { PairwiseDecomposition } from "@core/types/divergence";
import { decomposeQuantileRange } from "@core/divergence/quantile-decomposition";
import type { UncertaintyFactor } from "@core/divergence/quantile-decomposition";
import type { ValuationRecord } from "@core/types/valuation";
import { getTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";
import {
  decompositionForMaterialIssue,
  materialIssueIdsWithoutRepresentativeSelection,
  maxDivergenceRatio,
  pairDivergenceRatio,
} from "@/lib/pipeline/open-tasks";
import { Num, pickYenScale } from "../components/numeric";
import { Card, GuideBox, GuideButton, KV, ScreenLead, Stat, Tag } from "../components/ui";
import { tierLabel, tierTagVariant } from "../components/tag-utils";
import { methodLabel, methodShortLabel, withMethodLabelsInText } from "../components/method-labels";
import { decompositionFactorShortLabel, materialIssueLabel } from "../components/labels";
import { StepNav } from "../components/step-nav";
import { Football } from "../components/charts/Football";
import { Tornado } from "../components/charts/Tornado";
import { Waterfall, type WaterfallStepInput } from "../components/charts/Waterfall";
import { RepresentativeSelector } from "./representative-selector";
import { DataSourceAttribution } from "../components/attribution";
import { PipelineWarnings } from "../components/pipeline-warnings";
import { ScalableSelector } from "../components/scalable-selector";
import { TaskBanner } from "../components/task-banner";

/** 幅を決める要因(M4 U-3)。中心値の要因とは別の集合。 */
const UNCERTAINTY_FACTOR_LABEL: Record<UncertaintyFactor, string> = {
  parameterUncertainty: "推計値そのもののばらつき(層i)",
  transferError: "他地域の研究値を当てはめる誤差(層ii・確からしさ)",
};

/**
 * 中心値0の行に付ける「なぜ0か」(第4版 D-08)。
 *
 * IFVI水方法論の内訳値は、物理量に価値係数を乗じるだけの構造
 * (packages/core/src/monetization/plugins/ifvi-water-consumption.ts)なので、
 * 0円になるのは公表係数そのものが0の場合に限られる。デモの係数は
 * IFVI Water Consumption Topic Methodology, Appendix D Table D1の日本の行からの転記で、
 * 日本はVFnutrition・VFdisease・VFaccessが0(lib/demo/company.ts)。
 * それ以外の手法では係数の出典を特定できないため、断定しない文言に留める(推測で理由を作らない)。
 */
function zeroValueNote(record: ValuationRecord): { short: string; detail: string } | null {
  if ((record.centralValue as unknown as number) !== 0) return null;
  if (record.methodId.startsWith("ifvi-water-consumption.")) {
    const region = record.geographicCalibration.targetRegion;
    const regionLabel = region === "JP" ? "日本" : region;
    return {
      short: `${regionLabel}の公表係数が0のため`,
      detail: `IFVIが公表する${regionLabel}の係数(IFVI水方法論 Appendix D Table D1)が0のため、物理量に関わらず0円になります。`,
    };
  }
  return {
    short: "当該地点の係数が0のため",
    detail: "この手法では当該地点の係数が0と評価されています。",
  };
}

function pairwiseToWaterfallSteps(pair: PairwiseDecomposition, labelA: string, labelB: string): WaterfallStepInput[] {
  const steps: WaterfallStepInput[] = [{ label: `${labelA} 中心値`, value: pair.valueA as unknown as number, isTotal: true }];
  let running = pair.valueA as unknown as number;
  for (const c of pair.contributions) {
    const next = running * c.multiplier;
    // 図の軸ラベルは短縮版を使う(第5版:バー幅に対して通常表記が長すぎ、隣接ラベルと詰まる)。
    steps.push({ label: decompositionFactorShortLabel(c.factor), value: next - running, isTotal: false });
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
 * 加法フォールバック(F-1:いずれかの中心値が0または負)のときの表示(第4版 D-07)。
 * 倍率での要因分解ができないため、両端の中心値と金額差だけを示す。
 */
function additivePairSteps(pair: PairwiseDecomposition, labelA: string, labelB: string): WaterfallStepInput[] {
  const valueA = pair.valueA as unknown as number;
  const valueB = pair.valueB as unknown as number;
  return [
    { label: `${labelA} 中心値`, value: valueA, isTotal: true },
    { label: "金額差", value: valueB - valueA, isTotal: false },
    { label: `${labelB} 中心値`, value: valueB, isTotal: true },
  ];
}

/**
 * 価値の算定と代表値の選択(指示03。旧 /valuation + /decomposition)。
 *
 * 利用者のタスクは「複数の算定結果を見る→差の理由を理解する→代表値を選ぶ」という一続きなので、
 * 上から (1)対象と手法一覧 →(2)試算の幅(フットボール、1回だけ)→(3)差が生じる理由 →
 * (4)幅が違う理由 →(5)代表値の選択(この画面の出口)→(6)前年度手法との比較 の順に並べる。
 * トルネード図と除外項目は折りたたみに格下げした。
 */
export default async function ValuationPage({
  searchParams,
}: {
  searchParams: Promise<{ issue?: string; pair?: string }>;
}) {
  const { issue: issueParam, pair: pairParam } = await searchParams;
  const result = await getOrCreateLatestResult(await getTenantId());
  const { valuationRecordsByMaterialIssue, representativeRecordByMaterialIssue, m4ChangeLogByMaterialIssue } =
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
   * 気づけなかった。課題切替ピルのドットと、選択カード直下の案内リンクの両方に使う。
   *
   * **第4版 D-02:判定は `lib/pipeline/open-tasks.ts` の1つの関数に集約した。**
   * 以前はこの画面が「レコードの物理量IDから分解を引く」独自実装を持っており、
   * ホーム・④の未完了タスク(`deriveOpenTasks`)と二重実装になっていた。
   */
  const unselectedIssueIds = materialIssueIdsWithoutRepresentativeSelection(result);

  const selectedIssueId = issueParam && materialIssueIds.includes(issueParam) ? issueParam : materialIssueIds[0];
  const records = valuationRecordsByMaterialIssue[selectedIssueId];
  const issue = issueById.get(selectedIssueId);
  const physicalQuantityId = records[0]?.physicalQuantityId;
  // 算定に使った物理量の実数(D-05。IDだけでなく「45,000 m3/年」の形で出す)。
  const physicalQuantity = result.valuation.physicalQuantityByMaterialIssue[selectedIssueId];

  // 指示09:③のこの画面では同じ対象の中心値・幅・代表値選択の各表に同じ金額群が繰り返し出る。
  // 行ごとに単位が割れないよう(百万円の行と億円の行が混ざらないよう)、この対象に出てくる
  // すべての金額から表全体で使うスケールを1つ決めて明示的に揃える。
  const recordScale = pickYenScale(
    ...records.flatMap((r) => [r.centralValue as unknown as number, r.quantileRange.p5, r.quantileRange.p95])
  );

  // 中心値が0円の手法(D-08:0の行も非表示にせず、理由を添えて出す)。同じ理由はまとめて1文にする。
  const zeroRecords = records.filter((r) => zeroValueNote(r) !== null);
  const zeroNoteGroups = new Map<string, string[]>();
  for (const record of zeroRecords) {
    const note = zeroValueNote(record)!;
    zeroNoteGroups.set(note.detail, [...(zeroNoteGroups.get(note.detail) ?? []), methodLabel(record.methodId)]);
  }

  const footballMethods = records.map((r) => ({
    name: methodLabel(r.methodId),
    tier: r.transferFitness.tier,
    concept: r.valueConcept,
    low: r.quantileRange.p5,
    mid: r.quantileRange.p50,
    high: r.quantileRange.p95,
  }));

  // 分解の引き当ても未選択判定と同じ関数を使う(D-02:課題IDで一意に引く)。
  const decomposition = decompositionForMaterialIssue(result, selectedIssueId);

  // 手法間の倍率は④の「重要な論点」・ホームの発見サマリーと同じ関数から取る(比が1未満の
  // ペアも逆数にして「何倍の差か」に揃える)。
  const maxRatio = decomposition ? maxDivergenceRatio(decomposition) : null;

  const exchangeGroup = decomposition?.groups.find((g) => g.valueConcept === "exchange");
  const welfareGroup = decomposition?.groups.find((g) => g.valueConcept === "welfare");

  /**
   * 比較ペアの選択(第4版 D-07)。以前は「差が生じる理由」が交換価値グループの先頭ペア固定、
   * 「幅が違う理由」が厚生価値の先頭2件固定で、**別々のペアを黙って比較していた。**
   * 選択肢は分解結果に実在するペアだけ(同一価値概念グループ内のみ。存在しないペアは出さない)。
   * 既定は乖離倍率が最大のペア。「差が生じる理由」(中心値)と「幅が違う理由」(レンジ幅)は
   * 同じ選択ペアに連動する。
   */
  const pairOptions = (decomposition?.groups ?? []).flatMap((group) =>
    group.pairwiseDecompositions.map((pair) => ({ concept: group.valueConcept, pair }))
  );
  const pairKeyOf = (pair: PairwiseDecomposition) => `${pair.methodIdA}~${pair.methodIdB}`;
  const defaultPairOption =
    pairOptions.length > 0
      ? pairOptions.reduce((best, option) => {
          const bestRatio = pairDivergenceRatio(best.pair) ?? 0;
          const ratio = pairDivergenceRatio(option.pair) ?? 0;
          return ratio > bestRatio ? option : best;
        })
      : undefined;
  const selectedPairOption = pairOptions.find((option) => pairKeyOf(option.pair) === pairParam) ?? defaultPairOption;
  const selectedPair = selectedPairOption?.pair;

  /**
   * M4 U-3:レンジの幅の分解。「なぜ幅が違うのか」を層i・層iiに分ける。
   * 対象ペアは「差が生じる理由」と同じ(D-07:別のペアを黙って比較しない)。
   */
  const widthRecordA = selectedPair ? records.find((r) => r.methodId === selectedPair.methodIdA) : undefined;
  const widthRecordB = selectedPair ? records.find((r) => r.methodId === selectedPair.methodIdB) : undefined;
  const quantileDecomposition = widthRecordA && widthRecordB ? decomposeQuantileRange(widthRecordA, widthRecordB) : null;

  /** ペアのうち中心値が0円の側(加法フォールバック時の理由文に使う)。 */
  const zeroSideRecord = selectedPair
    ? [selectedPair.methodIdA, selectedPair.methodIdB]
        .map((methodId) => records.find((r) => r.methodId === methodId))
        .find((record) => record !== undefined && (record.centralValue as unknown as number) === 0)
    : undefined;

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

      {/* D-01-3:保存済みの操作のうち、今回の計算に反映できなかったものを黙って捨てない。 */}
      <PipelineWarnings warnings={result.warnings} screen="/valuation" />

      {/* D-11-1:残タスクの頭出し(最下部までスクロールしなくても見える)。 */}
      <TaskBanner current="/valuation" result={result} />

      {/*
        課題の切替(D-06:件数が増えても破綻しない共通セレクタ)。
        C-05の「代表値が未選択」ドットはピル・リストのどちらのモードでも出る。
      */}
      <ScalableSelector
        items={materialIssueIds.map((id) => ({
          id,
          label: labelForIssueId(id),
          href: `/valuation?issue=${encodeURIComponent(id)}`,
          active: id === selectedIssueId,
          attention: unselectedIssueIds.includes(id),
          attentionLabel: "代表値が未選択です",
        }))}
      />


      {/*
        (1) 算定対象と手法一覧。
        第4版 D-05:対象拠点・対象カテゴリは直上の課題セレクタ(とこのカードのsubtitle)と
        重複していたため削り、**セレクタに無い情報だけ**(感応度・算定に使った物理量の実数・手法数)にする。
      */}
      <Card title="算定の対象" subtitle={labelForIssueId(selectedIssueId)}>
        <div className="grid-3">
          <Stat label="感応度" value={issue ? `${issue.sensitivityScore}/5` : "—"} />
          <Stat
            label={physicalQuantity?.category === "climate" ? "GHG排出量(年間)" : "取水量(年間)"}
            value={
              physicalQuantity ? (
                <span style={{ fontFamily: "var(--font-body)", fontSize: 15 }}>
                  {new Intl.NumberFormat("ja-JP").format(physicalQuantity.quantity)} {physicalQuantity.unit}/年
                </span>
              ) : (
                "—"
              )
            }
          />
          <Stat label="適用中の算定方法" value={`${records.length}件`} />
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
                  {/* D-08:0円の行は非表示にせず、なぜ0かの短い注記を値の隣に付ける。 */}
                  {zeroValueNote(r) && (
                    <span className="cell-note" style={{ fontWeight: 400 }} title={zeroValueNote(r)!.detail}>
                      {zeroValueNote(r)!.short}
                    </span>
                  )}
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
        {/* D-08:0円の手法がある場合、なぜ0かをチャートの直下でも説明する。 */}
        {zeroRecords.length > 0 && (
          <p className="tooltip-note">
            {[...zeroNoteGroups.entries()].map(([detail, names]) => `${names.join("・")}が0円の理由:${detail}`).join(" ")}
          </p>
        )}
      </Card>

      {/* (3) 差が生じる理由(第4版 D-07:比較する2手法をユーザーが選べる) */}
      {selectedPair && (
        <Card
          id="pair-comparison"
          title="差が生じる理由"
          subtitle={`${methodLabel(selectedPair.methodIdA)} と ${methodLabel(selectedPair.methodIdB)} の比較 ・ 中心値の差を要因に分解`}
        >
          {pairOptions.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-label">比較するペアの選択(同じ価値概念どうしのみ。既定は差が最大のペア)</div>
              {decomposition?.groups.map(
                (group) =>
                  group.pairwiseDecompositions.length > 0 && (
                    <div key={group.valueConcept} className="selector-pills" style={{ marginBottom: 6, alignItems: "center" }}>
                      <Tag variant={group.valueConcept === "welfare" ? "welfare" : "exchange"}>
                        {group.valueConcept === "welfare" ? "厚生価値" : "交換価値"}
                      </Tag>
                      {group.pairwiseDecompositions.map((pair) => {
                        const key = pairKeyOf(pair);
                        const ratio = pairDivergenceRatio(pair);
                        const active = pairKeyOf(selectedPair) === key;
                        return (
                          <Link
                            key={key}
                            href={`/valuation?issue=${encodeURIComponent(selectedIssueId)}&pair=${encodeURIComponent(key)}#pair-comparison`}
                            className={`pill-btn pill-btn--sm${active ? " pill-btn--accent" : ""}`}
                            title={`${methodLabel(pair.methodIdA)} と ${methodLabel(pair.methodIdB)} の比較`}
                          >
                            {methodShortLabel(pair.methodIdA)} × {methodShortLabel(pair.methodIdB)}
                            {ratio !== null && `(${ratio.toFixed(1)}倍)`}
                          </Link>
                        );
                      })}
                    </div>
                  )
              )}
            </div>
          )}

          {selectedPair.mode === "multiplicative" ? (
            <>
              <Waterfall
                steps={pairwiseToWaterfallSteps(
                  selectedPair,
                  methodShortLabel(selectedPair.methodIdA),
                  methodShortLabel(selectedPair.methodIdB)
                )}
              />
              {/* 読み下し文は図の直下に常設する(以前はtooltip-note扱いで読み飛ばされた)。 */}
              <p className="chart-narrative">{withMethodLabelsInText(selectedPair.narrative)}</p>
            </>
          ) : selectedPair.mode === "additive" ? (
            <>
              <Waterfall
                steps={additivePairSteps(
                  selectedPair,
                  methodShortLabel(selectedPair.methodIdA),
                  methodShortLabel(selectedPair.methodIdB)
                )}
              />
              {/* D-07-3:フォールバック文をそのまま出さず、なぜ0円かの理由まで書く(D-08と共用)。 */}
              <p className="chart-narrative">
                {zeroSideRecord
                  ? `${methodLabel(zeroSideRecord.methodId)}の中心値が0円のため、倍率での分解ができず金額差での表示になっています。0円になるのは、${zeroValueNote(zeroSideRecord)!.detail}`
                  : withMethodLabelsInText(selectedPair.narrative)}
              </p>
            </>
          ) : (
            <p className="chart-narrative">{withMethodLabelsInText(selectedPair.narrative)}</p>
          )}
        </Card>
      )}

      {/*
        (4) M4 U-3:レンジの幅の分解。中心値の3要因(上のウォーターフォール)は幅を変えないため、
        「なぜ幅が違うのか」は別の要因集合(層i・層ii)で説明する。
      */}
      {quantileDecomposition && (
        <Card
          title="幅が違う理由"
          subtitle={`${methodLabel(quantileDecomposition.methodIdA)} と ${methodLabel(quantileDecomposition.methodIdB)} の比較`}
          padBody={false}
          foot="中心値の差の要因(上)と幅の差の要因は別です。地域差の調整や対象範囲の違いは、幅ではなく水準を動かします"
        >
          {/* D-07-4:「中心値の差」と「幅の差」が別の分析であることを冒頭で明示する。 */}
          <p style={{ padding: "12px 18px 0", margin: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>
            上の「差が生じる理由」は中心値の違い、この表はレンジ幅(P5〜P95)の広さの違いを分解したものです。
          </p>
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
      {/* 上下の余白は globals.css の縦リズム規則(D-09)が与える。inline styleは書かない。 */}
      <div className="grid-2">
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
      <Card
        id="representative-selection"
        title="投資判断に使う代表値の選択"
        subtitle="この画面ですべきこと。推奨値は表示しません"
        padBody={false}
      >
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
              {/* 第4版 D-03:辞書が内訳値に対応していなかった時期に記録された変更履歴には、
                  手法IDがそのまま入っている。記録は書き換えず、表示時だけ読める名前にする。 */}
              <KV k="変更前" v={withMethodLabelsInText(changeLog.from)} />
              <KV k="変更後" v={withMethodLabelsInText(changeLog.to)} />
              <KV k="変更理由" v={changeLog.reason} />
            </>
          ) : (
            <p style={{ color: "var(--ink-faint)", fontSize: 12 }}>代表値の変更履歴はまだありません。</p>
          )}
        </div>
      </Card>

      {/*
        C-05:この画面の出口(代表値の選択)の直下で、他の課題がまだ未選択であることを知らせる。
        課題セレクタのドットと同じ状態(unselectedIssueIds)から出す。
        第6版 D-24:リンクは課題数に比例して伸びるため先頭5件に上限し、残りは件数で示す
        (全件は上の課題セレクタ(要対応ドット付き)から辿れる)。
      */}
      {(() => {
        const otherUnselected = unselectedIssueIds.filter((id) => id !== selectedIssueId);
        if (otherUnselected.length === 0) return null;
        const shownLinks = otherUnselected.slice(0, 5);
        const restCount = otherUnselected.length - shownLinks.length;
        return (
          <div className="cross-issue-note">
            <div className="section-label">まだ代表値を選んでいない課題</div>
            {shownLinks.map((id) => (
              <Link key={id} href={`/valuation?issue=${encodeURIComponent(id)}`} className="cross-issue-note__link">
                {labelForIssueId(id)}の代表値がまだ選ばれていません →
              </Link>
            ))}
            {restCount > 0 && (
              <p className="tooltip-note">
                ほか{restCount}件の課題で代表値が未選択です(上の課題セレクタの要対応ドットから確認できます)。
              </p>
            )}
          </div>
        );
      })()}

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
      <details className="foldout">
        <summary>
          詳しく見る:試算の幅に影響する要因
          <small>{primaryRecord ? methodLabel(primaryRecord.methodId) : ""}</small>
        </summary>
        <div className="foldout__body">
          <Tornado center={tornadoCenter} factors={tornadoFactors} />
          <p className="tooltip-note">
            パラメータ不確実性(層i)と確からしさ由来の移転誤差(層ii)のsigmaを中心値からの近似的な振れ幅として表示しています。
          </p>
        </div>
      </details>

      <details className="foldout">
        <summary>
          詳しく見る:試算に含めていない項目
          <small>除外した対象は黙って消さず、ここに残します</small>
        </summary>
        <div className="foldout__body">
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
