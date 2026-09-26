import "server-only";
import { readFile } from "node:fs/promises";
import type { GvfdDataset } from "./gvfd";
// A version-pinned local dataset. Only the selected topic and geography go to the browser.
let dataset: Promise<GvfdDataset> | undefined;
export function loadGvfd(): Promise<GvfdDataset> {
  return dataset ??= readFile(`${process.cwd()}/docs/data/research/gvfd-v2.json`, "utf8").then((text) => JSON.parse(text) as GvfdDataset);
}
