export interface CsvRow {
  fields: string[];
  lineNumber: number;
}

export interface CsvParseResult {
  rows: CsvRow[];
  errors: string[];
}

/** RFC 4180の引用符・引用符内改行を扱い、壊れた引用符を黙って補正しない。 */
export function parseCsvStrict(text: string, fileLabel: string): CsvParseResult {
  const rows: CsvRow[] = [];
  const errors: string[] = [];
  let fields: string[] = [];
  let field = "";
  let lineNumber = 1;
  let rowStartLine = 1;
  let inQuotes = false;
  let quoteClosed = false;

  const pushRow = () => {
    fields.push(field);
    if (fields.some((value) => value.length > 0)) {
      rows.push({ fields, lineNumber: rowStartLine });
    }
    fields = [];
    field = "";
    rowStartLine = lineNumber + 1;
    quoteClosed = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += char;
        if (char === "\n") lineNumber += 1;
      }
      continue;
    }

    if (quoteClosed && char !== "," && char !== "\r" && char !== "\n") {
      errors.push(`${fileLabel} ${lineNumber}行目: 閉じ引用符の後に不正な文字があります。`);
      quoteClosed = false;
    }

    if (char === '"') {
      if (field.length > 0) {
        errors.push(`${fileLabel} ${lineNumber}行目: フィールド途中の引用符は使用できません。`);
        field += char;
      } else {
        inQuotes = true;
      }
    } else if (char === ",") {
      fields.push(field);
      field = "";
      quoteClosed = false;
    } else if (char === "\n") {
      pushRow();
      lineNumber += 1;
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (inQuotes) {
    errors.push(`${fileLabel} ${rowStartLine}行目: 引用符が閉じられていません。`);
  }
  if (field.length > 0 || fields.length > 0) pushRow();

  return { rows, errors };
}
