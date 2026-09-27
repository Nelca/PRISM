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

/**
 * 深掘り対象でない拠点。engagement-config.json に個別のパラメータがないため、優先度算定だけに使う。
 * 以前はデモ用の既定値(10,000m3・500円/m3・NPV1億円等)を入れていたが、後から詳細評価に
 * 進めると架空の数値で算定・判定が表示されたため、算定に使わない印を付ける(D-15)。
 */
const SCREENING_ONLY: UserSiteDeepDiveParams = {
  physicalQuantity: 0,
  unit: "m3",
  unitReplacementCost: 0,
  investmentCostInitial: null,
  investmentCostRecurring: null,
  baselineNpvValue: null,
  approvalThresholdValue: null,
  discountRate: null,
  horizon: null,
  forcePromote: false,
  screeningOnly: true,
};

export function toSiteEntries(dataset: CompanyDataset): SiteEntriesFromDataset {
  const config = dataset.engagementConfig;
  const deepDiveSiteId = config.deepDive.siteId;
  const firstCountermeasure = config.countermeasures[0];
  const firstClaim = config.disclosureClaims[0];

  const entries: UserSiteEntry[] = dataset.siteRows.map((row) => {
    if (row.id !== deepDiveSiteId) {
      return { row, deepDive: { ...SCREENING_ONLY } };
    }

    return {
      row,
      deepDive: {
        physicalQuantity: config.deepDive.physicalQuantity,
        unit: config.deepDive.unit,
        // 単価は取込時に必須(engagement-config.ts で検証済み)。推定値で補完しない。
        unitReplacementCost: config.methodConfig.unitReplacementCost!,
        // 対策は1件以上必須(同上)。無い場合も架空の投資額は入れず、投資前提待ちにする。
        investmentCostInitial: firstCountermeasure?.investmentCost.initial ?? null,
        investmentCostRecurring: firstCountermeasure?.investmentCost.recurring ?? null,
        baselineNpvValue: config.baselineNpv.value,
        // M6独自の割引率は設けない(m6-decision-record.md §4.3)。顧客の通常NPVに使った
        // 割引率・評価期間をそのまま引き継ぐ(0.06/10年で黙って埋めない)。
        discountRate: config.baselineNpv.discountRate,
        horizon: config.baselineNpv.horizon,
        approvalThresholdValue:
          config.approvalThreshold === "pending"
            ? null
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
