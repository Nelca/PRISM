import "server-only";
import { readFile } from "node:fs/promises";

/** ESVD December 2020 の正規化済みレコード(lib/research/prepare_sources.py で原本から抽出)。 */
export interface EsvdRecord {
  id: string;
  /** 原本の行番号。ValueIDに重複があるため、行番号と組み合わせて区別する。 */
  row: number;
  country: string;
  biome: string;
  service: string;
  cices: string;
  method: string;
  /** Int$2020/ha/年。原本に標準化値がない場合は null(0とみなさない)。 */
  value: number | null;
  reference: string;
  reviewed: boolean;
}

let dataset: Promise<EsvdRecord[]> | undefined;

export function loadEsvd(): Promise<EsvdRecord[]> {
  return (dataset ??= readFile(`${process.cwd()}/docs/data/research/esvd-2020.json`, "utf8").then((text) => JSON.parse(text) as EsvdRecord[]));
}

/** 試算画面で選べる原研究: 標準化値があり、日本または送粉に関するもの。 */
export function esvdExamples(records: EsvdRecord[]): EsvdRecord[] {
  return records.filter((record) => record.value !== null && (record.country === "Japan" || /pollination/i.test(record.service)));
}
