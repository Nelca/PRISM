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

function optionalNumber(raw: FormDataEntryValue | null, label: string, min?: number) {
  return String(raw ?? "").trim() === "" ? { value: null } : parseRequiredNumber(raw, { label, min });
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

  const unit = String(formData.get("unit") ?? "").trim() || (category === "climate" ? "tCO2e" : "m3");
  if (unit !== (category === "climate" ? "tCO2e" : "m3")) return { error: "単位は水がm3、GHGがtCO2eです。換算して入力してください。" };

  const fields = {
    physicalQuantity: parseRequiredNumber(formData.get("physicalQuantity"), { label: "年間の環境データ量", min: 0 }),
    unitReplacementCost: parseRequiredNumber(formData.get("unitReplacementCost"), { label: "コスト単価", min: 0 }),
    investmentCostInitial: optionalNumber(formData.get("investmentCostInitial"), "初期投資額", 0),
    investmentCostRecurring: optionalNumber(formData.get("investmentCostRecurring"), "年間の継続費用", 0),
    baselineNpvValue: optionalNumber(formData.get("baselineNpvValue"), "自然コスト反映前のNPV"),
    approvalThresholdValue: String(formData.get("approvalThresholdValue") ?? "").trim() === ""
      ? { value: null }
      : parseRequiredNumber(formData.get("approvalThresholdValue"), { label: "投資の承認ライン" }),
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
    unit,
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
