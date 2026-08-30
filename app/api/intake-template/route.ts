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
  sites: { path: ["templates", "sites.csv"], file: "sites.csv", contentType: "text/csv; charset=utf-8" },
  "nature-interfaces": {
    path: ["templates", "nature-interfaces.csv"],
    file: "nature-interfaces.csv",
    contentType: "text/csv; charset=utf-8",
  },
  "engagement-config": {
    path: ["templates", "engagement-config.json"],
    file: "engagement-config.json",
    contentType: "application/json; charset=utf-8",
  },
  waste: {
    path: ["category-inputs", "templates", "waste.csv"],
    file: "waste.csv",
    contentType: "text/csv; charset=utf-8",
  },
  "land-use": {
    path: ["category-inputs", "templates", "land-use.csv"],
    file: "land-use.csv",
    contentType: "text/csv; charset=utf-8",
  },
  "prtr-honshi-sample": {
    path: ["prtr", "samples", "honshi.txt"],
    file: "honshi.txt",
    contentType: "text/plain; charset=shift_jis",
  },
  "prtr-besshi-sample": {
    path: ["prtr", "samples", "besshi.txt"],
    file: "besshi.txt",
    contentType: "text/plain; charset=shift_jis",
  },
  "prtr-other-industries-sample": {
    path: ["prtr", "samples", "other-industries.txt"],
    file: "other-industries.txt",
    contentType: "text/plain; charset=shift_jis",
  },
  "prtr-crosswalk-sample": {
    path: ["prtr", "samples", "facility-crosswalk.csv"],
    file: "facility-crosswalk.csv",
    contentType: "text/csv; charset=utf-8",
  },
} as const;

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const template = TEMPLATES[name as keyof typeof TEMPLATES];

  if (!template) {
    return Response.json({ error: "テンプレート名が正しくありません。" }, { status: 404 });
  }

  // PRTR公式形式はCP932。文字列へ変換すると壊れるため、UTF-8テンプレートも含めて
  // 原本バイトをそのまま返す。
  const bytes = await readFile(path.join(process.cwd(), "lib", "intake", ...template.path));

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": template.contentType,
      "content-disposition": `attachment; filename="${template.file}"`,
      "cache-control": "no-store",
    },
  });
}
