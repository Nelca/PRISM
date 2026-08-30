/** RFC 4180に必要な引用符・改行を扱う、依存ライブラリなしのCSVパーサー。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSVの引用符が閉じていません。");
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

export function rowsAsObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!header) return [];
  if (new Set(header).size !== header.length) throw new Error("CSVヘッダーが重複しています。");
  return rows
    .filter((row) => row.some((value) => value !== ""))
    .map((row, index) => {
      if (row.length !== header.length) {
        throw new Error(`CSV ${index + 2}行目の列数がヘッダーと一致しません。`);
      }
      return Object.fromEntries(header.map((name, column) => [name, row[column]]));
    });
}
