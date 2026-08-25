/**
 * 取り込んだ `CompanyDataset` を、ハーネスが拠点ごとに保持する形(`UserSiteEntry`)に変換する。
 *
 * **反映できなかった項目を黙って捨てない。**`EngagementConfig` は較正パラメータ・
 * 手法別の係数・拘束方式など、現在の拠点別パラメータ(`UserSiteDeepDiveParams`)に
 * 対応する置き場がない項目を含む。取り込んだのに使われていない、という状態を
 * 利用者が知らないままにすると「入力したのに結果に出ない」という誤解を生むため、
 * 未反映の項目名を返して画面に出す(D-15と同じ「黙って埋めない/黙って落とさない」規律)。
 */

import type { CompanyDataset } from "./load-company-dataset";
import type { UserSiteDeepDiveParams, UserSiteEntry } from "@/lib/demo/site-entry";

export interface SiteEntriesFromDataset {
  entries: UserSiteEntry[];
  /** 取り込んだが、まだパイプラインに反映していない項目。 */
  unmappedFields: string[];
}

const DEFAULTS: UserSiteDeepDiveParams = {
  physicalQuantity: 10_000,
  unit: "m3",
  unitReplacementCost: 500,
  investmentCostInitial: 20_000_000,
  investmentCostRecurring: 2_000_000,
  baselineNpvValue: 100_000_000,
  approvalThresholdValue: 120_000_000,
  forcePromote: false,
};

export function toSiteEntries(dataset: CompanyDataset): SiteEntriesFromDataset {
  const config = dataset.engagementConfig;
  const deepDiveSiteId = config.deepDive.siteId;
  const firstCountermeasure = config.countermeasures[0];
  const firstClaim = config.disclosureClaims[0];

  const entries: UserSiteEntry[] = dataset.siteRows.map((row) => {
    if (row.id !== deepDiveSiteId) {
      // 深掘り対象でない拠点は、engagement-config.jsonに個別のパラメータがない。
      // 既定値を使う(この既定値はデモ用であり、顧客の実値ではない)。
      return { row, deepDive: { ...DEFAULTS } };
    }

    return {
      row,
      deepDive: {
        physicalQuantity: config.deepDive.physicalQuantity,
        unit: config.deepDive.unit,
        unitReplacementCost: config.methodConfig.unitReplacementCost ?? DEFAULTS.unitReplacementCost,
        investmentCostInitial: firstCountermeasure?.investmentCost.initial ?? DEFAULTS.investmentCostInitial,
        investmentCostRecurring: firstCountermeasure?.investmentCost.recurring ?? DEFAULTS.investmentCostRecurring,
        baselineNpvValue: config.baselineNpv.value,
        approvalThresholdValue:
          config.approvalThreshold === "pending"
            ? DEFAULTS.approvalThresholdValue
            : (config.approvalThreshold.value),
        // 深掘り対象として明示された拠点は、優先度算定の結果によらず深掘りに進める
        forcePromote: true,
        ...(firstClaim ? { disclosureClaimText: firstClaim.rawText } : {}),
      },
    };
  });

  const unmappedFields: string[] = [];
  if (config.calibration) {
    unmappedFields.push("engagement-config.json の calibration(地理較正パラメータ)");
  }
  if (config.methodConfig.externalValueFactors) {
    unmappedFields.push("engagement-config.json の methodConfig.externalValueFactors(手法別の係数)");
  }
  if (config.methodConfig.vfesFitnessDimensions) {
    unmappedFields.push("engagement-config.json の methodConfig.vfesFitnessDimensions(適合度の5次元スコア)");
  }
  if (config.bindingMechanism) {
    unmappedFields.push("engagement-config.json の bindingMechanism(拘束方式。画面から選択してください)");
  }
  if (config.approvalThreshold === "pending") {
    unmappedFields.push("engagement-config.json の approvalThreshold(未入力のため★判定は保留のままです)");
  }
  if (config.countermeasures.length > 1) {
    unmappedFields.push(`engagement-config.json の countermeasures(${config.countermeasures.length}件中1件目のみ反映)`);
  }
  if (config.disclosureClaims.length > 1) {
    unmappedFields.push(`engagement-config.json の disclosureClaims(${config.disclosureClaims.length}件中1件目のみ反映)`);
  }
  if (Object.keys(dataset.natureInterfaceLookupsBySite).length > 0) {
    unmappedFields.push(
      "nature-interfaces.csv(取り込んだレイヤ判定結果。現在のハーネスは架空企業の固定レイヤを使うため未反映)"
    );
  }

  return { entries, unmappedFields };
}
