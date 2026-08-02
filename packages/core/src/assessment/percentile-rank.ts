/**
 * M2 D-2:同一バッチ内での百分位順位への正規化(汎用)。
 * 参照元: docs/requirements/m2-assessment-execution.md §2
 *
 * 標準的な統計的定義(1始まりの順位÷N、タイは平均順位)を実装する。
 * 要件定義書§2.2の数値例のうち、タイのない列(感応度・財務エクスポージャ・不確実性)は
 * この定義で厳密に再現できるが、タイを含む列(開示必須性)は、要件定義書の記載値が
 * この標準的な計算と整合しない(design-rationale-log 参照)。独自の非標準的な
 * タイ処理を発明してまで要件定義書の具体的な数値に合わせることはせず、
 * 標準的な定義をそのまま採用する。
 */

export function computePercentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n === 0) {
    return [];
  }

  const sortedIndices = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array<number>(n);

  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[sortedIndices[j + 1]] === values[sortedIndices[i]]) {
      j++;
    }
    // sortedIndices[i..j] は同値(タイ)。1始まりの順位(i+1..j+1)の平均を割り当てる。
    const averageRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) {
      ranks[sortedIndices[k]] = averageRank;
    }
    i = j + 1;
  }

  return ranks.map((rank) => rank / n);
}
