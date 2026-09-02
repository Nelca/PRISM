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
import { tryRunAndPersist } from "@/lib/pipeline/try-run-with-interaction";
import { loadCompanyDataset } from "@/lib/intake/load-company-dataset";
import { toSiteEntries } from "@/lib/intake/to-site-entries";
import { DEFAULT_DEEP_DIVE_PARAMS } from "@/lib/demo/user-site-defaults";
import { describeSiteChanges, parseSiteForm } from "./site-form";

const ACTOR = "宮里";

export interface AddSiteFormState {
  error?: string;
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

  /**
   * 追加後の一覧でまず計算してみて、成功したときだけDBへ書く(第4版 D-01-2)。
   * 検証用の拠点IDは仮のもので、実際の採番は `addSiteEntry` が行う(採番結果を
   * 取り込むため、書き込み後にもう一度計算して保存する)。
   */
  const outcome = await tryRunAndPersist(tenantId, {
    label: "拠点の追加",
    userSites: (current) => [...current, { row: { ...parsed.row, id: "site-user-pending" }, deepDive: parsed.deepDive }],
    // 入力が変わったので新しいrunを1回だけ作る。ページ側は再計算しない(計画B-2)。
    commit: async (db) => {
      await addSiteEntry(tenantId, parsed.row, parsed.deepDive, db);
    },
  });
  if (!outcome.ok) {
    return { error: outcome.message };
  }

  revalidatePath("/", "layout");
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

  let updateError: string | undefined;
  const outcome = await tryRunAndPersist(tenantId, {
    label: "拠点の登録内容の変更",
    userSites: (current) =>
      current.map((entry) =>
        entry.row.id === siteId ? { row: { ...parsed.row, id: siteId }, deepDive: parsed.deepDive } : entry
      ),
    commit: async (db) => {
      try {
        await updateSiteEntry(tenantId, siteId, parsed.row, parsed.deepDive, db);
      } catch (cause) {
        updateError = errorMessage(cause);
        throw cause;
      }
    },
    events: [
      {
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
      },
    ],
  });
  if (!outcome.ok) {
    return { error: updateError ?? outcome.message };
  }

  revalidatePath("/", "layout");
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

  let removeError: string | undefined;
  const outcome = await tryRunAndPersist(tenantId, {
    label: "拠点の削除",
    userSites: (current) => current.filter((entry) => entry.row.id !== siteId),
    commit: async (db) => {
      try {
        await removeSiteEntry(tenantId, siteId, db);
      } catch (cause) {
        removeError = errorMessage(cause);
        throw cause;
      }
    },
    events: [
      {
        actor: ACTOR,
        kind: "site_removal",
        subjectId: siteId,
        payload: {
          name: existing.row.name,
          logMessage: `拠点「${existing.row.name}」を評価対象の一覧から削除(過去の計算結果・監査証跡は残ります)`,
        },
      },
    ],
  });
  if (!outcome.ok) {
    return { error: removeError ?? outcome.message };
  }

  revalidatePath("/", "layout");
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

  const outcome = await tryRunAndPersist(tenantId, {
    label: "実データの取り込み",
    userSites: () => entries,
    commit: async (db) => {
      await replaceSiteEntries(tenantId, entries, db);
    },
    events: [
      {
        actor: ACTOR,
        kind: "depth_override",
        subjectId: `${dataset.engagementConfig.deepDive.siteId}-mi-${dataset.engagementConfig.deepDive.category}`,
        payload: {
          mode: "promote",
          logMessage: `実データを取り込み(拠点${entries.length}件)。詳細評価の対象を${dataset.engagementConfig.deepDive.siteId}に指定`,
        },
      },
    ],
  });
  if (!outcome.ok) {
    return { errors: [outcome.message] };
  }

  revalidatePath("/", "layout");
  return { importedSiteCount: entries.length, unmapped: unmappedFields };
}
