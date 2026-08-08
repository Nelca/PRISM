/**
 * 出力API(build-plan §6「出力API」、構想書10.4「フェーズ3のERP埋め込みに備えて形だけ用意」)。
 *
 * 認証(GAP-16):`x-api-key` が `PRISM_API_KEY` と一致する場合のみ結果を返す。
 * **`PRISM_API_KEY` が未設定の場合は 503 を返して停止する。**
 * 未設定を「認証なしで全開放」と解釈すると、実データを入れた瞬間に全社データの漏洩経路になるため、
 * 設定漏れは開放ではなく停止に倒す(fail closed)。
 *
 * テナントをまたぐ参照は行わない。返すのは既定テナントの最新runのみ。
 */

import { getDefaultTenantId } from "@/lib/db/client";
import { getOrCreateLatestResult } from "@/lib/pipeline/execute-run";

export async function GET(request: Request) {
  const expected = process.env.PRISM_API_KEY;

  if (!expected) {
    return Response.json(
      { error: "PRISM_API_KEY が設定されていないため、このAPIは無効です(.env.example を参照)。" },
      { status: 503 }
    );
  }

  if (request.headers.get("x-api-key") !== expected) {
    return Response.json({ error: "APIキーが正しくありません。" }, { status: 401 });
  }

  const result = await getOrCreateLatestResult(getDefaultTenantId());
  return Response.json(result);
}
