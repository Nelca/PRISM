/**
 * 記入テンプレートのダウンロード(指示02)。
 *
 * 取込画面のガイド文がリポジトリ内のパス(`docs/data-intake-guide.md`・`lib/intake/templates/`)を
 * 案内していたが、非エンジニアには辿れない。返すのは取込パーサが実際に受け付ける
 * テンプレートそのもの(`lib/intake/templates.test.ts` が、この記入例でM1〜M7を
 * 通しで実行できることを検証している)。
 *
 * 認証は付けない。返すのは空のひな形であり、テナントのデータを一切含まないため。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

/** 許可した名前だけをファイル名に解決する(リクエスト文字列をパスに連結しない)。 */
const TEMPLATES = {
  sites: { file: "sites.csv", contentType: "text/csv; charset=utf-8" },
  "nature-interfaces": { file: "nature-interfaces.csv", contentType: "text/csv; charset=utf-8" },
  "engagement-config": { file: "engagement-config.json", contentType: "application/json; charset=utf-8" },
} as const;

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const template = TEMPLATES[name as keyof typeof TEMPLATES];

  if (!template) {
    return Response.json({ error: "テンプレート名が正しくありません。" }, { status: 404 });
  }

  const text = await readFile(path.join(process.cwd(), "lib", "intake", "templates", template.file), "utf-8");

  return new Response(text, {
    headers: {
      "content-type": template.contentType,
      "content-disposition": `attachment; filename="${template.file}"`,
      "cache-control": "no-store",
    },
  });
}
