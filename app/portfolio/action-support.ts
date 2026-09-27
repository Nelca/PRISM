import { listSiteEntries } from "@/lib/db/repositories/sites";
import { allSiteRows } from "@/lib/demo/company";
import type { SiteRow } from "@core/site/ingest";

/**
 * 統合管理の Server Action が共有する定数・検証。"use server" のファイルは関数しか公開できないため分ける。
 * DBテストがServer Actionを直接呼ぶため、ここでは "server-only" を読み込まない。
 */
export const ACTOR = "宮里";

const MIN_REASON_LENGTH = 8;
const MAX_REASON_LENGTH = 2000;

/** 監査証跡に残す理由。第三者が理解できる長さを求める。 */
export function parseReason(form: FormData, label: string): { value: string } | { error: string } {
  const value = String(form.get("reason") ?? "").trim();
  if (value.length < MIN_REASON_LENGTH || value.length > MAX_REASON_LENGTH) {
    return { error: `${label}を${MIN_REASON_LENGTH}〜${MAX_REASON_LENGTH}文字で記入してください。` };
  }
  return { value };
}

export async function listAllSiteRows(tenantId: string): Promise<SiteRow[]> {
  return allSiteRows(await listSiteEntries(tenantId));
}
