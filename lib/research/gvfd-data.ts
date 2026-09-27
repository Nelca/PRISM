import "server-only";
import { readFile } from "node:fs/promises";
import type { GvfdDataset } from "./gvfd";
// 版を固定したローカルの抽出データ(prepare_gvfd.py で原本から生成)。ブラウザへは選択中の対象・地域の係数だけを渡す。
let dataset: Promise<GvfdDataset> | undefined;
export function loadGvfd(): Promise<GvfdDataset> {
  return dataset ??= readFile(`${process.cwd()}/docs/data/research/gvfd-v2.json`, "utf8").then((text) => JSON.parse(text) as GvfdDataset);
}
