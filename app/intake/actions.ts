"use server";

import { revalidatePath } from "next/cache";
import { getDefaultTenantId } from "@/lib/db/client";
import { replaceSiteEntries } from "@/lib/db/repositories/sites";
import { appendInteractionEvent } from "@/lib/db/repositories/interactions";
import { executeAndPersistRun } from "@/lib/pipeline/execute-run";
import { loadCompanyDataset } from "@/lib/intake/load-company-dataset";
import { toSiteEntries } from "@/lib/intake/to-site-entries";

const REVALIDATE_PATHS = [
  "/",
  "/intake",
  "/sites",
  "/assessment",
  "/valuation",
  "/decomposition",
  "/financial-bridge",
  "/decision",
  "/disclosure",
  "/ledger",
];

const ACTOR = "宮里";

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
  const tenantId = getDefaultTenantId();

  await replaceSiteEntries(tenantId, entries);
  await appendInteractionEvent(tenantId, {
    actor: ACTOR,
    kind: "depth_override",
    subjectId: `${dataset.engagementConfig.deepDive.siteId}-mi-${dataset.engagementConfig.deepDive.category}`,
    payload: {
      mode: "promote",
      logMessage: `実データを取り込み(拠点${entries.length}件)。深掘り対象を${dataset.engagementConfig.deepDive.siteId}に指定`,
    },
  });
  await executeAndPersistRun(tenantId);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return { importedSiteCount: entries.length, unmapped: unmappedFields };
}
