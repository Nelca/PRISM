/**
 * PDFテキスト抽出層(M7段階1、GAP-05)。
 * unpdf(pdf.jsベース、サーバーレス実行環境でも動く純JS実装)を使う。
 *
 * 抽出失敗ページ(スキャン画像等でテキスト層が無い)は空文字で埋めず、
 * 抽出不能として明示する(M7 D-6)。
 */

import { getDocumentProxy, extractText } from "unpdf";

export interface PageExtractionResult {
  page: number;
  /** nullは抽出不能(空文字で埋めない)。 */
  text: string | null;
}

export interface PdfExtractionResult {
  totalPages: number;
  pages: PageExtractionResult[];
  /** 抽出成功ページのみを結合した本文。AI呼び出しの入力に使う。 */
  combinedText: string;
  /** 抽出できなかったページ番号(1始まり)。 */
  failedPages: number[];
}

export async function extractPdfText(data: Uint8Array): Promise<PdfExtractionResult> {
  const document = await getDocumentProxy(data);
  const { totalPages, text: pageTexts } = await extractText(document, { mergePages: false });

  const pages: PageExtractionResult[] = pageTexts.map((raw, index) => {
    const trimmed = raw.trim();
    return { page: index + 1, text: trimmed.length > 0 ? trimmed : null };
  });

  const failedPages = pages.filter((p) => p.text === null).map((p) => p.page);
  const combinedText = pages
    .filter((p): p is { page: number; text: string } => p.text !== null)
    .map((p) => `[p.${p.page}]\n${p.text}`)
    .join("\n\n");

  return { totalPages, pages, combinedText, failedPages };
}
