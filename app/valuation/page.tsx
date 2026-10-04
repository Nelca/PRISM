import Link from "next/link";
import { sensitivityFraction } from "../components/criteria-labels";
import type { Metadata } from "next";
import { computeTornadoChart } from "@core/monetization/tornado";
import type { PairwiseDecompositionV2 } from "@core/types/divergence";
import { decomposeQuantileRange } from "@core/divergence/quantile-decomposition";
import type { ValuationRecord } from "@core/types/valuation";
import { loadPipelineView } from "@/lib/views/pipeline";
import {
  decompositionForMaterialIssue,
  materialIssueIdsRequiringRepresentativeSelection,
  materialIssueIdsWithoutRepresentativeSelection,
  maxDivergenceRatio,
  pairDivergenceRatio,
} from "@/lib/pipeline/open-tasks";
import { Num, formatYen, pickYenScale } from "../components/numeric";
import { Card, GuideBox, GuideButton, KV, ScreenLead, Stat, Tag } from "../components/ui";
import { tierLabel, tierTagVariant } from "../components/tag-utils";
import { StatGrid, StatTile, StatusBadge, ProgressRing, RangeBar, ActionRow } from "../components/viz";
import { methodLabel, methodShortLabel, withMethodLabelsInText } from "../components/method-labels";
import { categoryLabel, materialIssueLabel } from "../components/labels";
import { StepNav } from "../components/step-nav";
import { Football } from "../components/charts/Football";
import { Tornado } from "../components/charts/Tornado";
import { RepresentativeSelector } from "./representative-selector";
import { DataSourceAttribution } from "../components/attribution";
import { PipelineWarnings } from "../components/pipeline-warnings";
import { ScalableSelector } from "../components/scalable-selector";
import { TaskBanner } from "../components/task-banner";
import {
  pairImplicationDisplay,
  readablePairNarrative,
  recordZeroMeaning,
  residualRatioLabel,
  UNCERTAINTY_FACTOR_LABEL,
} from "./view-model";
import {
  availabilityLabel,
  coverageRows,
  coverageStatusLabel,
  inputDetail,
  inputSourceLabel,
  isLime3SingleMethodPilot,
  physicalQuantityLabel,
} from "./category-expansion";

export const metadata: Metadata = {
  title: "価値の算定 | PRISM",
};

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
  const result = await loadPipelineView();
  const { valuationRecordsByMaterialIssue, representativeRecordByMaterialIssue, m4ChangeLogByMaterialIssue } =
    result.valuation;
  const materialIssueIds = Object.keys(valuationRecordsByMaterialIssue);

  if (materialIssueIds.length === 0) {
    return (
      <div className="screen">
        <div className="screen__head">
          <div className="screen__title-row">
            <h1 className="screen__title">価値の算定</h1>
          </div>
          <ScreenLead>差の理由を確認し、投資判断に使う代表値を1つ選びます</ScreenLead>
        </div>
        {/* 空状態の3点セット(指示11):いま何がない/なぜないか/どこで何をするか+リンク */}
        <Card title="詳細評価の対象がまだありません">
          <p style={{ color: "var(--ink-faint)" }}>
            評価対象の絞り込みで課題を「詳細評価」に切り替えると、ここに算定結果が表示されます。
          </p>
          <ActionRow>
            <Link href="/assessment" className="pill-btn pill-btn--sm">
              評価対象の絞り込みへ →
            </Link>
          </ActionRow>
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
  const requiredSelectionIssueIds = materialIssueIdsRequiringRepresentativeSelection(result);
  const selectedSelectionCount = requiredSelectionIssueIds.length - unselectedIssueIds.length;

  const selectedIssueId = issueParam && materialIssueIds.includes(issueParam) ? issueParam : materialIssueIds[0];
  const records = valuationRecordsByMaterialIssue[selectedIssueId];
  const issue = issueById.get(selectedIssueId);
  const physicalQuantityId = records[0]?.physicalQuantityId;
  // 算定に使った物理量の実数(D-05。IDだけでなく「45,000 m3/年」の形で出す)。
  const physicalQuantity = result.valuation.physicalQuantityByMaterialIssue[selectedIssueId];
  const physicalQuantities = result.valuation.physicalQuantitiesByMaterialIssue[selectedIssueId] ?? [];
  const coverage = result.valuation.coverageByMaterialIssue[selectedIssueId];
  const methodAvailability = result.valuation.methodAvailabilityByMaterialIssue[selectedIssueId] ?? [];
  const isLime3Pilot = isLime3SingleMethodPilot(records);
  const exchangeRecords = records.filter((record) => record.valueConcept === "exchange");
  const corporateExchangeRecords = exchangeRecords.filter((record) => record.methodId === "company-exchange-value");
  const usesCorporateContributionModel =
    exchangeRecords.length > 0 && corporateExchangeRecords.length === exchangeRecords.length;

  // 指示09:③のこの画面では同じ対象の中心値・幅・代表値選択の各表に同じ金額群が繰り返し出る。
  // 行ごとに単位が割れないよう(百万円の行と億円の行が混ざらないよう)、この対象に出てくる
  // すべての金額から表全体で使うスケールを1つ決めて明示的に揃える。
  const recordScale = pickYenScale(
    ...records.flatMap((r) =>
      r.quantileRange ? [r.centralValue, r.quantileRange.p5, r.quantileRange.p95] : [r.centralValue]
    )
  );
  // RangeBarは同じ表の行でmin/maxを揃える(揃えないと行同士を比べられない)。この対象に出てくる手法のP95の最大値を軸の上限にする。
  const rangeMaxP95 = Math.max(0, ...records.filter((r) => r.quantileRange).map((r) => r.quantileRange!.p95));

  // 中心値が0円の手法(D-08:0の行も非表示にせず、理由を添えて出す)。同じ理由はまとめて1文にする。
  // 完成実装 §5.6:methodIdの文字列判定ではなく、手法アダプターが確定した trace.zeroMeaning を読む。
  const zeroRecords = records.filter((r) => recordZeroMeaning(r) !== null);
  const zeroNoteGroups = new Map<string, string[]>();
  for (const record of zeroRecords) {
    const note = recordZeroMeaning(record)!;
    zeroNoteGroups.set(note.detail, [...(zeroNoteGroups.get(note.detail) ?? []), methodLabel(record.methodId)]);
  }

  const footballMethods = records.filter((r) => r.quantileRange !== null).map((r) => ({
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
    group.crossMethodPairs.map((pair) => ({ concept: group.valueConcept, pair }))
  );
  const pairKeyOf = (pair: PairwiseDecompositionV2) => `${pair.methodIdA}~${pair.methodIdB}`;
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

  const currentRepresentativeId = representativeRecordByMaterialIssue[selectedIssueId];
  const changeLog = m4ChangeLogByMaterialIssue[selectedIssueId];

  // M4 §7.4:代表値の選択(利用者が実際に選んだ場合のみ存在する)。
  const selection = decomposition?.representativeValueSelection;
  const selectionStatus = result.valuation.representativeSelectionStatus[selectedIssueId];
  const selectedCentralValue = selection
    ? (records.find((r) => r.methodId === selection.selectedMethodId)?.centralValue as number | undefined)
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
  const tornadoEntries =
    primaryRecord && primaryRecord.parameterUncertainty.kind !== "not_available"
      ? computeTornadoChart(primaryRecord)
      : [];
  const tornadoCenter = primaryRecord ? (primaryRecord.centralValue) : 0;
  const tornadoFactors = tornadoEntries.map((e, i) => ({
    name: e.label,
    low: tornadoCenter * (1 - e.sigma),
    high: tornadoCenter * (1 + e.sigma),
    dominant: i === 0,
  }));

  const representativeActionCard = usesCorporateContributionModel ? (
    <Card
      id="representative-selection"
      title="財務ブリッジへ渡す企業交換価値"
      subtitle="同じカテゴリ内の費用項目は代替案ではないため、すべて拠点別内訳へ合算します"
      padBody={false}
      headExtra={<Tag variant="exchange">財務反映済み</Tag>}
    >
      <table className="data-table">
        <thead><tr><th>入力</th><th>企業負担総額</th><th>既に利益へ反映済み</th><th>確認済み増分便益</th><th>金額の基準</th></tr></thead>
        <tbody>
          {corporateExchangeRecords.map((record) => {
            const effect = record.financialEffectSnapshot!;
            return (
              <tr key={record.id}>
                <td><b>{inputDetail(record.inputSnapshot) ?? methodLabel(record.methodId)}</b></td>
                <td className="num"><Num value={effect.grossCost} unit="円" scale={recordScale} /></td>
                <td className="num"><Num value={effect.alreadyInternalizedCost} unit="円" scale={recordScale} /></td>
                <td className="num"><Num value={effect.verifiedIncrementalBenefit} unit="円" scale={recordScale} /></td>
                <td>{effect.amountBasis === "annual" ? "年額" : "一時費用"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ padding: "12px 18px", margin: 0, color: "var(--ink-soft)" }}>
        LIME3の厚生価値はこの合計へ含めません。既に利益へ反映済みの額は再控除せず、増分便益は自然債務・減損リスクと相殺しません。
      </p>
    </Card>
  ) : exchangeRecords.length > 0 ? (
    <Card
      id="representative-selection"
      title="投資判断に使う代表値の選択"
      subtitle="最初に完了する判断です。推奨値は表示しません"
      padBody={false}
    >
      <table className="data-table">
        <thead><tr><th>状態・操作</th><th>方法</th><th>確からしさ</th><th>中心値</th></tr></thead>
        <tbody>
          {exchangeRecords.map((record) => {
            const selected = record.id === currentRepresentativeId;
            return (
              <tr key={record.id} style={selected ? { background: "var(--accent-soft)" } : undefined}>
                <td>
                  {selected ? (
                    <>
                      <Tag variant="ok">選択中</Tag>
                      {Number(record.centralValue) === 0 && (
                        <p className="tooltip-note" style={{ marginTop: 4 }}>
                          中心値は0円です。投資判断の代表値として妥当か確認してください。
                        </p>
                      )}
                    </>
                  ) : (
                    <RepresentativeSelector
                      materialIssueId={selectedIssueId}
                      recordId={record.id}
                      methodId={record.methodId}
                      valueConcept={record.valueConcept}
                      fromLabel={methodLabel(records.find((candidate) => candidate.id === currentRepresentativeId)?.methodId)}
                      toLabel={methodLabel(record.methodId)}
                    />
                  )}
                </td>
                <td><b>{methodLabel(record.methodId)}</b></td>
                <td>{tierLabel(record.transferFitness.tier)}</td>
                <td className="num"><Num value={record.centralValue} unit="円" scale={recordScale} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: "12px 18px" }}>
        {changeLog ? (
          <>
            <div className="section-label">変更履歴</div>
            <KV k="変更前" v={withMethodLabelsInText(changeLog.from)} />
            <KV k="変更後" v={withMethodLabelsInText(changeLog.to)} />
            <KV k="変更理由" v={changeLog.reason} />
          </>
        ) : (
          <p style={{ color: "var(--ink-faint)", fontSize: 12 }}>代表値の変更履歴はまだありません。</p>
        )}
      </div>
    </Card>
  ) : (
    <Card
      id="representative-selection"
      title="企業財務への接続"
      subtitle="このカテゴリは厚生価値の参照値です"
      headExtra={<Tag variant="welfare">NPV・ROIには算入しません</Tag>}
    >
      <p style={{ margin: 0, color: "var(--ink-soft)" }}>
        現在の{categoryLabel(issue?.impactCategory ?? physicalQuantity?.category ?? "pollution")}の結果は社会的な厚生価値です。企業が保有する回避費用などの交換価値入力が登録されるまで、財務への影響・対策ROI・投資判定には加算しません。
      </p>
    </Card>
  );

  return (
    <div className="screen">
      <div className="screen__head">
        <div className="screen__title-row">
          <h1 className="screen__title">価値の算定</h1>
          <GuideButton />
        </div>
        <ScreenLead>課題を選んで算定方法ごとの金額を比較し、投資判断に使う値を理由とともに選びます。</ScreenLead>
        {/* C-04:仕組みの説明ではなく、この画面でする操作の順序を書く。 */}
        <GuideBox>
          投資判断に使う代表値を1つ選びます。迷う場合は「手法差を分析」で算定方法を比較します。
        </GuideBox>
      </div>

      {/* D-01-3:保存済みの操作のうち、今回の計算に反映できなかったものを黙って捨てない。 */}
      <PipelineWarnings warnings={result.warnings} screen="/valuation" />

      {/* D-11-1:残タスクの頭出し(最下部までスクロールしなくても見える)。 */}
      <TaskBanner current="/valuation" result={result} />

      <StatGrid columns={2}>
        <StatTile label="詳細評価の対象" value={materialIssueIds.length} unit="件" />
        <StatTile
          label="代表値の選択"
          value={`${selectedSelectionCount}/${requiredSelectionIssueIds.length}`}
          tone={unselectedIssueIds.length > 0 ? "pending" : "ok"}
          visual={
            <ProgressRing
              value={selectedSelectionCount}
              total={requiredSelectionIssueIds.length}
              label="代表値の選択"
              tone={unselectedIssueIds.length > 0 ? "pending" : "ok"}
              showText={false}
            />
          }
        />
      </StatGrid>

      {/*
        課題の切替(D-06:件数が増えても破綻しない共通セレクタ)。
        C-05の「代表値が未選択」ドットはピル・リストのどちらのモードでも出る。
      */}
      <ScalableSelector
        items={materialIssueIds.map((id) => ({
          id,
          label: labelForIssueId(id),
          href: `/valuation/${encodeURIComponent(id)}`,
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
          <Stat label={<span title="評価できた基準のうち該当した数。データ不足で未評価の基準は分母に含めません">自然との関わり</span>} value={issue ? `${sensitivityFraction(issue)}` : "—"} />
          <Stat
            label={physicalQuantity ? physicalQuantityLabel(physicalQuantity.category) : "物理量"}
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

      <section className="primary-action" aria-labelledby="valuation-primary-action">
        <div>
          <p className="primary-action__eyebrow">次の判断</p>
          <h2 id="valuation-primary-action">
            {usesCorporateContributionModel
              ? "企業交換価値の財務反映を確認する"
              : exchangeRecords.length > 0
                ? unselectedIssueIds.includes(selectedIssueId)
                  ? "投資判断に使う代表値を選ぶ"
                  : "選択した代表値を確認する"
                : "厚生価値の入力根拠を確認する"}
          </h2>
          <p>
            {exchangeRecords.length > 0
              ? "代表値の状態を確認し、下に表示された手法別の試算幅と照合します。"
              : "この結果は企業NPV・ROIへ加算せず、開示の参考値として扱います。"}
          </p>
        </div>
        <div className="primary-action__links">
          {exchangeRecords.length > 0 ? (
            <a href="#representative-selection" className="pill-btn pill-btn--primary">代表値の欄へ</a>
          ) : (
            <Link href={`/evidence?issue=${encodeURIComponent(selectedIssueId)}`} className="pill-btn pill-btn--primary">入力根拠を見る</Link>
          )}
          {decomposition && <Link href={`/analysis?issue=${encodeURIComponent(selectedIssueId)}`}>手法差を分析</Link>}
          <Link href={`/evidence?issue=${encodeURIComponent(selectedIssueId)}`}>証拠・入力根拠</Link>
        </div>
      </section>

      {representativeActionCard}

      {isLime3Pilot && (
        <div className="pipeline-warning" role="status">
          <div className="pipeline-warning__title">LIME3単独パイロット</div>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink)" }}>
            {categoryLabel(issue?.impactCategory ?? physicalQuantity?.category ?? "pollution")}は現在LIME3だけで算定しています。手法間比較と代表値選択は行わず、社会的な厚生価値として参照します。
          </p>
        </div>
      )}

      {(coverage || methodAvailability.length > 0 || physicalQuantities.length > 1) && (
        <Card
          title="入力・算定カバレッジ"
          subtitle="入力量を欠落させず、算定できない理由も記録します"
          padBody={false}
          foot="移動量は環境への放出量として算定しません。PRTR等の入力・LIME3算定だけでTNFD等の完全準拠を示すものではありません。"
        >
          {coverage && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>状態</th>
                  <th>量（単位別）</th>
                  <th>行数</th>
                </tr>
              </thead>
              <tbody>
                {coverageRows(coverage).map(([status, quantity, unit, rowCount]) => (
                  <tr key={`${status}-${unit}`}>
                    <td>
                      <Tag variant={status === "calculated" ? "ok" : status === "transferOnly" ? "neutral" : "warn"}>
                        {coverageStatusLabel(status)}
                      </Tag>
                    </td>
                    <td className="num"><Num value={quantity} /> {unit}</td>
                    <td className="num">{rowCount}件</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {coverage && (coverage.mappingVersion || coverage.coefficientVersion) && (
            <div style={{ padding: "12px 18px 0" }}>
              <KV k="入力元" v={inputSourceLabel(coverage.sourceKind)} />
              <KV k="対象期間" v={coverage.reportingPeriod} />
              {coverage.mappingVersion && <KV k="対応表の版" v={coverage.mappingVersion} />}
              {coverage.coefficientVersion && <KV k="係数セットの版" v={coverage.coefficientVersion} />}
            </div>
          )}
          {methodAvailability.length > 0 && (
            <div style={{ padding: coverage ? "12px 18px" : "0 18px 12px" }}>
              <div className="section-label">手法・ライセンスの状態</div>
              {methodAvailability.map((availability) => (
                <KV
                  key={availability.methodId}
                  k={methodLabel(availability.methodId)}
                  v={
                    <>
                      <Tag variant={availability.status === "available" ? "ok" : "warn"}>{availabilityLabel(availability)}</Tag>
                      {availability.reason && <span className="cell-note">{availability.reason}</span>}
                      {availability.licenseExpiresAt && <span className="cell-note">有効期限 {availability.licenseExpiresAt}</span>}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </Card>
      )}

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
              <th title="算定の確からしさ。A=現地評価に近い/B=補正付きで実務利用可/C=桁の把握のみ/直接算定=他地域の研究値を借りていないため等級の対象外">確からしさ</th>
              <th>中心値</th>
              <th style={{ minWidth: 170 }}>幅(P5〜P95)</th>
              <th>係数・対応表</th>
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
                  <StatusBadge variant={tierTagVariant(r.transferFitness.tier)} title={tierLabel(r.transferFitness.tier)}>
                    {tierLabel(r.transferFitness.tier)}
                  </StatusBadge>
                </td>
                <td className="num" style={{ fontWeight: 600 }}>
                  <Num value={r.centralValue} unit="円" scale={recordScale} />
                  {/* D-08:0円の行は非表示にせず、なぜ0かの短い注記を値の隣に付ける(§5.6:trace.zeroMeaning由来)。 */}
                  {recordZeroMeaning(r) && (
                    <span className="cell-note" style={{ fontWeight: 400 }} title={recordZeroMeaning(r)!.detail}>
                      0の意味:{recordZeroMeaning(r)!.badgeLabel}
                    </span>
                  )}
                </td>
                <td className="num">
                  {r.quantileRange ? (
                    <>
                      <Num value={r.quantileRange.p5} unit="円" scale={recordScale} /> 〜{" "}
                      <Num value={r.quantileRange.p95} unit="円" scale={recordScale} />
                      <div style={{ marginTop: 4 }}>
                        <RangeBar
                          low={r.quantileRange.p5}
                          mid={r.quantileRange.p50}
                          high={r.quantileRange.p95}
                          min={0}
                          max={rangeMaxP95}
                          label={`${methodLabel(r.methodId)}の試算の幅`}
                          tone={r.valueConcept === "welfare" ? "neutral" : "accent"}
                          format={(n) => formatYen(n, recordScale)}
                        />
                      </div>
                    </>
                  ) : (
                    "不確実性情報未取得"
                  )}
                </td>
                <td style={{ fontSize: 11.5 }}>
                  {r.factorSnapshot ? (
                    <>
                      <b>{r.factorSnapshot.factorId}</b>
                      <span className="id-note">{r.factorSnapshot.methodVersion} ・ {r.factorSnapshot.sourceHash.slice(0, 12)}</span>
                      <span className="id-note">利用条件 {r.factorSnapshot.licenseMode}{r.factorSnapshot.licenseValidUntil ? ` ・ 有効期限 ${r.factorSnapshot.licenseValidUntil}` : ""}</span>
                      {r.mappingSnapshot && <span className="id-note">対応表 {r.mappingSnapshot.mappingVersion}</span>}
                      {r.currencyConversion && (
                        <span className="id-note">
                          {r.currencyConversion.fromCurrency}→{r.currencyConversion.toCurrency} {r.currencyConversion.rate} ({r.currencyConversion.rateDate}・{r.currencyConversion.source})
                        </span>
                      )}
                    </>
                  ) : r.financialEffectSnapshot ? (
                    <>
                      <b>{r.financialEffectSnapshot.sourceLabel}</b>
                      <span className="id-note">{r.financialEffectSnapshot.dataVersion}</span>
                      <span className="id-note">出典 {r.financialEffectSnapshot.sourceHash.slice(0, 12)}</span>
                      <span className="id-note">二重計上防止 {r.financialEffectSnapshot.doubleCountKey}</span>
                    </>
                  ) : (
                    "既存手法の係数"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {records.some((record) => inputDetail(record.inputSnapshot)) && (
        <Card title="入力行別の算定明細" subtitle="算定対象となった正規化入力（廃棄物の内部処理費用は社会的費用へ加算しません）">
          {records.map((record) => {
            const detail = inputDetail(record.inputSnapshot);
            if (!detail) return null;
            return (
              <KV
                key={record.id}
                k={methodLabel(record.methodId)}
                v={`${detail} ・ ${new Intl.NumberFormat("ja-JP").format(record.inputSnapshot!.physicalQuantity)} ${record.inputSnapshot!.unit}`}
              />
            );
          })}
        </Card>
      )}

      <details className="foldout">
        <summary>
          この画面内で詳細分析を確認する
          <small>試算幅・手法差・不確実性をこの画面でまとめて表示しています</small>
        </summary>
        <div className="foldout__body">
      {/* (2) 試算の幅(フットボールチャートは画面に1回だけ) */}
      <Card
        title="試算の幅(手法別)"
        headExtra={maxRatio !== null && maxRatio > 1.5 ? <Tag variant="warn">最大で{maxRatio.toFixed(1)}倍の差</Tag> : undefined}
        foot="単位:円/年 ・ 紫は社会全体への影響(投資判断には使用しません)"
      >
        <Football methods={footballMethods} />
        {footballMethods.length === 0 && (
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>
            出典に不確実性分布がないため、根拠のないP5〜P95を作らず中心値だけを表示しています。
          </p>
        )}
        {/* D-08:0円の手法がある場合、なぜ0かをチャートの直下でも説明する。 */}
        {zeroRecords.length > 0 && (
          <p className="tooltip-note">
            {[...zeroNoteGroups.entries()].map(([detail, names]) => `${names.join("・")}が0円の理由:${detail}`).join(" ")}
          </p>
        )}
      </Card>

      {/*
        (3) 差が生じる理由(T-16.1:詳細な要因分解・監査ドリルダウンは/analysisの責務。
        ここでは結論・含意・寄与合計・残差の要約とリンクに留め、重複表示をしない)。
      */}
      {selectedPair && (
        <Card
          id="pair-comparison"
          title="差が生じる理由"
          subtitle={`${methodLabel(selectedPair.methodIdA)} と ${methodLabel(selectedPair.methodIdB)} の比較`}
        >
          {pairOptions.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-label">比較するペアの選択(同じ価値概念どうしのみ。既定は差が最大のペア)</div>
              {decomposition?.groups.map(
                (group) =>
                  group.crossMethodPairs.length > 0 && (
                    <div key={group.valueConcept} className="selector-pills" style={{ marginBottom: 6, alignItems: "center" }}>
                      <Tag variant={group.valueConcept === "welfare" ? "welfare" : "exchange"}>
                        {group.valueConcept === "welfare" ? "厚生価値" : "交換価値"}
                      </Tag>
                      {group.crossMethodPairs.map((pair) => {
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

          {/* 結論(/analysisと同じ語彙・同じ関数)。 */}
          <p className="chart-narrative">{withMethodLabelsInText(readablePairNarrative(selectedPair))}</p>

          {/* 含意・寄与合計・残差の要約。詳細な内訳・監査ドリルダウンは/analysisで確認する。 */}
          <div className="grid-3">
            <Stat label="意思決定への含意" value={pairImplicationDisplay(selectedPair).headingLabel} />
            {selectedPair.status === "decomposed" ? (
              <>
                <Stat
                  label="寄与合計"
                  value={
                    selectedPair.mode === "multiplicative"
                      ? `×${Math.exp(selectedPair.explainedSum).toFixed(2)}`
                      : <Num value={selectedPair.explainedSum} unit="円/年" scale={recordScale} />
                  }
                />
                <Stat
                  label="残差"
                  value={
                    selectedPair.residual.displayMultiplier !== null
                      ? `×${selectedPair.residual.displayMultiplier.toFixed(2)}(比率:${residualRatioLabel(selectedPair.residual)})`
                      : <Num value={selectedPair.residual.value} unit="円/年" scale={recordScale} />
                  }
                />
              </>
            ) : (
              <Stat label="停止理由" value={pairImplicationDisplay(selectedPair).stopReasonLabel ?? "—"} />
            )}
          </div>
          <div className="detail-actions">
            <Link href={`/analysis?issue=${encodeURIComponent(selectedIssueId)}&pair=${encodeURIComponent(pairKeyOf(selectedPair))}#pair-conclusion`}>
              結論・寄与・残差・監査ドリルダウンを詳しく見る →
            </Link>
          </div>
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
        </div>
      </details>

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
            {exchangeGroup.recordMethodIds.map((id) => {
              const r = records.find((rec) => rec.methodId === id && rec.valueConcept === "exchange");
              if (!r) return null;
              return <KV key={id} k={methodLabel(id)} v={<Num value={r.centralValue} unit="円" scale={recordScale} />} />;
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
            {welfareGroup.recordMethodIds.map((id) => {
              const r = records.find((rec) => rec.methodId === id && rec.valueConcept === "welfare");
              if (!r) return null;
              return <KV key={id} k={methodLabel(id)} v={<Num value={r.centralValue} unit="円" scale={recordScale} />} />;
            })}
            <div style={{ marginTop: 10 }}>
              <Tag variant="welfare">開示にのみ使用します</Tag>
            </div>
            <p className="tooltip-note">この値は投資判断には使用せず、開示の参考情報としてのみ使用します。</p>
          </div>
        )}
      </div>

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
              <Link key={id} href={`/valuation/${encodeURIComponent(id)}`} className="cross-issue-note__link">
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
          {tornadoFactors.length > 0 ? (
            <>
              <Tornado center={tornadoCenter} factors={tornadoFactors} />
              <p className="tooltip-note">
                パラメータ不確実性(層i)と確からしさ由来の移転誤差(層ii)のsigmaを中心値からの近似的な振れ幅として表示しています。
              </p>
            </>
          ) : (
            <p style={{ color: "var(--ink-soft)" }}>出典に不確実性分布がないため、要因別の幅は表示しません。</p>
          )}
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

      <DataSourceAttribution sources={isLime3Pilot ? ["AIST-IDEA LIME3 Ver.4.0", "World Bank"] : ["World Bank"]} />
      <StepNav current="/valuation" result={result} />
    </div>
  );
}
