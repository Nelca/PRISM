/**
 * パイプライン層共通:決定論的なID連番シーケンス。
 *
 * Math.random()やDate.now()に依存すると、パイプラインの実行結果がテストのたびに変わり
 * 再現できなくなる。site/locate.tsが使う連番パターン(`${site.id}-ni-${sequence++}`)を
 * 汎用化したもの。
 */

export function createIdSequence(prefix: string): () => string {
  let counter = 0;
  return () => `${prefix}-${counter++}`;
}
