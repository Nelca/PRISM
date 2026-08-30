export type PrtrSourceKind = "public_prtr" | "customer_prtr" | "demo_sample";
export type PrtrReleaseMedium =
  | "air"
  | "public_water"
  | "soil"
  | "onsite_landfill"
  | "sewer"
  | "offsite_waste";
export type PrtrCalculationEligibility = "eligible" | "transfer_only";

export interface PrtrSourceFile {
  name: string;
  bytes: Uint8Array;
}

export interface PrtrSourceManifestEntry {
  role: "honshi" | "besshi" | "other_industries" | "facility_crosswalk";
  fileName: string;
  sha256: string;
  rowCount: number;
  encoding: "CP932" | "UTF-8";
}

export interface PrtrNormalizedRecord {
  id: string;
  physicalQuantityId: string;
  siteId: string;
  reportingYear: number;
  prtrListVersion: string;
  facilityId: string;
  businessEntityName: string;
  facilityName: string;
  prefecture: string;
  municipality: string;
  prtrSubstanceCode: string;
  substanceName: string;
  casRns: string[];
  releaseMedium: PrtrReleaseMedium;
  quantityKg: number | null;
  originalQuantity: number | null;
  originalUnit: "kg" | "mg-TEQ";
  measurementStatus: "reported" | "not_reported";
  calculationEligibility: PrtrCalculationEligibility;
  sourceKind: PrtrSourceKind;
  sourceRecordId: string;
  sourceRecordHash: string;
  sourceLineNumber: number;
}

export interface PrtrImportBatch {
  id: string;
  category: "pollution";
  sourceKind: PrtrSourceKind;
  schemaVersion: "env-prtr-official-2023-v1";
  dataVersion: string;
  reportingYear: number;
  sourceManifest: PrtrSourceManifestEntry[];
  records: PrtrNormalizedRecord[];
}

export interface LoadPrtrDatasetInput {
  honshi: PrtrSourceFile;
  besshi: PrtrSourceFile;
  otherIndustries: PrtrSourceFile;
  facilityCrosswalk: PrtrSourceFile;
  reportingYear: number;
  prtrListVersion: string;
  sourceKind?: PrtrSourceKind;
  /** 画面/テナントで選択できるsite ID。指定時はcrosswalkの全siteを照合する。 */
  validSiteIds?: ReadonlySet<string>;
}

export type LoadPrtrDatasetResult =
  | { batch: PrtrImportBatch; errors: [] }
  | { batch: null; errors: string[] };
