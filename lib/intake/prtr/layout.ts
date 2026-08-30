/**
 * 環境省がR05/R06データとともに配布するTITLE定義に対応する列順。
 * 公式データ本体にはヘッダーが無いため、列数とschemaVersionで誤読を防ぐ。
 */
export const PRTR_OFFICIAL_SCHEMA_VERSION = "env-prtr-official-2023-v1" as const;

export const HONSHI_COLUMN_COUNT = 23;
export const HONSHI = {
  facilityId: 0,
  reportingYear: 1,
  businessEntityName: 4,
  facilityName: 13,
  prefecture: 16,
  municipality: 17,
} as const;

export const BESSHI_COLUMN_COUNT = 41;
export const BESSHI = {
  facilityId: 0,
  sheetNumber: 1,
  substanceName: 2,
  substanceCode: 3,
  unitCode: 4,
  air: 5,
  publicWater: 6,
  soil: 8,
  onsiteLandfill: 9,
  sewer: 13,
  offsiteWaste: 15,
} as const;

export const OTHER_INDUSTRIES_COLUMN_COUNT = 3;

export const CROSSWALK_COLUMNS = ["reporting_year", "facility_id", "site_id"] as const;
