/**
 * M1:対象定義とLocate。
 * 参照元: docs/requirements/m1-target-definition.md
 */

import type { ImpactCategory, LicenseMode } from "./common";

export type SiteType = "own_site" | "supplier_site";

export type SiteLocation =
  | { kind: "coordinates"; lat: number; lng: number }
  | {
      kind: "address";
      address: string;
      geocoded: boolean; // m1 §3: ジオコーディング失敗時は geocoded=false
      /**
       * ジオコーディング成功時の解決済み座標(2026-08-02追記、M1実装時に発見)。
       * Locate(空間突合)は座標がなければ成立しないため、geocoded=trueの場合は必須で
       * 埋まる想定(型上はoptionalのまま、location.tsが構築を担う)。
       */
      lat?: number;
      lng?: number;
    };

export interface Site {
  id: string;
  name: string;
  siteType: SiteType;
  location: SiteLocation;
  /** 業種。ENCORE等の依存・影響ドライバー参照キーになる(m1 §4 D-4)。 */
  industrySector: string;
}

export type NatureInterfaceLayerType =
  | "protected_area"
  | "kba"
  | "water_stress"
  | "ecosystem_integrity"
  | "dependency_impact";

export interface NatureInterface {
  id: string;
  siteId: string;
  layerType: NatureInterfaceLayerType;
  /** レイヤの生の結果(重み付け前)。例: 保護区重複=true/false、STARスコア=数値。 */
  rawResult: boolean | number;
  dataSource: string; // WDPA / IBAT / Aqueduct / ENCORE 等
  licenseMode: LicenseMode;
}

/** TNFD LEAP L3の5基準(m1 D-2)。感応度スコアはこの充足数(0〜5)。 */
export interface CriteriaMet {
  highEcosystemIntegrity: boolean;
  rapidIntegrityDecline: boolean;
  /** KBA・保護区・STARベース。WDPAがpending_reviewの間はfalse扱い(M8 D-4)。 */
  highBiodiversityImportance: boolean;
  waterStress: boolean;
  /** ENCORE(業種別依存・影響レーティング)を判定に使う(m1 D-4)。 */
  likelySignificantDependencyImpact: boolean;
}

export type CriterionKey = keyof CriteriaMet;

export function computeSensitivityScore(criteria: CriteriaMet): number {
  return Object.values(criteria).filter(Boolean).length;
}

/**
 * 基準を評価できなかった理由。
 *
 * - `license_pending`: 判定に必要なデータソースが `licenseMode: "pending_review"`(契約未締結)。
 *   M8 D-4により、真偽によらず感応度スコアの充足数カウントに含めない
 * - `no_data_source`: 対応するNatureInterfaceが1件も渡されていない。MVPの`rapidIntegrityDecline`
 *   (急速な劣化=トレンド)が該当する(D-91:推定で埋めず既定falseのまま)
 * - `site_not_located`: 座標・住所ともに解決できずLocate自体を実行していない(M1 D-3)
 */
export type CriterionUnavailabilityReason = "license_pending" | "no_data_source" | "site_not_located";

/**
 * 「falseだった」と「評価していない」を区別するための記録。
 * これがないと、感応度スコアの分母が常に5であるかのように読めてしまう。
 */
export interface UnevaluatedCriterion {
  criterion: CriterionKey;
  reason: CriterionUnavailabilityReason;
  /** `license_pending` の場合に保留の原因となったデータソース名。それ以外は空配列。 */
  dataSources: string[];
}

/** 評価に用いた基準の数(= 5 − 評価不能だった基準の数)。感応度スコアの分母。 */
export function evaluatedCriteriaCount(criteria: CriteriaMet, unevaluated: UnevaluatedCriterion[]): number {
  return Object.keys(criteria).length - unevaluated.length;
}

export interface MaterialIssue {
  id: string;
  siteId: string;
  impactCategory: ImpactCategory;
  /** 0〜5。computeSensitivityScore(criteriaMet) と必ず一致させる。 */
  sensitivityScore: number;
  criteriaMet: CriteriaMet;
  /**
   * 評価できなかった基準(2026-08-08追加、GAP-08/GAP-13)。
   * `sensitivityScore` の分母は 5 ではなく `evaluatedCriteriaCount()` である。
   * 空配列は「5基準すべてを評価した」ことを意味する。Optionalにしない(D-15)。
   */
  unevaluatedCriteria: UnevaluatedCriterion[];
  excluded: boolean;
  /** excluded === true の場合は必須(M2の除外理由記録と同じ原則)。 */
  exclusionReason?: string;
  /** M8 AssumptionEntryへの参照(2026-08-02追記、他のパイプラインレコードとの一貫性のため)。 */
  assumptionEntryIds: string[];
}
