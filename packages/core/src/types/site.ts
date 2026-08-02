/**
 * M1:対象定義とLocate。
 * 参照元: docs/requirements/m1-target-definition.md
 */

import type { ImpactCategory, LicenseMode } from "./common";

export type SiteType = "own_site" | "supplier_site";

export type SiteLocation =
  | { kind: "coordinates"; lat: number; lng: number }
  | { kind: "address"; address: string; geocoded: boolean }; // m1 §3: ジオコーディング失敗時は geocoded=false

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

export function computeSensitivityScore(criteria: CriteriaMet): number {
  return Object.values(criteria).filter(Boolean).length;
}

export interface MaterialIssue {
  id: string;
  siteId: string;
  impactCategory: ImpactCategory;
  /** 0〜5。computeSensitivityScore(criteriaMet) と必ず一致させる。 */
  sensitivityScore: number;
  criteriaMet: CriteriaMet;
  excluded: boolean;
  /** excluded === true の場合は必須(M2の除外理由記録と同じ原則)。 */
  exclusionReason?: string;
  /** M8 AssumptionEntryへの参照(2026-08-02追記、他のパイプラインレコードとの一貫性のため)。 */
  assumptionEntryIds: string[];
}
