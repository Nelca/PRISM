/**
 * M4完成 §5.4・T-06:比較レシピレジストリ。
 * 参照元: docs/roadmap/divergence-decomposition-completion-directive.md §5.4・§6.1-5・§9.5
 *
 * 汎用エンジンは手法固有の意味を知らず、**登録済みレシピだけ**を実行する。レシピが無いペアを
 * 自動推定で比較しない(§5.4)。レシピ版が変わればハッシュが変わり、再計算ハッシュへ伝播する(T-06.4)。
 *
 * レビュー状態(`evidence_verified` / `domain_approved` 以外)の判定は**実行時**に
 * `comparability.ts` が `recipe_not_registrable` として返す。登録時に例外にすると、利用者に
 * 「なぜ比較できないか」を理由コードとして見せられなくなるため。
 * テスト専用レシピ(`testOnly`)だけは、本番レジストリへ**登録自体を許さない**(§3.1)。
 */

import type { MethodComparisonRecipe } from "../../types/recipe";
import type { MethodEvaluationTrace } from "../../types/trace";
import { computeRecordHash } from "../../ledger/recalculation-hash";
import { recipeSideMatches } from "../comparability";
import { LIME3_VS_IFVI_WELFARE_WATER_RECIPE } from "./lime3-vs-ifvi-welfare-water";
import { LIME3_WATER_ENDPOINT_RECIPE } from "./lime3-water-endpoint";
import { LIME3_WATER_PERSPECTIVE_RECIPE } from "./lime3-water-perspective";
import { REPLACEMENT_COST_VS_VFACCESS_RECIPE } from "./replacement-cost-vs-vfaccess";

/**
 * レジストリ版。**登録内容と検索規則の両方を含む版**であり、再計算ハッシュへ入る。
 * v2(2026-09-06、T-11/T-13):本番レジストリへ実データ比較レシピ4件を登録し、
 * `find` が同じ手法ペアに複数レシピが該当する場合に `supports` を通るものを優先するようにした。
 */
// v3: 影響経路の対応付けがレビュー待ちのトレースを本番では分解しない(§9.5)。分解結果が変わるため版を上げた。
export const RECIPE_REGISTRY_VERSION = "recipe-registry-v3";

export class RecipeRegistrationError extends Error {}

/** レシピの同一性ハッシュ。id・version・要因ID・根拠資料・分解区分・逆方向互換から算出する。 */
export function computeRecipeHash(recipe: Omit<MethodComparisonRecipe, "hash">): string {
  return computeRecordHash("recipe", {
    id: recipe.id,
    version: recipe.version,
    factorIds: recipe.factors.map((factor) => factor.id),
    evidence: recipe.evidence.map((evidence) => evidence.hash ?? `${evidence.source}#${evidence.locator ?? ""}`),
    decompositionKind: recipe.decompositionKind,
    reverseCompatible: recipe.reverseCompatible,
  });
}

export interface RecipeMatch {
  recipe: MethodComparisonRecipe;
  /**
   * true の場合、レシピの methodA は**引数の traceB** に、methodB は traceA に対応する。
   * 呼び出し側は A/B の役割をレシピの向きへ揃えてから分解する(基準側 B を捏造しないため)。
   */
  swappedOrientation: boolean;
}

export interface RecipeRegistryOptions {
  /** テスト専用レシピの登録・実行を許すか。本番は false。 */
  allowTestOnly?: boolean;
  /** 影響経路の対応付けがレビュー待ち(pending_domain_review 等)のトレースも分解するか。本番は false。 */
  allowPendingReview?: boolean;
}

function traceTarget(trace: MethodEvaluationTrace) {
  return { methodId: trace.methodId, subFactorId: trace.subFactorId, methodVersion: trace.methodVersion };
}

export class RecipeRegistry {
  readonly version = RECIPE_REGISTRY_VERSION;
  readonly allowTestOnly: boolean;
  readonly allowPendingReview: boolean;
  private readonly recipes: MethodComparisonRecipe[] = [];

  constructor(options: RecipeRegistryOptions = {}) {
    this.allowTestOnly = options.allowTestOnly === true;
    this.allowPendingReview = options.allowPendingReview === true;
  }

  /** ハッシュを埋めて登録する。既存の同一 id@version は登録できない(版管理の一意性)。 */
  register(recipe: Omit<MethodComparisonRecipe, "hash"> & { hash?: string }): MethodComparisonRecipe {
    if (recipe.testOnly === true && !this.allowTestOnly) {
      throw new RecipeRegistrationError(
        `比較レシピ ${recipe.id}@${recipe.version} はテスト専用(testOnly)です。本番レジストリへ登録できません。`
      );
    }
    if (this.recipes.some((registered) => registered.id === recipe.id && registered.version === recipe.version)) {
      throw new RecipeRegistrationError(`比較レシピ ${recipe.id}@${recipe.version} は既に登録されています。`);
    }
    const { hash: _ignored, ...withoutHash } = recipe;
    void _ignored;
    const registered: MethodComparisonRecipe = { ...withoutHash, hash: computeRecipeHash(withoutHash) };
    this.recipes.push(registered);
    return registered;
  }

  list(): readonly MethodComparisonRecipe[] {
    return this.recipes;
  }

  /**
   * traceA/traceB に一致するレシピを探す。A/B を入れ替えた向きでも探し、その場合
   * `swappedOrientation: true` を返す。
   *
   * **同じ手法ペアに複数のレシピが該当する場合(2026-09-06 T-11 で追加)。**
   * 同一手法の内部変種(LIME3 の地理的視点レシピとエンドポイント配分レシピ)のように、
   * 手法ID・内訳ID・版が同一で、`supports(traceA, traceB)` だけが両者を区別するレシピが並ぶ。
   * 登録順で最初の一致を無条件に返すと、片方のレシピが常に他方を覆い隠してしまうため、
   * **`supports` を通るレシピを優先する**。どれも通らない場合は最初の一致をそのまま返し、
   * `comparability.ts` が `supports` の理由コード(trace_insufficient 等)を利用者へ返せるようにする
   * (「該当レシピなし」と「該当したが前提を満たさない」を潰さない、§6.1)。
   */
  find(traceA: MethodEvaluationTrace, traceB: MethodEvaluationTrace): RecipeMatch | null {
    const a = traceTarget(traceA);
    const b = traceTarget(traceB);
    const candidates: RecipeMatch[] = [];
    for (const recipe of this.recipes) {
      if (recipe.testOnly === true && !this.allowTestOnly) continue;
      if (recipeSideMatches(recipe.methodA, a) && recipeSideMatches(recipe.methodB, b)) {
        candidates.push({ recipe, swappedOrientation: false });
      }
    }
    for (const recipe of this.recipes) {
      if (recipe.testOnly === true && !this.allowTestOnly) continue;
      if (recipeSideMatches(recipe.methodA, b) && recipeSideMatches(recipe.methodB, a)) {
        candidates.push({ recipe, swappedOrientation: true });
      }
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    for (const candidate of candidates) {
      const [sideA, sideB] = candidate.swappedOrientation ? [traceB, traceA] : [traceA, traceB];
      let supported = false;
      try {
        supported = candidate.recipe.supports(sideA, sideB).ok;
      } catch {
        supported = false; // supports が例外を投げるレシピは前提を満たさないものとして扱う
      }
      if (supported) return candidate;
    }
    return candidates[0];
  }
}

/**
 * 本番レジストリで有効化する実データ比較レシピ(T-11)。登録順は `find` の探索順でもある。
 * 合成トレース用の testOnly レシピはここへ入れない(§3.1)。
 */
export const PRODUCTION_RECIPES: Omit<MethodComparisonRecipe, "hash">[] = [
  LIME3_WATER_PERSPECTIVE_RECIPE,
  LIME3_WATER_ENDPOINT_RECIPE,
  LIME3_VS_IFVI_WELFARE_WATER_RECIPE,
  REPLACEMENT_COST_VS_VFACCESS_RECIPE,
];

/**
 * 本番レジストリ。実データの比較レシピ(T-11)を登録する。ここに無い手法ペアは
 * `recipe_missing` で停止し、自動推定で比較しない(§5.4)。
 */
export function createProductionRegistry(): RecipeRegistry {
  const registry = new RecipeRegistry({ allowTestOnly: false });
  for (const recipe of PRODUCTION_RECIPES) registry.register(recipe);
  return registry;
}

/**
 * 隔離した検証用レジストリ(診断・成立性検証)。本番と同じレシピを登録し、影響経路の対応付けが
 * レビュー待ちのトレースも分解する。結果を画面・台帳の確定結果に混ぜないこと(完成指示書 §9.5)。
 */
export function createVerificationRegistry(): RecipeRegistry {
  const registry = new RecipeRegistry({ allowTestOnly: false, allowPendingReview: true });
  for (const recipe of PRODUCTION_RECIPES) registry.register(recipe);
  return registry;
}

/** テスト用レジストリ。`synthetic-interaction.ts` の testOnly レシピを登録できる。 */
export function createTestRegistry(): RecipeRegistry {
  return new RecipeRegistry({ allowTestOnly: true });
}
