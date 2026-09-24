/**
 * 画面に出す表示ラベルの単一辞書(指示06)。
 *
 * 内部のenum値(`crosses`・`weak_reference` 等)と内部ID(`mi-xxx`・`site-042` 等)は
 * 画面本文に出さない。照合のためにIDが要る場面はtitle属性かMono小書きに退避する。
 * サーバーコンポーネントからも呼べるよう、純粋な定数・関数のみを置く(tag-utils.tsと同じ方針)。
 */

import type { AoPCode, ImpactCategory } from "@core/types/common";
import type { BindingMechanism, DecisionVerdict } from "@core/types/decision";
import type { GapType } from "@core/types/disclosure";
import type { DecisionImplication, DecompositionFactor } from "@core/types/divergence";
import type { ValuationTechnique, ZeroMeaningCode } from "@core/types/comparison";
import type { Availability } from "@core/types/trace";
import type { TagVariant } from "./tag-utils";

/**
 * ★判定(M6)。承認ラインが未入力の間は "pending"(仮の値を置かない、M6 D-10)。
 *
 * 2026-08-23レビュー:「またぐ/またがない」は抽象的で初見者に伝わらないため、
 * 判定の意味そのもの(投資判断の結論が変わるか)を言い切る表現に変更した。
 * 投資可否は断定しない(「結論が変わるか」の言い回しに徹する)規律は維持。
 */
export const VERDICT_LABEL: Record<DecisionVerdict, string> = {
  crosses: "承認ラインをまたぐ",
  does_not_cross: "承認ラインをまたがない",
  pending: "保留",
};

/** 台帳側は verdict を string で持つ列があるため、未知の値はそのまま返す。 */
export function verdictLabel(verdict: string): string {
  return VERDICT_LABEL[verdict as DecisionVerdict] ?? verdict;
}

export function verdictTagVariant(verdict: string): TagVariant {
  if (verdict === "crosses") return "warn";
  if (verdict === "pending") return "neutral";
  return "ok";
}

export type BindingKind = BindingMechanism["kind"];

export interface BindingOption {
  value: BindingKind;
  label: string;
  hint: string;
}

/**
 * 結果の反映先(M6 D-6の拘束方式)。選択フォームと、判定結果・変更履歴の表示が
 * 同じ1つの辞書を参照する。以前は binding-form.tsx にだけ日本語ラベルがあり、
 * 表示側は生値を出していた。
 */
export const BINDING_OPTIONS: BindingOption[] = [
  {
    value: "weak_reference",
    label: "稟議書に参考値として記載する",
    hint: "承認基準は変更せず、判断材料として共有する方針を記録します",
  },
  {
    value: "npv_formula_replacement",
    label: "投資判断の計算式そのものに組み込む",
    hint: "自然コストを含むNPVを社内の判定式に使う方針を記録します",
  },
  {
    value: "budget_allocation",
    label: "拠点の予算に実際に反映する",
    hint: "損益計画に組み込む対象と金額を記録します",
  },
  {
    value: "procurement_contract_clause",
    label: "調達契約の更新条件に組み込む",
    hint: "契約更新時に使う条項案を記録します",
  },
];

const BINDING_LABEL = new Map(BINDING_OPTIONS.map((option) => [option.value, option.label]));

export function bindingLabel(kind: string): string {
  return BINDING_LABEL.get(kind as BindingKind) ?? kind;
}

/** 評価カテゴリ。M3は気候・水に加え、LIME3単独で汚染・廃棄物・土地利用を扱う。 */
export const CATEGORY_LABEL: Record<ImpactCategory, string> = {
  water: "取水量・水ストレス",
  climate: "GHG排出量",
  pollution: "汚染物質の排出",
  waste: "廃棄物・資源循環",
  land_use: "土地利用・土地改変",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category as ImpactCategory] ?? category;
}

/**
 * 課題(MaterialIssue)の表示名。IDではなく「拠点名 × カテゴリ名」で示す。
 * 拠点名が引けない場合だけ、やむを得ずIDにフォールバックする。
 */
export function materialIssueLabel(siteName: string | undefined, category: string, fallbackId: string): string {
  return `${siteName ?? fallbackId} × ${categoryLabel(category)}`;
}

/**
 * 手法間の差を生む要因(M4の乖離分解)。③の画面と、ホームの発見サマリー(指示14)が
 * 同じ辞書を参照する。
 */
export const DECOMPOSITION_FACTOR_LABEL: Record<DecompositionFactor, string> = {
  endpointCoverage: "何を測っているかの違い(対象範囲)",
  discountRate: "割引率の違い",
  geographicCalibration: "地域差による調整の違い",
};

/**
 * 完成実装(M4 V2):要因は §5.5 の原因分類(`FactorCategory`)で表す。
 * 旧エンジンの3要因ID(endpointCoverage / discountRate / geographicCalibration)は
 * 保存済みrunの読み直し用に残す。
 */
export const FACTOR_CATEGORY_LABEL: Record<string, string> = {
  normalization: "比較前の表現合わせ(単位・通貨・価格年)",
  value_concept: "問いそのものの違い(価値概念)",
  coverage_pathway: "何を測っているかの違い(対象範囲・因果経路)",
  time_model: "時間の扱いの違い(割引率・予測期間)",
  geographic_model: "地域差による調整の違い",
  valuation_technique: "価値の測り方の違い(評価技法)",
  underlying_model_data: "基礎モデル・データの違い",
  unclassified: "分類できていない差",
};

export function decompositionFactorLabel(factor: string): string {
  return FACTOR_CATEGORY_LABEL[factor] ?? DECOMPOSITION_FACTOR_LABEL[factor as DecompositionFactor] ?? factor;
}

/**
 * 分解を止めた理由(§6.1・§6.3 の `StopReasonCode`)。1つの「比較できません」へ潰さず、
 * 利用者が次に何をすればよいか分かる言い方にする。
 */
export const STOP_REASON_LABEL: Record<string, string> = {
  different_subject: "比べている対象そのものが違う",
  value_concept_mismatch: "問い(価値概念)が違う",
  sign_mismatch: "費用と便益で符号の意味が違う",
  counterfactual_sign_mismatch: "計算途中で符号の意味が揃わない",
  non_finite: "計算に必要な値が欠けている",
  normalization_mismatch: "単位・通貨・価格年が揃っていない",
  recipe_missing: "この手法の組合せの比較手順が未登録",
  recipe_version_unsupported: "比較手順が対象の手法版に対応していない",
  recipe_not_registrable: "比較手順がまだレビュー中",
  trace_insufficient: "再計算に必要な計算過程が揃っていない",
  no_numerizable_factors: "差を数値で入れ替えられる要因が定義できない",
  budget_exceeded: "要因が多く計算量の上限を超える",
  full_decomposition_endpoint_mismatch: "完全分解の到達値が一致しない",
  efficiency_violation: "寄与の合計が全体差と一致しない",
  group_limit_exceeded: "同じ価値概念グループの手法数が上限を超えた",
  license_blocked: "ライセンス上この結果を表示できない",
};

export function stopReasonLabel(reason: string): string {
  return STOP_REASON_LABEL[reason] ?? reason;
}

/**
 * ゼロ値の意味(§5.6・T-15)。手法アダプターが出典付きで確定した区分を、
 * 「0円」という数値だけでは伝わらない別々の状態として画面に出す。
 */
export const ZERO_MEANING_LABEL: Record<ZeroMeaningCode, string> = {
  published_zero: "出典が0と公表",
  not_applicable: "概念が適用されない",
  not_covered: "手法の評価範囲外",
  below_detection_or_rounding: "閾値・丸めにより0",
  missing: "必要値が未取得",
  computed_zero: "入力0等により計算結果が0",
};

export function zeroMeaningLabel(code: string): string {
  return ZERO_MEANING_LABEL[code as ZeroMeaningCode] ?? code;
}

/**
 * 意思決定への含意(§6.4・T-15の2番目の見出し)。代表値選択・追加調査・比較不能の3種を
 * 見出し語にする。要約文(summary)はエンジンの決定論的テンプレートをそのまま使う。
 */
export const DECISION_IMPLICATION_LABEL: Record<DecisionImplication["kind"], string> = {
  representative_choice: "代表値を選べる",
  additional_investigation: "追加調査が必要",
  not_comparable: "比較できない",
};

export function decisionImplicationLabel(kind: string): string {
  return DECISION_IMPLICATION_LABEL[kind as DecisionImplication["kind"]] ?? kind;
}

/** 残差比率を表示できない理由(§6.4・§6.5)。相殺・全体差ゼロの場合に「割合表示不能」の内訳を示す。 */
export const RATIO_UNAVAILABLE_REASON_LABEL: Record<string, string> = {
  total_difference_within_tolerance: "全体差が許容誤差内のため割合を表示できません",
  mixed_signs: "寄与・残差の符号が混在するため割合を表示できません",
};

export function ratioUnavailableReasonLabel(reason: string | undefined): string {
  if (!reason) return "割合表示不能";
  return RATIO_UNAVAILABLE_REASON_LABEL[reason] ?? reason;
}

/**
 * 計算トレースの入手状態(`Availability.status`、trace.ts)。M3の`MethodAvailability`
 * (利用可能・利用条件確認中等、category-expansion.tsのavailabilityLabel)とは別の状態集合。
 */
const TRACE_AVAILABILITY_LABEL: Record<Availability["status"], string> = {
  available: "利用可能",
  not_applicable: "該当なし",
  not_published: "未公表",
  not_licensed: "ライセンス未許諾",
  unmapped: "未対応付け",
  not_implemented_formula_published: "式は公表済み・未実装",
};

export function traceAvailabilityLabel(status: string): string {
  return TRACE_AVAILABILITY_LABEL[status as Availability["status"]] ?? status;
}

/** 保護対象領域(AoP)。監査ドリルダウンの因果経路表示でのみ使う(M4要件定義書§6.2)。 */
const AOP_CODE_LABEL: Record<AoPCode, string> = {
  human_health: "人の健康",
  ecosystem_quality: "生態系の質",
  resource_availability: "資源の入手可能性",
  social_assets: "社会資産",
  unmapped: "未対応付け",
  not_applicable: "該当なし(エンドポイントモデルを使わない手法)",
};

export function aopCodeLabel(code: string): string {
  return AOP_CODE_LABEL[code as AoPCode] ?? code;
}

/** 価値評価技法(§5.2 因果経路の末端)。監査ドリルダウンでのみ使う。 */
const VALUATION_TECHNIQUE_LABEL: Record<ValuationTechnique, string> = {
  revealed_preference: "顕示選好法",
  stated_preference: "表明選好法",
  vsl: "統計的生命価値(VSL)",
  vsly: "統計的生存年価値(VSLY)",
  daly_monetization: "DALYの貨幣化(統合化係数)",
  replacement_cost: "代替費用法",
  avoided_cost: "回避費用法",
  damage_cost: "損害費用法",
  market_price: "市場価格法",
  benefit_transfer_esvd: "便益移転(ESVD)",
  unmapped: "未対応付け",
};

export function valuationTechniqueLabel(code: string): string {
  return VALUATION_TECHNIQUE_LABEL[code as ValuationTechnique] ?? code;
}

/** 入力が手法の前提と一致するか(`MethodEvaluationTrace.flowInterpretation.status`)。 */
const FLOW_INTERPRETATION_STATUS_LABEL: Record<"match" | "assumed_equivalent" | "mismatch", string> = {
  match: "入力と手法の前提が一致",
  assumed_equivalent: "同等とみなして適用(要確認)",
  mismatch: "入力と手法の前提が一致しない",
};

export function flowInterpretationStatusLabel(status: string): string {
  return FLOW_INTERPRETATION_STATUS_LABEL[status as keyof typeof FLOW_INTERPRETATION_STATUS_LABEL] ?? status;
}

/** トレースの各ステップが比較前正規化(reconciliation)か手法内部モデル(method_model)か(§5.5)。 */
export function traceStepRoleLabel(role: "reconciliation" | "method_model"): string {
  return role === "reconciliation" ? "比較前正規化(方法論寄与に含めない)" : "手法内部モデル";
}

/**
 * 要因ラベルの短縮版(2026-08-17レビュー・第5版)。ウォーターフォールのバー幅(84px)に対して
 * 通常表記(例:「地域差による調整の違い」)が長すぎ、2段振り分けをしても隣接バーの
 * ラベルと詰まって読みにくかった。図の軸ラベルにのみ使い、本文の読み下し文
 * (narrative)・凡例には通常表記を使う。
 */
export const DECOMPOSITION_FACTOR_SHORT_LABEL: Record<DecompositionFactor, string> = {
  endpointCoverage: "対象範囲の違い",
  discountRate: "割引率の違い",
  geographicCalibration: "地域差調整の違い",
};

/** 図の軸ラベル用の短縮版(§5.5 の原因分類と旧3要因の両方に対応する)。 */
export const FACTOR_CATEGORY_SHORT_LABEL: Record<string, string> = {
  normalization: "表現合わせ",
  value_concept: "問いの違い",
  coverage_pathway: "対象範囲の違い",
  time_model: "時間の扱いの違い",
  geographic_model: "地域差調整の違い",
  valuation_technique: "評価技法の違い",
  underlying_model_data: "基礎モデルの違い",
  unclassified: "未分類の差",
};

export function decompositionFactorShortLabel(factor: string): string {
  return (
    FACTOR_CATEGORY_SHORT_LABEL[factor] ??
    DECOMPOSITION_FACTOR_SHORT_LABEL[factor as DecompositionFactor] ??
    decompositionFactorLabel(factor)
  );
}

/**
 * 財務用語の一行説明(第4版 D-12)。④の画面で初出時に点線下線+titleで出す。
 *
 * 説明文の出典(推測で書かない):構想書 `docs/concept-v2.md` §9.3(M5:財務接続の式)と
 * M5要件定義 `docs/requirements/m5-financial-bridge.md` D-1〜D-5。
 * これらはPRISM独自の管理会計指標(非GAAP)であり、一般的な会計基準の用語ではない。
 */
export const FINANCIAL_TERM_NOTE: Record<string, string> = {
  "自然コスト反映後の営業利益":
    "営業利益(決算値)から、自然への依存で将来生じうるコストと、将来自社の負担になる見込みのコストを差し引いたPRISMの試算値です。決算書の数値でも、一般的な会計基準の用語でもありません。",
  依存リスク正常化調整:
    "自然への依存に伴って将来顕在化しうるコストの調整分です。価値の算定で選んだ交換価値の代表値から算出します。",
  将来内部化見込みコスト:
    "現在は支払っていないものの、規制や価格付けにより将来自社の負担になる見込みのコストです。自然債務(期待損失)の算出と接続しています。",
  確認済み増分便益:
    "資源売却など、根拠を確認でき、営業利益(決算値)にはまだ含まれていない増分便益です。自然債務や減損リスクとは相殺せず、利益への加算として別表示します。",
  "営業利益(決算値)":
    "決算書(監査済み財務諸表)に載っている営業利益です。PRISMは検証しません。",
  未内部化コスト:
    "算定した交換価値の総額から、既に炭素税・水利用料等として実際に支払っている額(内部化済み分)を差し引いた残りです。",
  内部化率:
    "算定した交換価値の総額のうち、既に実費として支払っている額の割合です(内部化済みコスト ÷ 総額)。",
  "自然債務(期待損失)":
    "未内部化コストに、炭素価格シナリオ別の内部化確率と割引係数を掛けて見込み額に変換した期待損失です。未内部化コストの全額を債務とはみなしません。",
  減損リスク:
    "減損テストとは、工場などの資産が帳簿どおりの価値を生めるかを確認する会計手続きです。自然関連の損失見込み(自然債務)が、その前提としている金額(目安額)を超えると、前提の見直しが必要になりえます。",
  "減損の目安額":
    "既存の減損テストで前提としている金額です。自然関連の損失見込み(自然債務)がこれを超えると、前提の見直しが必要になりえます。",
  "投資の承認ライン":
    "社内で投資が承認される基準の金額(投資稟議のハードル)です。財務・経営企画部門が保有していることが多い値です。",
  "投資価値(NPV)":
    "NPV(正味現在価値):投資が生む将来の利益を、現在の金額に換算して合計した値です。ここでは自然関連コストを含めない、通常の稟議で使う値を指します。",
  "自然コスト反映後の投資価値":
    "投資価値(NPV)に、自然関連のコスト・便益を加えた値です。この値の幅が投資の承認ラインと交差するかどうかで、判定が決まります。",
  利益への影響:
    "自然関連コストを差し引いたとき、営業利益が何%変わるかです。マイナスは利益の下振れを意味します。",
  社内試算値:
    "監査済みの決算書の数値ではなく、PRISMが算出した参考値です(いわゆる非GAAP指標)。",
  自然との関わり:
    "TNFDの5基準(水ストレス・生物多様性の重要性など)のうち、この拠点が該当した数です。数が多いほど自然への依存・影響が強く、評価の優先度が上がります。",
  "格付・資本コスト":
    "信用格付機関が一般的に参照する財務指標の変化を算術で示すものです。実際の格付・資本コストへの影響は予測・断定しません。",
};

export function financialTermNote(term: string): string | undefined {
  return FINANCIAL_TERM_NOTE[term];
}

/**
 * coreが生成する財務ラベル(bridge1.buildWaterfallStepsなど)の表示置換
 * (2026-08-23レビュー。packages/coreは変更しないため、表示時にのみ読み替える)。
 * 辞書にない語はそのまま返す(壊さない)。
 */
const FINANCIAL_DISPLAY_LABEL: Record<string, string> = {
  報告営業利益: "営業利益(決算値)",
  自然調整後営業利益: "自然コスト反映後の営業利益",
};

export function financialDisplayLabel(label: string): string {
  return FINANCIAL_DISPLAY_LABEL[label] ?? label;
}

/** 開示ギャップの種別(M7)。⑥の画面と、ホームの発見サマリーが同じ辞書を参照する。 */
export const GAP_TYPE_LABEL: Record<GapType, string> = {
  G1_no_evidence: "根拠なし",
  G2_weak_evidence: "根拠がやや弱い",
  G3_scope_mismatch: "対象範囲が一致しない",
  G4_period_mismatch: "対象期間が一致しない",
  G6_selective_disclosure: "触れていない対象がある",
};

export function gapTypeLabel(gapType: string): string {
  return GAP_TYPE_LABEL[gapType as GapType] ?? gapType;
}

/**
 * B-04:coreが生成する理由文には内部変数名(`normalizedScore=2.000`)や、第1版指示07で
 * 廃止した用語(「深掘り」)がそのまま残っているものがある(`packages/core`は変更不可)。
 * ここで実データの数値を使って平易文に組み替える。既知の2パターンだけを正規表現で
 * 解析し、他はそのまま表示する(壊さない)。ただし「深掘り」→「詳細評価」の語置換だけは
 * 未知パターンにも常に適用してよい(指示どおり)。
 *
 * パターンの出処: packages/core/src/assessment/depth-decision.ts のexclusionReason生成。
 */
const NORMALIZED_SCORE_EXCLUSION_PATTERN =
  /優先度算定の結果\(normalizedScore=([\d.]+)\)が上位(\d+)%に入らなかったため、深掘り評価には進みません。/;
const MANUAL_DEMOTION_PATTERN = /優先度算定では深掘り対象だったが、手動で概算評価に戻された。/;

export function formatDepthReason(reason: string): string {
  const scoreMatch = reason.match(NORMALIZED_SCORE_EXCLUSION_PATTERN);
  if (scoreMatch) {
    const [, score, percent] = scoreMatch;
    return `優先度が上位${percent}%に入らなかったため、概算評価に留まっています(スコア ${score})。`;
  }
  if (MANUAL_DEMOTION_PATTERN.test(reason)) {
    return "優先度算定では詳細評価の対象でしたが、手動で概算評価に戻されています。";
  }
  return reason.replace(/深掘り/g, "詳細評価");
}

/**
 * M1の課題除外理由(座標が解決できず評価に進めなかった行)。core側の文
 * (`packages/core/src/site/location.ts`)には第1版指示07で画面から外したTNFD用語
 * 「Locate」がそのまま残っているため、ここで平易な語に置き換える。パターンに
 * 一致しない場合は原文のまま返す(壊さない)。
 */
export function formatIssueExclusionReason(reason: string): string {
  return reason.replace(/Locate[((]空間突合[))]/g, "拠点と自然環境の空間突合").replace(/Locate/g, "空間突合");
}

/**
 * B-04(点検分):M6の深掘り推奨文(`packages/core/src/decision/dominant-assumption.ts`)は
 * `${methodId}の${要因ラベル}が、レンジを支配する主要な前提です。` という形で、内部の
 * 手法ID(例:`replacement-cost`)がそのまま先頭に出てしまう。手法IDだけを③と同じ
 * `METHOD_LABEL` 辞書(method-labels.ts)で日本語ラベルに差し替える。パターンに
 * 一致しない場合は原文のまま返す(壊さない)。
 */
const DOMINANT_ASSUMPTION_PATTERN = /^(.+?)の(.+)$/;

export function formatDominantAssumption(text: string, methodLabelFn: (methodId: string) => string): string {
  const match = text.match(DOMINANT_ASSUMPTION_PATTERN);
  if (!match) return text;
  const [, methodId, rest] = match;
  return `${methodLabelFn(methodId)}の${rest}`;
}

/** 拠点の種別。 */
export function siteTypeLabel(siteType: string): string {
  return siteType === "own_site" ? "自社拠点" : "サプライヤー拠点";
}

/**
 * 業種。取込CSVの `industry_sector` は自由記述だが、画面の選択肢は日本語で出す。
 * 内部値(英字)は既存データ(lib/demo/company.ts)と揃える。
 */
export const INDUSTRY_SECTOR_OPTIONS: { value: string; label: string }[] = [
  { value: "chemicals", label: "化学" },
  { value: "petrochemicals", label: "石油化学" },
  { value: "steel", label: "鉄鋼・金属" },
  { value: "textile", label: "繊維" },
  { value: "food", label: "食品・飲料" },
  { value: "electronics", label: "電機・電子" },
  { value: "machinery", label: "機械" },
  { value: "paper", label: "紙・パルプ" },
  { value: "other", label: "その他" },
];

const INDUSTRY_SECTOR_LABEL = new Map(INDUSTRY_SECTOR_OPTIONS.map((option) => [option.value, option.label]));

export function industrySectorLabel(sector: string): string {
  return INDUSTRY_SECTOR_LABEL.get(sector) ?? sector;
}
