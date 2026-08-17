/**
 * 画面に出す表示ラベルの単一辞書(指示06)。
 *
 * 内部のenum値(`crosses`・`weak_reference` 等)と内部ID(`mi-xxx`・`site-042` 等)は
 * 画面本文に出さない。照合のためにIDが要る場面はtitle属性かMono小書きに退避する。
 * サーバーコンポーネントからも呼べるよう、純粋な定数・関数のみを置く(tag-utils.tsと同じ方針)。
 */

import type { ImpactCategory } from "@core/types/common";
import type { BindingMechanism, DecisionVerdict } from "@core/types/decision";
import type { GapType } from "@core/types/disclosure";
import type { DecompositionFactor } from "@core/types/divergence";
import type { TagVariant } from "./tag-utils";

/** ★判定(M6)。承認閾値が未入力の間は "pending"(仮の値を置かない、M6 D-10)。 */
export const VERDICT_LABEL: Record<DecisionVerdict, string> = {
  crosses: "基準をまたぐ",
  does_not_cross: "基準をまたがない",
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
    hint: "記録には残りますが、判断そのものへの影響は限定的です",
  },
  {
    value: "npv_formula_replacement",
    label: "投資判断の計算式そのものに組み込む",
    hint: "投資判断プロセスの計算式自体を更新します",
  },
  {
    value: "budget_allocation",
    label: "拠点の予算に実際に反映する",
    hint: "拠点の損益計画に金額として組み込みます",
  },
  {
    value: "procurement_contract_clause",
    label: "調達契約の更新条件に組み込む",
    hint: "サプライヤーとの契約条項に反映します",
  },
];

const BINDING_LABEL = new Map(BINDING_OPTIONS.map((option) => [option.value, option.label]));

export function bindingLabel(kind: string): string {
  return BINDING_LABEL.get(kind as BindingKind) ?? kind;
}

/** 評価カテゴリ。M3は現状 water と climate を実装している(pollutionは型のみ)。 */
export const CATEGORY_LABEL: Record<ImpactCategory, string> = {
  water: "取水量・水ストレス",
  climate: "GHG排出量",
  pollution: "汚染物質の排出",
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

export function decompositionFactorLabel(factor: string): string {
  return DECOMPOSITION_FACTOR_LABEL[factor as DecompositionFactor] ?? factor;
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

export function decompositionFactorShortLabel(factor: string): string {
  return DECOMPOSITION_FACTOR_SHORT_LABEL[factor as DecompositionFactor] ?? decompositionFactorLabel(factor);
}

/**
 * 財務用語の一行説明(第4版 D-12)。④の画面で初出時に点線下線+titleで出す。
 *
 * 説明文の出典(推測で書かない):構想書 `docs/concept-v2.md` §9.3(M5:財務接続の式)と
 * M5要件定義 `docs/requirements/m5-financial-bridge.md` D-1〜D-5。
 * これらはPRISM独自の管理会計指標(非GAAP)であり、一般的な会計基準の用語ではない。
 */
export const FINANCIAL_TERM_NOTE: Record<string, string> = {
  自然調整後営業利益:
    "報告営業利益から「依存リスクの正常化調整」と「将来内部化見込みコスト」を差し引いた、PRISM独自の管理会計指標です。一般的な会計基準の用語ではありません。",
  依存リスク正常化調整:
    "自然への依存に伴って将来顕在化しうるコストの調整分です。価値の算定(③)で選んだ交換価値の代表値から算出します。",
  将来内部化見込みコスト:
    "現在は支払っていないものの、規制や価格付けにより将来自社の負担になる見込みのコストです。自然債務(期待損失)の算出と接続しています。",
  未内部化コスト:
    "算定した交換価値の総額から、既に炭素税・水利用料等として実際に支払っている額(内部化済み分)を差し引いた残りです。",
  内部化率:
    "算定した交換価値の総額のうち、既に実費として支払っている額の割合です(内部化済みコスト ÷ 総額)。",
  "自然債務(期待損失)":
    "未内部化コストに、炭素価格シナリオ別の内部化確率と割引係数を掛けて見込み額に変換した期待損失です。未内部化コストの全額を債務とはみなしません。",
  減損テストの前提:
    "既存の減損テストで使っている前提(閾値)を自然債務が上回るかどうかの比較です。上回る場合、前提の見直しが必要になりえます。",
  "格付・資本コスト":
    "信用格付機関が一般的に参照する財務指標の変化を算術で示すものです。実際の格付・資本コストへの影響は予測・断定しません。",
};

export function financialTermNote(term: string): string | undefined {
  return FINANCIAL_TERM_NOTE[term];
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
