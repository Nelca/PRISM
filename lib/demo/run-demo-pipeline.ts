/**
 * ダミーデータをpackages/core/src/pipeline/*に接続し、M1〜M8の結果を1つにまとめる。
 * UIページ・出力API・GATE検証テストの3箇所から同じ結果を参照するための単一の入口。
 *
 * 深掘り評価(M3)〜開示検証(M7)は、架空企業site-042専用の固定値(company.ts)に加え、
 * 追加登録された拠点についても、深掘りに進んだ拠点1件ごとに
 * 同じ組み立てロジックを繰り返して実行する(user-site-defaults.tsの汎用ビルダーを使う)。
 *
 * **入力はすべて引数で受け取る**(2026-08-08、永続化対応)。以前はプロセス内ストア
 * (site-store.ts / interaction-store.ts)を直接読んでいたが、拠点も操作も
 * DBのテーブルになったため、読み出しは呼び出し側(lib/pipeline/execute-run.ts)の責務にした。
 * これによりこのファイルは副作用を持たない純粋な組み立て関数になり、テストからも
 * 任意の入力で呼べる。
 */

import { runAssessmentPipeline } from "@core/pipeline/assessment-pipeline";
import { runValuationPipeline } from "@core/pipeline/valuation-pipeline";
import { RepresentativeValueSelectionError } from "@core/divergence/representative-value";
import { runDecisionPipeline } from "@core/pipeline/decision-pipeline";
import { NoContributingRecordError } from "@core/decision/dominant-assumption";
import { runDisclosurePipeline } from "@core/pipeline/disclosure-pipeline";
import { createIdSequence } from "@core/pipeline/ids";
import { getPluginsForCategory } from "@core/monetization/registry";
import { createSeededRng } from "@core/monetization/rng";
import { runFinancialBridgePipeline } from "@core/pipeline/financial-bridge-pipeline";
import { exchangeAmount } from "@core/types/common";
import type { ExchangeAmount } from "@core/types/common";
import type { ExchangeValuationRecord, WelfareValuationRecord } from "@core/types/valuation";
import type { DisclosureClaim } from "@core/types/disclosure";
import type { EvidenceCandidate } from "@core/disclosure/evidence-match";
import type { IntentionalDecisionInput } from "@core/pipeline/disclosure-pipeline";
import type { BaselineNpvInput, CarbonPriceScenario } from "@core/types/financial-bridge";
import type { ApprovalThreshold, BindingMechanism } from "@core/types/decision";
import { convertNgfsPriceToJpy, lookupNgfsCarbonPrice } from "@core/financial-bridge/carbon-price-trajectory";
import {
  BASELINE_NPV,
  buildClimateCountermeasureCandidates,
  buildCountermeasureCandidates,
  CLIMATE_BASELINE_NPV,
  CLIMATE_DEEP_DIVE_CALIBRATION,
  CLIMATE_DEEP_DIVE_CONFIG,
  CLIMATE_DEEP_DIVE_INPUT,
  CLIMATE_DEEP_DIVE_PHYSICAL_QUANTITY_ID,
  CLIMATE_FINANCIALS,
  COMPANY_NAME,
  DEEP_DIVE_CALIBRATION,
  DEEP_DIVE_CONFIG,
  DEEP_DIVE_INPUT,
  DEEP_DIVE_PHYSICAL_QUANTITY_ID,
  demoGeocode,
  DISCLOSURE_CLAIM,
  excludedCategoriesForSite,
  FLAGSHIP_FINANCIALS,
  interfacesByCategoryForSite,
  PRIOR_YEAR_METHOD_BY_MATERIAL_ISSUE,
  resolveCriterionForDemo,
  screeningValuationForMaterialIssue,
  SITE_ROWS,
} from "./company";
import type { CountermeasureCandidate } from "./company";

/**
 * 気候カテゴリ実証用の拠点(四日市工場、GAP-11・D-128)。この拠点だけを他と区別する
 * 分岐が複数箇所にあるため、定数化してハードコード文字列の重複を避ける。
 */
const CLIMATE_SITE_ID = "site-070";
import type { UserSiteEntry } from "./site-entry";
import {
  buildUserBaselineNpv,
  buildUserCountermeasureCandidates,
  buildUserDeepDiveConfig,
  buildUserDisclosureClaim,
  buildUserFinancials,
  DEFAULT_DEEP_DIVE_PARAMS,
} from "./user-site-defaults";
import { emptyInteractionState } from "./interaction-state";
import type { InteractionState } from "./interaction-state";
import { methodLabel } from "@/app/components/method-labels";
import { buildDisclosureExclusions } from "./build-disclosure-exclusions";
import { buildDemoRecalculationHash } from "./build-recalculation-hash";

/**
 * 「保存済みの操作のうち、今回の計算にそのまま適用できなかったもの」の記録(第4版 D-01-3)。
 *
 * 操作イベントは追記のみで消せない(計画B-1)。過去に保存された操作が、その後の
 * 設定変更などで解釈できなくなることは起こりうる。そのとき**黙って無視せず**、
 * 何が適用されなかったのかを結果に載せ、該当画面に表示する。
 */
export interface PipelineWarning {
  /** Reactのkeyと重複排除に使う内部キー。画面には出さない。 */
  id: string;
  /** この警告を表示する画面のパス。 */
  screen: string;
  /** 画面にそのまま出す平易な日本語。内部IDや例外文言は含めない。 */
  message: string;
}

const NOW = "2027-02-14T09:12:00Z";
const DECISION_MAKER = "宮里(サステナビリティ推進室)";


/** M6 D-6の拘束方式定義の版。DecisionRecordの再計算ハッシュに入る(GAP-06)。 */
const DECISION_VERSIONS = { bindingMechanismDefinitionVersion: "binding-mechanism-v1" };

const DECOMPOSITION_VERSIONS = {
  algorithmVersion: "shapley-v1",
  cicesMatchLevel: "group",
  aopMappingVersion: "aop-mapping-v1",
  f3ThresholdVersion: "f3-v1",
  f8ThresholdVersion: "f8-v1",
} as const;

/** MaterialIssue.id は "${siteId}-mi-${category}" の形式(build-material-issues.ts)。 */
function siteIdFromMaterialIssueId(materialIssueId: string): string {
  return materialIssueId.replace(/-mi-\w+$/, "");
}

export interface RunPipelineInput {
  /** 追加登録された拠点(架空企業site-042の固定データは company.ts が持つ)。 */
  userSites: UserSiteEntry[];
  /** 追記イベントを畳み込んだユーザー操作の現在値。 */
  interactions: InteractionState;
  /**
   * モンテカルロの乱数シード。runと一緒に保存され、後から同じ結果を再現するために使う。
   * 以前は Math.random をグローバルに差し替えていた(D-103)が、
   * packages/core が rng を引数で受け取れるようになったため廃止した。
   */
  rngSeed: number;
}

/**
 * M6の計算に使える不確実性レンジを持つレコードか。
 *
 * `packages/core` の M6 は、対策で回避できる自然関連コストのレンジを
 * 「出典ValuationRecordの p5/p50・p95/p50 の比」で按分する(nature-adjusted-npv.ts)。
 * さらに深掘り推奨の特定は「(p95-p5)/p50 が最大のレコード」を選ぶ(dominant-assumption.ts)。
 * **中心値(p50)が0のレコードを出典にすると、この2つの割り算が 0/0 = NaN になり、
 * 支配的レコードが1件も選べず `NoContributingRecordError` が投げられる。**
 *
 * IFVIの水アクセス係数(VFaccess)は日本の公表値が0であり(company.ts の
 * `ifvi-vfaccess: 0.0`、IFVI Table D1)、これを代表値に選ぶとこの条件に合致する。
 * `packages/core` は変更しない方針のため、**出典レコードの選定をデモ層で行う。**
 */
function hasUsableUncertaintyRange(record: ExchangeValuationRecord): boolean {
  const { p5, p50, p95 } = record.quantileRange;
  return Number.isFinite(p5) && Number.isFinite(p50) && Number.isFinite(p95) && p50 !== 0;
}

export function runDemoPipeline(input: RunPipelineInput = defaultRunPipelineInput()) {
  const warnings: PipelineWarning[] = [];
  const idSequence = createIdSequence("ae");
  const rng = createSeededRng(input.rngSeed);
  const userSiteEntries = input.userSites;
  const interactions = input.interactions;
  const deepDiveParamsBySiteId = new Map(userSiteEntries.map((entry) => [entry.row.id, entry.deepDive]));

  // --- M2:優先度算定の結果によらない手動昇格/降格を合成する ---
  /**
   * 「上位20%」は`Math.ceil(件数 × 0.2)`(暫定値、depth-decision.ts)であり、母集団が小さいと
   * 昇格枠が1件しかない。site-070(気候)を母集団に追加したことで、この1件枠を
   * site-042(水)と奪い合う形になり、母集団のスコア次第でsite-042が自然昇格から
   * 外れてしまうことが分かった(D-128で発見)。**flagshipのデモ拠点(site-042)は
   * 常に深掘りを見せる前提のため、site-070と同様に明示的な手動昇格に切り替える。**
   */
  const manualOverrides = new Set([
    ...userSiteEntries.filter((entry) => entry.deepDive.forcePromote).map((entry) => `${entry.row.id}-mi-water`),
    "site-042-mi-water",
    // 気候カテゴリ実証用の拠点は自然な優先度順位に委ねず、確実にdeep_diveへ昇格させる(D-128)。
    `${CLIMATE_SITE_ID}-mi-climate`,
  ]);
  const manualDemotions = new Set<string>();
  for (const [materialIssueId, mode] of interactions.depthOverrides) {
    if (mode === "promote") manualOverrides.add(materialIssueId);
    else manualDemotions.add(materialIssueId);
  }

  const assessment = runAssessmentPipeline({
    rows: [...SITE_ROWS, ...userSiteEntries.map((entry) => entry.row)],
    geocode: demoGeocode,
    interfacesByCategoryForSite,
    excludedCategoriesForSite,
    resolveCriterion: resolveCriterionForDemo,
    screeningValuationForMaterialIssue: (issue) => screeningValuationForMaterialIssue(issue.siteId, issue.impactCategory),
    promotionOptions: { manualOverrides, manualDemotions },
    idSequence,
    now: NOW,
  });

  const promoted = assessment.depthDecisions.filter((d) => d.depth === "deep_dive");

  /**
   * 保存済みの代表値選択が、現在の手法セットに存在しない手法を指している場合、
   * coreは `RepresentativeValueSelectionError` を投げる(representative-value.ts)。
   * 深掘り設定やプラグイン構成が変わると起こりうる。**この1件のせいで
   * 画面全体が使えなくなることを避けるため、その課題の選択だけを外して再実行し、
   * 適用できなかったことを警告として残す**(第4版 D-01-3)。
   *
   * 再実行はID採番・乱数列を引き継ぐため、値は「壊れた操作が1件ある」入力に対して
   * 一意に決まる(同じ入力からは同じ結果が出る、という再現性の前提は保たれる)。
   */
  const skippedSelections = new Set<string>();
  let selectionInFlight: string | undefined;

  const valuationOptions = {
    materialIssueIds: promoted.map((d) => d.materialIssueId),
    deepDiveConfigForMaterialIssue: (materialIssueId: string) => {
      const siteId = siteIdFromMaterialIssueId(materialIssueId);
      if (siteId === "site-042") {
        return {
          physicalQuantityId: DEEP_DIVE_PHYSICAL_QUANTITY_ID,
          input: DEEP_DIVE_INPUT,
          config: DEEP_DIVE_CONFIG,
          calibration: DEEP_DIVE_CALIBRATION,
          // waterカテゴリのみに絞る(GAP-14で気候プラグインが追加されたため、ALL_PLUGINSを渡すと
          // waterのMethodConfigに気候用の係数が無くevaluate()がエラーになる)。
          plugins: getPluginsForCategory("water"),
          // v1(pppValue=1.0恒等)→v2(pppValue=94.46実値)。パラメータ実値が変わったため版を上げる。
          calibrationSetVersion: "ifvi-water-consumption-v2",
          reconciliationFunctionVersion: "ifvi-reconciliation-v1",
          fitnessTierThresholdVersion: "fitness-tier-v1",
        };
      }
      if (siteId === CLIMATE_SITE_ID) {
        return {
          physicalQuantityId: CLIMATE_DEEP_DIVE_PHYSICAL_QUANTITY_ID,
          input: CLIMATE_DEEP_DIVE_INPUT,
          config: CLIMATE_DEEP_DIVE_CONFIG,
          calibration: CLIMATE_DEEP_DIVE_CALIBRATION,
          // climateカテゴリのみに絞る(waterのMethodConfigには気候用の係数が無い)。
          plugins: getPluginsForCategory("climate"),
          calibrationSetVersion: "ghg-carbon-price-conversion-v1",
          reconciliationFunctionVersion: "none", // reconciliationを持たないプラグイン(交換価値・厚生価値の合成不可)
          fitnessTierThresholdVersion: "fitness-tier-v1",
        };
      }
      const params = deepDiveParamsBySiteId.get(siteId) ?? DEFAULT_DEEP_DIVE_PARAMS;
      return buildUserDeepDiveConfig(siteId, params);
    },
    /**
     * M4 §7.4:代表値の選択。**利用者が実際に選んだときだけ**渡す。
     * 未選択のまま既定値(代替費用法)を使っている状態を「選択した」と記録しない
     * (選択には理由が必須であり、理由をシステムが捏造しないため)。
     */
    representativeSelectionForMaterialIssue: (materialIssueId: string) => {
      if (skippedSelections.has(materialIssueId)) return undefined;
      const selection = interactions.representativeSelection.get(materialIssueId);
      if (!selection) return undefined;
      selectionInFlight = materialIssueId;
      return {
        groupValueConcept: selection.valueConcept,
        selectedMethodId: selection.methodId,
        reason: selection.reason,
        priorYearMethodId: PRIOR_YEAR_METHOD_BY_MATERIAL_ISSUE[materialIssueId],
      };
    },
    decompositionVersions: DECOMPOSITION_VERSIONS,
    idSequence,
    now: NOW,
    rng,
  };

  let valuation: ReturnType<typeof runValuationPipeline>;
  for (;;) {
    selectionInFlight = undefined;
    try {
      valuation = runValuationPipeline(valuationOptions);
      break;
    } catch (error) {
      const target = selectionInFlight;
      if (!(error instanceof RepresentativeValueSelectionError) || !target || skippedSelections.has(target)) {
        throw error;
      }
      skippedSelections.add(target);
      warnings.push({
        id: `representative-selection-unusable-${target}`,
        screen: "/valuation",
        message:
          "保存されている代表値の選択のうち1件は、現在の算定手法の一覧に無い手法を指しているため適用できませんでした。" +
          "この課題は既定の代表値で計算しています。もう一度、代表値を選び直してください。",
      });
    }
  }

  const allValuationRecords = Object.values(valuation.valuationRecordsByMaterialIssue).flat();

  /**
   * 算定に使った物理量の実数(第4版 D-05)。ValuationRecordは物理量のIDしか持たないため、
   * ③の画面が「取水量 45,000 m3/年」のような実数を表示できるよう、深掘り設定から引き写す。
   */
  const physicalQuantityByMaterialIssue = Object.fromEntries(
    Object.keys(valuation.valuationRecordsByMaterialIssue).map((materialIssueId) => {
      const { input } = valuationOptions.deepDiveConfigForMaterialIssue(materialIssueId);
      return [materialIssueId, { category: input.category, quantity: input.physicalQuantity, unit: input.unit }];
    })
  );

  // --- M4:代表値選択(未選択時はreplacement-costをデフォルト代表値とする) ---
  const representativeRecordByMaterialIssue: Record<string, string> = {};
  const m4ChangeLogByMaterialIssue: Record<string, { from: string; to: string; reason: string }> = {};
  for (const materialIssueId of Object.keys(valuation.valuationRecordsByMaterialIssue)) {
    const records = valuation.valuationRecordsByMaterialIssue[materialIssueId];
    const defaultRecord = records.find((r) => r.methodId === "replacement-cost") ?? records[0];
    const overrideId = interactions.representativeRecordId.get(materialIssueId);
    const overrideRecord = overrideId ? records.find((r) => r.id === overrideId) : undefined;
    /**
     * 保存済みの上書きが、現在の算定結果に存在しない行を指している場合(深掘り設定の
     * 変更などで算定結果の構成が変わったとき)。既定値に戻して計算は続けるが、
     * **黙って無視せず**適用できなかったことを画面に出す(第4版 D-01-3)。
     */
    if (overrideId && !overrideRecord) {
      warnings.push({
        id: `representative-record-unresolved-${materialIssueId}`,
        screen: "/valuation",
        message:
          "保存されている代表値の指定のうち1件は、現在の算定結果に無い行を指しているため適用できませんでした。" +
          "この課題は既定の代表値で計算しています。もう一度、代表値を選び直してください。",
      });
    }
    const representative = overrideRecord ?? defaultRecord;
    if (representative) representativeRecordByMaterialIssue[materialIssueId] = representative.id;
    const changeLog = interactions.m4ChangeLog.get(materialIssueId);
    if (changeLog) m4ChangeLogByMaterialIssue[materialIssueId] = changeLog;
  }

  /**
   * M5・M6は交換価値(exchange)のレコードのみを使う(厚生価値は投資判断に使わない、という
   * 既存の設計原則。company.tsコメント参照)。代表値の上書きが厚生価値を指していても、
   * 決定計算では常にexchange概念のレコードにフォールバックする。
   *
   * **2026-08-15改修(D-128):** 従来は`${siteId}-mi-water`にハードコードしており、
   * 気候カテゴリの拠点(GAP-11実証用)では代表値が引けなかった。1拠点につき現状は
   * 深掘りに昇格するMaterialIssueが1つだけという前提(`promoted`から実際に昇格した
   * materialIssueIdを引く)は変えず、カテゴリを決め打ちしない形に一般化した。
   * デフォルトの手法(`methodId === "replacement-cost"`)も、水以外のカテゴリには存在しない
   * ため`valueConcept === "exchange"`の先頭レコードに一般化した。
   */
  function representativeRecordForSite(siteId: string): ExchangeValuationRecord | undefined {
    const materialIssueId = promoted.find((d) => siteIdFromMaterialIssueId(d.materialIssueId) === siteId)?.materialIssueId;
    if (!materialIssueId) return undefined;
    const records = valuation.valuationRecordsByMaterialIssue[materialIssueId] ?? [];
    const id = representativeRecordByMaterialIssue[materialIssueId];
    const overridden = records.find((r) => r.id === id && r.valueConcept === "exchange");
    const fallback = records.find((r) => r.valueConcept === "exchange");
    return (overridden ?? fallback) as ExchangeValuationRecord | undefined;
  }

  // --- M5:財務接続、M6:対策案比較と意思決定(深掘りに進んだ拠点1件ごと) ---
  const promotedSiteIds = [...new Set(promoted.map((d) => siteIdFromMaterialIssueId(d.materialIssueId)))];

  const decisions = promotedSiteIds.flatMap((siteId) => {
    const siteRecords = allValuationRecords.filter((r) => r.siteId === siteId);
    const representative = representativeRecordForSite(siteId);
    if (!representative) return [];

    const site = assessment.sites.find((s) => s.id === siteId);
    if (!site) return [];

    /**
     * M6の対策案が参照する「回避できる自然関連コストの出典レコード」。
     *
     * 原則は代表値そのもの(M6要件定義書§(D-3):M4で選んだ代表値をそのまま引き継ぐ)。
     * ただし中心値が0円のレコードは、coreがレンジを按分するときの分母になれない
     * (`hasUsableUncertaintyRange` のコメント参照)。その場合だけ、同じ拠点の
     * 交換価値レコードのうちレンジを持つものを出典に使い、**代表値そのもの
     * (M5の財務接続で使う値)は利用者が選んだままにする。**差し替えたことは
     * 警告として画面に出す(第4版 D-01)。
     */
    const usableExchangeRecords = siteRecords.filter(
      (r): r is ExchangeValuationRecord => r.valueConcept === "exchange" && hasUsableUncertaintyRange(r as ExchangeValuationRecord)
    );
    const costSourceRecord = hasUsableUncertaintyRange(representative) ? representative : usableExchangeRecords[0];
    if (!costSourceRecord) {
      warnings.push({
        id: `countermeasure-source-missing-${siteId}`,
        screen: "/decision",
        message:
          `${site.name}では、試算の幅を持つ交換価値の算定結果がないため、対策案の比較と投資判断への反映を計算できませんでした。` +
          "詳細評価の入力値(物理量・単価)をご確認ください。",
      });
      return [];
    }
    if (costSourceRecord.id !== representative.id) {
      warnings.push({
        id: `countermeasure-source-fallback-${siteId}`,
        screen: "/decision",
        message:
          `${site.name}で選択中の代表値「${methodLabel(representative.methodId)}」は中心値が0円のため、` +
          `対策案の効果の幅(P5〜P95)の計算には「${methodLabel(costSourceRecord.methodId)}」の試算の幅を使用しています。` +
          "自然調整後営業利益など、財務への影響の金額は選択中の代表値のままです。",
      });
    }

    const isFlagshipSite = siteId === "site-042";
    const isClimateShowcaseSite = siteId === CLIMATE_SITE_ID;

    // ブリッジ2(厚生価値ビュー)の情報源。水はlime3-water、気候は社会的費用(GAP-11・D-128)。
    // いずれも常にwelfare概念を返す(monetization/plugins/lime3-water.ts・ghg-carbon-price-conversion.ts)。
    const welfareMethodId = isClimateShowcaseSite ? "ghg-carbon-price-conversion.ghg-social-cost" : "lime3-water";
    const lime3 = siteRecords.find((r) => r.methodId === welfareMethodId) as WelfareValuationRecord | undefined;
    const deepDiveParams = deepDiveParamsBySiteId.get(siteId) ?? DEFAULT_DEEP_DIVE_PARAMS;

    /**
     * M6 D-4・D-10:通常NPVと承認閾値は企業提供。画面から入力されていればそれを使う。
     * **承認閾値が未入力なら "pending" を渡す。**業界標準値で仮置きしない(D-10のC案却下理由)。
     * 未入力でも自然調整後NPVのレンジ・自然関連コストは通常どおり算出される(段階的開示)。
     */
    const enteredParameters = interactions.decisionParameters.get(siteId);
    const baselineNpv: BaselineNpvInput = enteredParameters
      ? {
          value: enteredParameters.baselineNpvValue,
          discountRate: enteredParameters.discountRate,
          horizon: enteredParameters.horizon,
          source: "manual_entry",
        }
      : isFlagshipSite
        ? BASELINE_NPV
        : isClimateShowcaseSite
          ? CLIMATE_BASELINE_NPV
          : buildUserBaselineNpv(deepDiveParams);

    const approvalThreshold: ApprovalThreshold | "pending" = enteredParameters
      ? enteredParameters.approvalThresholdValue === null
        ? "pending"
        : { value: exchangeAmount(enteredParameters.approvalThresholdValue), source: "manual_entry" }
      : {
          value: exchangeAmount(
            isFlagshipSite
              ? BASELINE_NPV.value + 25_000_000
              : isClimateShowcaseSite
                ? CLIMATE_BASELINE_NPV.value + 10_000_000
                : deepDiveParams.approvalThresholdValue
          ),
          source: "manual_entry",
        };

    // --- M5:財務接続(パイプライン層経由。以前はデモ層が各関数を直接呼んでいた、GAP-10)---
    // 画面から入力された財務データがあればそれを使う(M5 D-1:企業提供・PRISMは検証しない)。
    const entered = interactions.companyFinancials;
    const companyFinancials = entered
      ? {
          reportedOperatingProfit: exchangeAmount(entered.reportedOperatingProfit),
          currentlyInternalizedCost: exchangeAmount(entered.currentlyInternalizedCost),
          existingImpairmentThreshold: exchangeAmount(entered.existingImpairmentThreshold),
          creditMetrics: {
            netDebt: entered.netDebt,
            ebitda: entered.ebitda,
            interestExpense: entered.interestExpense,
          },
        }
      : isFlagshipSite
        ? FLAGSHIP_FINANCIALS
        : isClimateShowcaseSite
          ? CLIMATE_FINANCIALS
          : buildUserFinancials(deepDiveParams);

    /**
     * GAP-11(D-127・D-128):気候カテゴリの拠点(site-070)だけ、NGFSのシナリオ別炭素価格軌道を
     * 使って実際にシナリオごとに異なる未内部化コストを計算する。水カテゴリの拠点は
     * 従来どおり(全シナリオ共通の`uninternalizedCost`)のまま変更しない。
     *
     * 対象年は2030年(period=5・NOW=2027年のため、軌道データの5年刻みのうち直近の年)。
     * `gx_ets_official`シナリオは指定せず、`representative`(GX-ETS価格ベース)の
     * 基準コストにフォールバックさせる(4シナリオ分のみ上書きする設計、nature-debt.ts参照)。
     */
    const uninternalizedCostByScenario: Partial<Record<CarbonPriceScenario, ExchangeAmount>> | undefined =
      isClimateShowcaseSite
        ? (() => {
            const physicalQuantityTco2 = CLIMATE_DEEP_DIVE_INPUT.physicalQuantity;
            const year = 2030;
            const costFor = (scenario: "net_zero_2050" | "current_policies", model: "gcam" | "remind") =>
              exchangeAmount(
                physicalQuantityTco2 * convertNgfsPriceToJpy(lookupNgfsCarbonPrice(scenario, model, "japan", year)) -
                  (companyFinancials.currentlyInternalizedCost as number)
              );
            return {
              ngfs_net_zero_2050_gcam: costFor("net_zero_2050", "gcam"),
              ngfs_net_zero_2050_remind: costFor("net_zero_2050", "remind"),
              ngfs_current_policies_gcam: costFor("current_policies", "gcam"),
              ngfs_current_policies_remind: costFor("current_policies", "remind"),
            };
          })()
        : undefined;

    const financialBridgeResult = runFinancialBridgePipeline({
      exchangeRecord: representative,
      ...(lime3 ? { welfareRecord: lime3 } : {}),
      // 以前は通常NPVを報告営業利益として渡していた(別概念の値の代入)。企業提供の
      // 報告営業利益を使う。実データの入口はT-15(財務パラメータ入力UI)で作る。
      reportedOperatingProfit: companyFinancials.reportedOperatingProfit,
      currentlyInternalizedCost: companyFinancials.currentlyInternalizedCost,
      existingImpairmentThreshold: companyFinancials.existingImpairmentThreshold,
      financials: companyFinancials.creditMetrics,
      // 5シナリオ均等割り(M5 D-4.3の中立的な初期値。PRISMは特定シナリオを推奨しない)。
      // NGFS 2シナリオはGCAM/REMIND-MAgPIEの2モデルに分けている(D-127)。
      internalizationProbabilities: [
        { scenario: "ngfs_net_zero_2050_gcam", probability: 1 / 5, period: 5 },
        { scenario: "ngfs_net_zero_2050_remind", probability: 1 / 5, period: 5 },
        { scenario: "ngfs_current_policies_gcam", probability: 1 / 5, period: 5 },
        { scenario: "ngfs_current_policies_remind", probability: 1 / 5, period: 5 },
        { scenario: "gx_ets_official", probability: 1 / 5, period: 5 },
      ],
      discountRate: baselineNpv.discountRate,
      socialCostInternalizationRate: 0.15,
      ...(uninternalizedCostByScenario ? { uninternalizedCostByScenario } : {}),
    });

    const financialBridge = {
      bridge1: financialBridgeResult.bridge1,
      bridge2: financialBridgeResult.bridge2,
      internalizationStatus: financialBridgeResult.internalizationStatus,
      natureDebt: financialBridgeResult.natureDebt,
    };
    const comparisonTargets = financialBridgeResult.comparisonTargets;

    // --- M6:対策案4種を並行して計算し、比較テーブル/散布図に使う ---
    const candidates: CountermeasureCandidate[] = isFlagshipSite
      ? buildCountermeasureCandidates(costSourceRecord.id)
      : isClimateShowcaseSite
        ? buildClimateCountermeasureCandidates(costSourceRecord.id)
        : buildUserCountermeasureCandidates(siteId, costSourceRecord.id, deepDiveParams);

    /**
     * coreが `avoidedNatureCost[].sourceValuationRecordId` を解決するための辞書。
     * 代表値と出典レコードが別になりうる(上記)ため両方を入れる。
     */
    const valuationRecordsById: Record<string, ExchangeValuationRecord> = {
      [representative.id]: representative,
      [costSourceRecord.id]: costSourceRecord,
    };

    const bindingState = interactions.bindingMechanismState.get(siteId);
    const bindingMechanism: BindingMechanism = bindingState?.mechanism ?? { kind: "weak_reference" };
    const bindingHistory = bindingState?.history ?? [];
    const latestBindingChange = bindingHistory[bindingHistory.length - 1];

    /**
     * 第5版レビュー(2026-08-17):「対策を実施せず監視を継続」案は回避コストが0円のため
     * `avoidedNatureCost: []`で構成される(コスト0=対策なしを正しく表す設計)。
     * この案のNPVレンジは通常NPVちょうどに退化し(p5=p50=p95)、承認閾値がその値と
     * 一致する入力だと★判定が「またぐ」になる。`identifyDominantAssumption`
     * (M6 D-3、packages/core・変更不可)は「参照できるValuationRecordが1つもない」を
     * エラーとして扱うため、この組み合わせで`runDecisionPipeline`が例外を投げる。
     *
     * 以前はこの例外が保存前の検証(D-01-2)を通らないケースでは捕捉されるが、
     * **保存済みのrunを読み直すだけの経路(`executeAndPersistRun`)では捕捉されず、
     * ページ全体がクラッシュしていた。**候補1件の計算失敗で画面全体を落とさず、
     * その候補だけを比較対象から外し、理由を警告として残す(黙って消さない、第4版D-01-3と同じ規律)。
     */
    const countermeasureCandidates = candidates.flatMap((candidate) => {
      try {
        const previewDecision = runDecisionPipeline({
          id: `dr-${siteId}-${candidate.key}-preview`,
          decisionTarget: "investment_approval",
          decisionMaker: DECISION_MAKER,
          decisionDate: "2027-02-14",
          approvalThreshold,
          relatedValuationRecords: [representative],
          baselineNpv,
          countermeasures: [candidate.countermeasure],
          valuationRecordsById,
          bindingMechanism,
          versions: DECISION_VERSIONS,
          idSequence,
          now: NOW,
        });
        return [
          {
            key: candidate.key,
            label: candidate.label,
            investmentCost: candidate.countermeasure.investmentCost,
            avoidedPhysicalQuantity: candidate.avoidedPhysicalQuantity,
            decisionRecord: previewDecision.decisionRecord,
          },
        ];
      } catch (cause) {
        /**
         * ここで捕捉してよいのは`NoContributingRecordError`(M6 D-3)だけに限る。
         * 承認閾値がちょうど通常NPVと一致し、かつ回避コスト0円の対策(「対策を実施せず
         * 監視を継続」)が選ばれたときにだけ起こる、構造的に無害な退化ケース。
         * それ以外の例外(例:評価期間を超えるavoidedNatureCost)は**利用者の入力自体が
         * 不正である**ことを示す正当なエラーのため、ここで握りつぶさず再送出し、
         * 呼び出し元(`tryRunAndPersist`の事前検証)で正しく「保存しない」判断をさせる。
         */
        if (!(cause instanceof NoContributingRecordError)) throw cause;
        console.error(`[run-demo-pipeline] 対策案「${candidate.label}」(${siteId})の計算に失敗しました:`, cause);
        warnings.push({
          id: `countermeasure-preview-failed-${siteId}-${candidate.key}`,
          screen: "/decision",
          message: `${site.name}の対策案「${candidate.label}」は、承認基準がちょうど通常NPVと一致する等の理由で計算できなかったため、比較対象から除いています。`,
        });
        return [];
      }
    });
    if (countermeasureCandidates.length === 0) {
      warnings.push({
        id: `countermeasure-all-failed-${siteId}`,
        screen: "/decision",
        message: `${site.name}では対策案をどれも計算できなかったため、対策と判定を計算できませんでした。投資の承認ラインの入力値をご確認ください。`,
      });
      return [];
    }

    const requestedKey = interactions.selectedCountermeasureKey.get(siteId);
    const selectedKey = countermeasureCandidates.some((c) => c.key === requestedKey)
      ? requestedKey!
      : countermeasureCandidates[0].key;
    if (requestedKey && requestedKey !== selectedKey) {
      warnings.push({
        id: `countermeasure-selection-unavailable-${siteId}`,
        screen: "/decision",
        message: `${site.name}で選択されていた対策案は今回計算できなかったため、既定の対策案で計算しています。`,
      });
    }
    const selectedCandidateSource = candidates.find((c) => c.key === selectedKey)!;

    let decision;
    try {
      decision = runDecisionPipeline({
        id: isFlagshipSite ? "dr-site042-2027" : `dr-${siteId}-2027`,
        decisionTarget: "investment_approval",
        decisionMaker: DECISION_MAKER,
        decisionDate: "2027-02-14",
        approvalThreshold,
        relatedValuationRecords: [representative],
        baselineNpv,
        countermeasures: [selectedCandidateSource.countermeasure],
        valuationRecordsById,
        bindingMechanism,
        versions: DECISION_VERSIONS,
        ...(latestBindingChange
          ? {
              bindingMechanismChange: {
                previousMechanism: latestBindingChange.previousMechanism,
                reason: latestBindingChange.reason,
                changedAt: latestBindingChange.changedAt,
              },
            }
          : {}),
        idSequence,
        now: NOW,
      });
    } catch (cause) {
      // 上と同じ理由で、捕捉範囲を`NoContributingRecordError`だけに限る。
      if (!(cause instanceof NoContributingRecordError)) throw cause;
      console.error(`[run-demo-pipeline] ${siteId}の判定計算に失敗しました:`, cause);
      warnings.push({
        id: `decision-failed-${siteId}`,
        screen: "/decision",
        message: `${site.name}の判定を計算できなかったため、対策と判定・財務への影響を表示できませんでした。投資の承認ラインまたは選択中の対策案をご確認ください。`,
      });
      return [];
    }
    // 直近の変更のみpipelineの標準経路でAssumptionEntryを生成する。それより前の変更は
    // このデモが毎回ゼロから再計算する構成上、当時のAssumptionEntryを再現できないため、
    // bindingMechanismHistory配列にのみ反映する(表示上の履歴としては完全な形にする)。
    const decisionRecord = {
      ...decision.decisionRecord,
      bindingMechanismHistory: bindingHistory,
    };

    return [
      {
        siteId,
        siteName: site.name,
        decision: { decisionRecord, assumptionEntries: decision.assumptionEntries },
        financialBridge,
        comparisonTargets,
        countermeasureCandidates,
        selectedCountermeasureKey: selectedKey,
      },
    ];
  });

  // --- M7:開示検証(site-042固定claim + 深掘りに進んだ他拠点の自動生成claim) ---
  // site-070(気候カテゴリ実証用、D-128)は除外する。buildUserDisclosureClaimは水消費削減の
  // コミットメントを模した文言を生成するため、気候カテゴリの拠点には意味を持たない。
  const decisionsForAutoClaims = decisions.filter((d) => d.siteId !== "site-042" && d.siteId !== CLIMATE_SITE_ID);
  const userClaims: DisclosureClaim[] = decisionsForAutoClaims.map((d) => {
    const site = assessment.sites.find((s) => s.id === d.siteId)!;
    const params = deepDiveParamsBySiteId.get(d.siteId) ?? DEFAULT_DEEP_DIVE_PARAMS;
    return buildUserDisclosureClaim(site, params);
  });
  // 実際にアップロードされたPDFからAIが抽出したclaim(GAP-05)。特定拠点のvaluation recordとの
  // 紐づけは持たないため、candidatesForClaimは常に空を返し、段階3はG1(証拠なし)と判定する
  // (推測でsiteを割り当てない。D-15)。
  const extractedClaims: DisclosureClaim[] = [...interactions.extractedDisclosureClaimsBySourceDocument.values()].flat();
  const baseClaims: DisclosureClaim[] = [DISCLOSURE_CLAIM, ...userClaims, ...extractedClaims];
  const claimSiteId = new Map<string, string>([[DISCLOSURE_CLAIM.id, "site-042"]]);
  userClaims.forEach((claim, i) => claimSiteId.set(claim.id, decisionsForAutoClaims[i].siteId));

  // M7①(記載を弱める)の上書きテキストを適用する。
  const claims: DisclosureClaim[] = baseClaims.map((claim) => {
    const overrideText = interactions.disclosureClaimOverrideText.get(claim.id);
    return overrideText ? { ...claim, rawText: overrideText } : claim;
  });

  const candidatesForClaim = (claim: DisclosureClaim): EvidenceCandidate[] => {
    const siteId = claimSiteId.get(claim.id);
    return allValuationRecords
      .filter((r) => r.siteId === siteId)
      .map((r) => ({
        recordId: r.id,
        category: "water",
        period: claim.extractedMetadata.periodMentioned ?? { startYear: 2027, endYear: 2030 },
        scope: claim.extractedMetadata.scopeMentioned ?? "",
        transferFitnessTier: r.transferFitness.tier,
      }));
  };

  // M7③(意図的判断として記録)はclaimId単位で保存されているが、coreのAPIはgapFindingId単位
  // で受け取る。gapFindingIdはidSequence()から動的に生成されるため、まず使い捨てのidSequence
  // で発見用に1回実行し、claimId→gapFindingIdの対応を得てから本番の実行を行う(2パス方式)。
  /**
   * G6(選択的開示)の情報源。build-plan §5.5が「M7のG6を可能にする唯一の情報源」と書いた
   * M1・M2の除外理由記録を、そのままM7の射影型に写す。**新しい判断を加えない。**
   */
  const exclusions = buildDisclosureExclusions(assessment);

  const discoveryDisclosure = runDisclosurePipeline({
    claims,
    candidatesForClaim,
    exclusions,
    idSequence: createIdSequence("discovery"),
    now: NOW,
  });
  const gapFindingIdByClaimId = new Map(discoveryDisclosure.gapFindings.map((f) => [f.claimId, f.id]));

  const intentionalDecisionInputs: IntentionalDecisionInput[] = [];
  for (const [claimId, stored] of interactions.intentionalDecisions) {
    const gapFindingId = gapFindingIdByClaimId.get(claimId);
    if (!gapFindingId) continue;
    intentionalDecisionInputs.push({ gapFindingId, reason: stored.reason, recordedBy: DECISION_MAKER, recordedAt: stored.recordedAt });
  }

  const disclosure = runDisclosurePipeline({
    claims,
    candidatesForClaim,
    exclusions,
    intentionalDecisions: intentionalDecisionInputs,
    idSequence,
    now: NOW,
  });

  // --- M8:パイプライン全体のRecalculationHash ---
  const recalculationHash = buildDemoRecalculationHash(DECOMPOSITION_VERSIONS);

  const assumptionEntries = [
    ...assessment.assumptionEntries,
    ...valuation.assumptionEntries,
    ...decisions.flatMap((d) => d.decision.assumptionEntries),
    ...disclosure.assumptionEntries,
  ];

  return {
    companyName: COMPANY_NAME,
    assessment,
    valuation: {
      ...valuation,
      representativeRecordByMaterialIssue,
      m4ChangeLogByMaterialIssue,
      physicalQuantityByMaterialIssue,
    },
    decisions,
    disclosure,
    disclosureClaims: claims,
    disclosureClaimSiteId: Object.fromEntries(claimSiteId),
    recalculationHash,
    assumptionEntries,
    actionLog: interactions.actionLog,
    /** 適用できなかった操作(第4版 D-01-3)。該当画面が上部に表示する。 */
    warnings,
  };
}

/**
 * 入力を渡さずに呼ばれた場合の既定値(架空企業1社分のみ・操作なし・固定シード)。
 * GATE検証テストのように「追加拠点も操作もない状態」を対象とする呼び出し元のために残す。
 */
function defaultRunPipelineInput(): RunPipelineInput {
  return { userSites: [], interactions: emptyInteractionState(), rngSeed: DEFAULT_RNG_SEED };
}

/** 既定のシード。runごとに変える必要はない(同じ入力からは同じ結果が出ることを優先する)。 */
export const DEFAULT_RNG_SEED = 42;

/**
 * 保存済みrunの`result`(jsonb)の構造の版。
 *
 * ページは再計算せず保存済みrunを読む(計画B-2)。そのため**結果の構造を変える
 * コード変更をすると、古い形のまま保存されたrunを新しいコードが読んで壊れる。**
 * この版を上げると、読み出し時に自動で再実行される(lib/pipeline/execute-run.ts)。
 *
 * **結果オブジェクトの形を変えたら必ず上げること。**値の計算方法だけを変えた場合は
 * 上げなくても壊れないが、過去のrunと比較したいなら上げる方が安全。
 */
// 7: 減損判定を自然債務の絶対額比較に修正・比率差分の単位をptから倍に変更(2026-08-23、
//    comparison-targets.ts)。形は同じだが保存済みrunの判定・文言を新計算で作り直すために上げる。
export const RESULT_SCHEMA_VERSION = 7;

export type DemoPipelineResult = ReturnType<typeof runDemoPipeline>;
