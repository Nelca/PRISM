/**
 * 実データ取込用の最小限CSVパーサ(RFC4180の基本部分に対応)。
 *
 * site/ingest.ts(M1)は「CSV文字列自体のパースはスコープ外、既に構造化された行データを
 * 受け取るところから開始する」という前提だった。実データ投入では顧客がスプレッドシートから
 * 直接エクスポートしたCSVファイルを扱う必要があるため、ここでその前段を担う。
 * 外部ライブラリは追加せず(依存追加のコストと、対象が拠点一覧程度の小さな表であることを
 * 踏まえた判断)、引用符付きフィールド(内部にカンマ・改行・エスケープされた引用符を含む)に
 * 対応した自前の最小実装とする。
 *
 * ヘッダー行の解釈・列の意味づけは行わない。生のフィールド配列(string[][])を返すのみ。
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
