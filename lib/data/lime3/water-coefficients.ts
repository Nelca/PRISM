/**
 * LIME3(AIST-IDEA Ver.4.0)水消費(取水)係数の構成要素。
 *
 * 実体は `packages/core/src/monetization/data/lime3-water-coefficients.ts` へ移した(T-10a/T-11)。
 * 分解エンジンの診断・実データ比較レシピが lib(デモ・画面層)へ依存せずに参照できるようにするため。
 * 既存の import パス(`@/lib/data/lime3/water-coefficients`)を壊さないよう、ここでは再エクスポートだけを行う。
 */

export {
  LIME3_WATER_GROUND_CONSUMPTION_JAPAN,
  LIME3_WATER_GROUND_CONSUMPTION_WORLD_AVERAGE,
  LIME3_WATER_SURFACE_CONSUMPTION_JAPAN,
  LIME3_WATER_SURFACE_CONSUMPTION_WORLD_AVERAGE,
} from "@core/monetization/data/lime3-water-coefficients";
