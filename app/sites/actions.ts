"use server";

import { revalidatePath } from "next/cache";
import { addUserSiteRow } from "@/lib/demo/site-store";
import { DEFAULT_DEEP_DIVE_PARAMS } from "@/lib/demo/user-site-defaults";
import type { SiteType } from "@core/types/site";

export interface AddSiteFormState {
  error?: string;
}

const VALID_SITE_TYPES: SiteType[] = ["own_site", "supplier_site"];

function optionalNumber(value: FormDataEntryValue | null, fallback: number): number {
  if (value === null) return fallback;
  const str = String(value).trim();
  if (str === "") return fallback;
  const num = Number(str);
  return Number.isNaN(num) ? fallback : num;
}

export async function addSiteAction(_prevState: AddSiteFormState, formData: FormData): Promise<AddSiteFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const siteType = String(formData.get("siteType") ?? "");
  const industrySector = String(formData.get("industrySector") ?? "").trim();
  const locationKind = String(formData.get("locationKind") ?? "");
  const lat = formData.get("lat");
  const lng = formData.get("lng");
  const address = String(formData.get("address") ?? "").trim();

  if (!name) {
    return { error: "拠点名を入力してください。" };
  }
  if (!VALID_SITE_TYPES.includes(siteType as SiteType)) {
    return { error: "種別を選択してください。" };
  }
  if (!industrySector) {
    return { error: "業種を入力してください。" };
  }

  const deepDive = {
    physicalQuantity: optionalNumber(formData.get("physicalQuantity"), DEFAULT_DEEP_DIVE_PARAMS.physicalQuantity),
    unit: String(formData.get("unit") ?? "").trim() || DEFAULT_DEEP_DIVE_PARAMS.unit,
    unitReplacementCost: optionalNumber(formData.get("unitReplacementCost"), DEFAULT_DEEP_DIVE_PARAMS.unitReplacementCost),
    investmentCostInitial: optionalNumber(formData.get("investmentCostInitial"), DEFAULT_DEEP_DIVE_PARAMS.investmentCostInitial),
    investmentCostRecurring: optionalNumber(
      formData.get("investmentCostRecurring"),
      DEFAULT_DEEP_DIVE_PARAMS.investmentCostRecurring
    ),
    baselineNpvValue: optionalNumber(formData.get("baselineNpvValue"), DEFAULT_DEEP_DIVE_PARAMS.baselineNpvValue),
    approvalThresholdValue: optionalNumber(
      formData.get("approvalThresholdValue"),
      DEFAULT_DEEP_DIVE_PARAMS.approvalThresholdValue
    ),
    forcePromote: formData.get("forcePromote") === "on",
    disclosureClaimText: String(formData.get("disclosureClaimText") ?? "").trim() || undefined,
  };

  if (locationKind === "coordinates") {
    const latValue = Number(lat);
    const lngValue = Number(lng);
    if (lat === null || lng === null || Number.isNaN(latValue) || Number.isNaN(lngValue)) {
      return { error: "緯度・経度を数値で入力してください。" };
    }
    addUserSiteRow({ name, siteType, industrySector, lat: latValue, lng: lngValue }, deepDive);
  } else {
    if (!address) {
      return { error: "住所を入力してください。" };
    }
    addUserSiteRow({ name, siteType, industrySector, address }, deepDive);
  }

  revalidatePath("/");
  revalidatePath("/sites");
  revalidatePath("/assessment");
  revalidatePath("/valuation");
  revalidatePath("/decision");
  revalidatePath("/disclosure");
  revalidatePath("/ledger");
  return {};
}
