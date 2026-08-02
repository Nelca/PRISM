/**
 * M8 D-2:パイプライン全体(M1〜M7)のパラメータ版を横断的に含む再計算ハッシュ。
 * 参照元: docs/requirements/m8-ledger-versioning.md §2
 *
 * M4要件定義書§9が定義していたM4単体のハッシュ入力を、M1〜M7全体に拡張する。
 * 各モジュールが個別に実装した`placeholderRecalculationHash`(M3等)はここでの実装が
 * 揃うまでの仮実装であり、このモジュールが実物を提供する。
 */

import type { RecalculationHash, RecalculationHashInputs } from "../types/ledger";

/** オブジェクトのキーを再帰的に安定ソートしてから文字列化する(挿入順序に依存しないハッシュにするため)。 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

export function computeRecalculationHash(inputs: RecalculationHashInputs): RecalculationHash {
  return { hash: `m8:${hashString(stableStringify(inputs))}`, inputs };
}
