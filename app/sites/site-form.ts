import type { UserSiteDeepDiveParams } from "@/lib/demo/site-entry";
import { parseRequiredNumber } from "@/lib/forms/number";
import type { SiteRow } from "@core/site/ingest";
import type { SiteType } from "@core/types/site";
import { industrySectorLabel, siteTypeLabel } from "../components/labels";

export interface ParsedSiteForm {
  row: Omit<SiteRow, "id">;
  deepDive: UserSiteDeepDiveParams;
}

const VALID_SITE_TYPES: SiteType[] = ["own_site", "supplier_site"];
const VALID_DIRECT_CATEGORIES = ["water", "climate"] as const;

function numberOrFallback(formData: FormData, name: string, label: string, fallback: number, min?: number) {
  const raw = formData.get(name);
  if (raw === null || String(raw).trim() === "") return { value: fallback };
  return parseRequiredNumber(raw, { label, min });
}

export function parseSiteForm(
  formData: FormData,
  fallback: UserSiteDeepDiveParams
): ParsedSiteForm | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const siteType = String(formData.get("siteType") ?? "");
  const industrySector = String(formData.get("industrySector") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const category = String(formData.get("category") ?? fallback.category ?? "water");
  if (!name) return { error: "拠点名を入力してください。" };
  if (!VALID_SITE_TYPES.includes(siteType as SiteType)) return { error: "種別を選択してください。" };
  if (!industrySector) return { error: "業種を入力してください。" };
  if (!VALID_DIRECT_CATEGORIES.includes(category as (typeof VALID_DIRECT_CATEGORIES)[number])) {
    return { error: "評価する環境データを選択してください。" };
  }

  const fields = {
    physicalQuantity: numberOrFallback(formData, "physicalQuantity", "物理量", fallback.physicalQuantity, 0),
    unitReplacementCost: numberOrFallback(formData, "unitReplacementCost", "単位代替原価", fallback.unitReplacementCost, 0),
    investmentCostInitial: numberOrFallback(formData, "investmentCostInitial", "初期投資額", fallback.investmentCostInitial, 0),
    investmentCostRecurring: numberOrFallback(formData, "investmentCostRecurring", "継続投資額", fallback.investmentCostRecurring, 0),
    baselineNpvValue: numberOrFallback(formData, "baselineNpvValue", "通常NPV", fallback.baselineNpvValue),
    approvalThresholdValue: numberOrFallback(formData, "approvalThresholdValue", "承認閾値", fallback.approvalThresholdValue),
  };
  if ("error" in fields.physicalQuantity) return fields.physicalQuantity;
  if ("error" in fields.unitReplacementCost) return fields.unitReplacementCost;
  if ("error" in fields.investmentCostInitial) return fields.investmentCostInitial;
  if ("error" in fields.investmentCostRecurring) return fields.investmentCostRecurring;
  if ("error" in fields.baselineNpvValue) return fields.baselineNpvValue;
  if ("error" in fields.approvalThresholdValue) return fields.approvalThresholdValue;

  const deepDive: UserSiteDeepDiveParams = {
    category: category as UserSiteDeepDiveParams["category"],
    physicalQuantity: fields.physicalQuantity.value,
    unit:
      String(formData.get("unit") ?? "").trim() ||
      (category === (fallback.category ?? "water") ? fallback.unit : category === "climate" ? "tCO2e" : "m3"),
    unitReplacementCost: fields.unitReplacementCost.value,
    investmentCostInitial: fields.investmentCostInitial.value,
    investmentCostRecurring: fields.investmentCostRecurring.value,
    baselineNpvValue: fields.baselineNpvValue.value,
    approvalThresholdValue: fields.approvalThresholdValue.value,
    forcePromote: formData.get("forcePromote") === "on",
    disclosureClaimText: String(formData.get("disclosureClaimText") ?? "").trim() || undefined,
  };

  if (formData.get("locationKind") === "coordinates") {
    const lat = parseRequiredNumber(formData.get("lat"), { label: "緯度", min: -90, max: 90 });
    if ("error" in lat) return lat;
    const lng = parseRequiredNumber(formData.get("lng"), { label: "経度", min: -180, max: 180 });
    if ("error" in lng) return lng;
    return { row: { name, siteType, industrySector, lat: lat.value, lng: lng.value }, deepDive };
  }
  if (!address) return { error: "住所を入力してください。" };
  return { row: { name, siteType, industrySector, address }, deepDive };
}

function locationText(row: Omit<SiteRow, "id">): string {
  return row.lat !== undefined && row.lng !== undefined ? `緯度${row.lat}・経度${row.lng}` : (row.address ?? "未設定");
}

export function describeSiteChanges(before: ParsedSiteForm, after: ParsedSiteForm): string[] {
  const changes: string[] = [];
  if (before.row.name !== after.row.name) changes.push(`拠点名「${before.row.name}」→「${after.row.name}」`);
  if (before.row.siteType !== after.row.siteType)
    changes.push(`種別「${siteTypeLabel(before.row.siteType)}」→「${siteTypeLabel(after.row.siteType)}」`);
  if (before.row.industrySector !== after.row.industrySector)
    changes.push(`業種「${industrySectorLabel(before.row.industrySector)}」→「${industrySectorLabel(after.row.industrySector)}」`);
  if (locationText(before.row) !== locationText(after.row))
    changes.push(`所在地「${locationText(before.row)}」→「${locationText(after.row)}」`);
  if (JSON.stringify(before.deepDive) !== JSON.stringify(after.deepDive))
    changes.push("詳細設定(詳細評価・意思決定・開示の前提)");
  return changes;
}
