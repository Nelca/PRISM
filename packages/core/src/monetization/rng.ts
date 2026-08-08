/**
 * 決定論的な疑似乱数生成器(mulberry32)。
 *
 * モンテカルロ(uncertainty.ts)の結果を再現可能にするために使う。同じシードからは
 * 必ず同じ系列が出るため、シードを保存しておけば後から同じ run を再現できる。
 *
 * これまで uncertainty.test.ts とデモ層(lib/demo/run-demo-pipeline.ts)に同じ実装が
 * 重複していたものを、唯一の実装としてここへ集約した。
 * デモ層は `Math.random` をグローバルに差し替える回避策(design-rationale-log D-103)を
 * 使っていたが、rngを引数で渡せるようになったため不要になった。
 */

export function createSeededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
