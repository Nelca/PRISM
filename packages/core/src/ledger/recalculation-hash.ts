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

// FNV-1a(64bit)。監査用の指紋として使うため、32bitの単純ローリングハッシュ(誕生日限界で
// 2^16程度の入力組合せから衝突が現実的になる)では不十分と判断し、衝突確率を大幅に下げる
// 64bit幅のハッシュに変更した(BigIntを使用。target=ES2017のためBigIntリテラル構文(123n)ではなく
// BigInt()コンストラクタ呼び出しの形で書く)。
const FNV_OFFSET_BASIS = BigInt("14695981039346656037");
const FNV_PRIME = BigInt("1099511628211");
const MASK_64 = (BigInt(1) << BigInt(64)) - BigInt(1);

function hashString(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16);
}

export function computeRecalculationHash(inputs: RecalculationHashInputs): RecalculationHash {
  return { hash: `m8:${hashString(stableStringify(inputs))}`, inputs };
}

/**
 * 個別レコード(ValuationRecord / DivergenceDecomposition / DecisionRecord)の再計算ハッシュ。
 * build-plan §4.2「すべてのレコードに再計算ハッシュのフィールドを持たせる」に対応する。
 *
 * パイプライン全体のハッシュ(computeRecalculationHash)と同じ関数で計算するが、
 * 入力は「そのレコードの計算に実際に入ったもの」だけに絞る。1レコードから
 * 「どの係数版・どの較正パラメータ・どのAoP対応表版で計算されたか」を辿れるようにするため。
 *
 * **モンテカルロの乱数シードは含めない。**シードは分位点にのみ影響し、中心値と
 * パラメータ版には影響しない。M8 D-2がハッシュを「パラメータ版を横断的に含むもの」と
 * 定義しているため、同じ版で計算した2つのrunのハッシュが seed 違いでズレると
 * 「何か変わったのか」の比較ができなくなる。シードは pipeline_run 側に別途保存する。
 */
export function computeRecordHash(kind: string, inputs: unknown): string {
  return `${kind}:${hashString(stableStringify(inputs))}`;
}
