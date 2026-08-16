"use server";

import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/db/client";
import {
  addSiteEntry,
  getSiteEntry,
  removeSiteEntry,
  replaceSiteEntries,
  updateSiteEntry,
} from "@/lib/db/repositories/sites";
import { appendInteractionEvent } from "@/lib/db/repositories/interactions";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";
import { loadCompanyDataset } from "@/lib/intake/load-company-dataset";
import { toSiteEntries } from "@/lib/intake/to-site-entries";
import { DEFAULT_DEEP_DIVE_PARAMS } from "@/lib/demo/user-site-defaults";
import { industrySectorLabel, siteTypeLabel } from "../components/labels";
import type { UserSiteDeepDiveParams } from "@/lib/demo/site-entry";
import type { SiteRow } from "@core/site/ingest";
import type { SiteType } from "@core/types/site";

/** 拠点の登録は全画面の入力なので、取込・手入力のどちらでも同じ範囲を無効化する。 */
const REVALIDATE_PATHS = [
  "/",
  "/sites",
  "/assessment",
  "/valuation",
  "/financial-bridge",
  "/decision",
  "/disclosure",
  "/ledger",
];

const ACTOR = "宮里";

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

interface ParsedSiteForm {
  row: Omit<SiteRow, "id">;
  deepDive: UserSiteDeepDiveParams;
}

/**
 * 拠点フォーム(追加・編集で同じ入力欄を使う)の検証と変換。
 *
 * 未入力の詳細設定を何で埋めるかは呼び出し側が決める。追加時はデモの既定値、
 * 編集時は**その拠点の現在値**を渡す。編集で既定値に戻してしまうと、
 * 「触っていない項目が黙って変わる」ことになるため(D-15の趣旨)。
 */
function parseSiteForm(formData: FormData, deepDiveFallback: UserSiteDeepDiveParams): ParsedSiteForm | { error: string } {
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

  const deepDive: UserSiteDeepDiveParams = {
    physicalQuantity: optionalNumber(formData.get("physicalQuantity"), deepDiveFallback.physicalQuantity),
    unit: String(formData.get("unit") ?? "").trim() || deepDiveFallback.unit,
    unitReplacementCost: optionalNumber(formData.get("unitReplacementCost"), deepDiveFallback.unitReplacementCost),
    investmentCostInitial: optionalNumber(formData.get("investmentCostInitial"), deepDiveFallback.investmentCostInitial),
    investmentCostRecurring: optionalNumber(
      formData.get("investmentCostRecurring"),
      deepDiveFallback.investmentCostRecurring
    ),
    baselineNpvValue: optionalNumber(formData.get("baselineNpvValue"), deepDiveFallback.baselineNpvValue),
    approvalThresholdValue: optionalNumber(
      formData.get("approvalThresholdValue"),
      deepDiveFallback.approvalThresholdValue
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
    return { row: { name, siteType, industrySector, lat: latValue, lng: lngValue }, deepDive };
  }

  if (!address) {
    return { error: "住所を入力してください。" };
  }
  return { row: { name, siteType, industrySector, address }, deepDive };
}

/** 所在地を人が読める1文にする(緯度経度も住所も、記録では同じ「所在地」として扱う)。 */
function locationText(row: Omit<SiteRow, "id">): string {
  if (row.lat !== undefined && row.lng !== undefined) {
    return `緯度${row.lat}・経度${row.lng}`;
  }
  return row.address ?? "未設定";
}

/**
 * 変更点を人が読める形にする(/ledger の変更履歴に出る文)。
 * 「編集した」だけでは監査で何も分からないため、何が何に変わったかを残す。
 */
function describeSiteChanges(
  before: ParsedSiteForm,
  after: ParsedSiteForm
): string[] {
  const changes: string[] = [];
  if (before.row.name !== after.row.name) {
    changes.push(`拠点名「${before.row.name}」→「${after.row.name}」`);
  }
  if (before.row.siteType !== after.row.siteType) {
    changes.push(`種別「${siteTypeLabel(before.row.siteType)}」→「${siteTypeLabel(after.row.siteType)}」`);
  }
  if (before.row.industrySector !== after.row.industrySector) {
    changes.push(
      `業種「${industrySectorLabel(before.row.industrySector)}」→「${industrySectorLabel(after.row.industrySector)}」`
    );
  }
  const beforeLocation = locationText(before.row);
  const afterLocation = locationText(after.row);
  if (beforeLocation !== afterLocation) {
    changes.push(`所在地「${beforeLocation}」→「${afterLocation}」`);
  }
  if (JSON.stringify(before.deepDive) !== JSON.stringify(after.deepDive)) {
    changes.push("詳細設定(詳細評価・意思決定・開示の前提)");
  }
  return changes;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "拠点を保存できませんでした。";
}

export async function addSiteAction(_prevState: AddSiteFormState, formData: FormData): Promise<AddSiteFormState> {
  const parsed = parseSiteForm(formData, DEFAULT_DEEP_DIVE_PARAMS);
  if ("error" in parsed) {
    return parsed;
  }

  const tenantId = await getTenantId();
  await addSiteEntry(tenantId, parsed.row, parsed.deepDive);

  // 入力が変わったので新しいrunを1回だけ作る。ページ側は再計算しない(計画B-2)。
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}

/**
 * 登録済み拠点の編集(指示B-03)。
 *
 * 対象は画面から登録した拠点だけ。デモ既定拠点はDBに行がなく、CSV取込の拠点は
 * 取込のやり直しが正規の修正経路であるため、リポジトリ層で弾く。
 */
export async function updateSiteAction(_prevState: AddSiteFormState, formData: FormData): Promise<AddSiteFormState> {
  const siteId = String(formData.get("siteId") ?? "").trim();
  if (!siteId) {
    return { error: "編集する拠点を指定してください。" };
  }

  const tenantId = await getTenantId();
  const existing = await getSiteEntry(tenantId, siteId);
  if (!existing) {
    return { error: "対象の拠点が見つかりません。すでに削除された可能性があります。" };
  }

  // 未入力の詳細設定は既定値ではなく現在値を引き継ぐ。
  const parsed = parseSiteForm(formData, existing.deepDive);
  if ("error" in parsed) {
    return parsed;
  }

  const changes = describeSiteChanges({ row: existing.row, deepDive: existing.deepDive }, parsed);

  try {
    await updateSiteEntry(tenantId, siteId, parsed.row, parsed.deepDive);
  } catch (cause) {
    return { error: errorMessage(cause) };
  }

  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "site_update",
    subjectId: siteId,
    payload: {
      changes,
      logMessage:
        changes.length > 0
          ? `拠点「${parsed.row.name}」の登録内容を変更(${changes.join("、")})`
          : `拠点「${parsed.row.name}」の登録内容を保存(変更なし)`,
    },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}

/**
 * 登録済み拠点の削除(指示B-03)。
 *
 * 消えるのは「これから評価する対象」としての登録だけで、過去のrun・台帳・判定件数は残る
 * (追記のみのテーブルにあり、アプリ用ロールにDELETE権限がない)。
 * 誤操作を避けるため、確認済みであることを示すフィールドが無い送信は受け付けない
 * (Server ActionはUIを経由しないPOSTでも到達しうるため、確認は画面側だけに置かない)。
 */
export async function removeSiteAction(_prevState: AddSiteFormState, formData: FormData): Promise<AddSiteFormState> {
  const siteId = String(formData.get("siteId") ?? "").trim();
  if (!siteId) {
    return { error: "削除する拠点を指定してください。" };
  }
  if (String(formData.get("confirmed") ?? "") !== "yes") {
    return { error: "削除を実行するには確認が必要です。" };
  }

  const tenantId = await getTenantId();
  const existing = await getSiteEntry(tenantId, siteId);
  if (!existing) {
    return { error: "対象の拠点が見つかりません。すでに削除された可能性があります。" };
  }

  try {
    await removeSiteEntry(tenantId, siteId);
  } catch (cause) {
    return { error: errorMessage(cause) };
  }

  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "site_removal",
    subjectId: siteId,
    payload: {
      name: existing.row.name,
      logMessage: `拠点「${existing.row.name}」を評価対象の一覧から削除(過去の計算結果・監査証跡は残ります)`,
    },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return {};
}

/* --------------------------------------------------------------------------
   CSV3ファイルの一括取込(旧 /intake。指示02で /sites に統合した)
   -------------------------------------------------------------------------- */

export interface ImportFormState {
  /** 行番号付きの検証エラー。1件でもあれば取り込まない。 */
  errors?: string[];
  /** 取り込んだが、まだパイプラインに反映していない項目。 */
  unmapped?: string[];
  importedSiteCount?: number;
}

async function readFile(formData: FormData, field: string): Promise<{ text: string; error?: string }> {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) {
    return { text: "", error: `${field} のファイルが選択されていません。` };
  }
  return { text: await file.text() };
}

/**
 * 3ファイルを検証して取り込む(GAP-02)。
 *
 * **部分取込はしない。**1件でも検証エラーがあれば何も取り込まず、全エラーを返す。
 * 一部だけ取り込むと「どこまで入ったか」が利用者にも監査にも分からなくなるため。
 * 相互参照(site_idの実在チェック)は3ファイルが揃って初めて検証できる。
 */
export async function importCompanyDatasetAction(
  _prevState: ImportFormState,
  formData: FormData
): Promise<ImportFormState> {
  const sites = await readFile(formData, "sitesCsv");
  const natureInterfaces = await readFile(formData, "natureInterfacesCsv");
  const engagementConfig = await readFile(formData, "engagementConfigJson");

  const fileErrors = [sites.error, natureInterfaces.error, engagementConfig.error].filter(
    (e): e is string => e !== undefined
  );
  if (fileErrors.length > 0) {
    return { errors: fileErrors };
  }

  const { dataset, errors } = loadCompanyDataset(sites.text, natureInterfaces.text, engagementConfig.text);
  if (!dataset) {
    return { errors };
  }

  const { entries, unmappedFields } = toSiteEntries(dataset);
  const tenantId = await getTenantId();

  await replaceSiteEntries(tenantId, entries);
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "depth_override",
    subjectId: `${dataset.engagementConfig.deepDive.siteId}-mi-${dataset.engagementConfig.deepDive.category}`,
    payload: {
      mode: "promote",
      logMessage: `実データを取り込み(拠点${entries.length}件)。詳細評価の対象を${dataset.engagementConfig.deepDive.siteId}に指定`,
    },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return { importedSiteCount: entries.length, unmapped: unmappedFields };
}
