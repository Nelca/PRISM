import { describe, expect, it } from "vitest";
import {
  computeRecipeHash,
  createProductionRegistry,
  createTestRegistry,
  PRODUCTION_RECIPES,
  RecipeRegistrationError,
  RecipeRegistry,
  RECIPE_REGISTRY_VERSION,
} from "./registry";
import { makeSyntheticTrace, SYNTHETIC_MAX_PARTIAL, SYNTHETIC_PRODUCT_FULL, SYNTHETIC_RECIPES } from "./synthetic-interaction";

const traceA = makeSyntheticTrace({ methodId: "synthetic-product-a", shape: "product", quantity: 1, alpha: 3, beta: 2, gamma: 1 });
const traceB = makeSyntheticTrace({ methodId: "synthetic-product-b", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });

describe("RecipeRegistry(T-06)", () => {
  it("登録時にハッシュを埋め、版が上がればハッシュが変わる", () => {
    const registry = createTestRegistry();
    const registered = registry.register(SYNTHETIC_PRODUCT_FULL);
    expect(registered.hash).toBe(computeRecipeHash(SYNTHETIC_PRODUCT_FULL));
    expect(registered.hash.startsWith("recipe:")).toBe(true);

    const bumped = computeRecipeHash({ ...SYNTHETIC_PRODUCT_FULL, version: "1.1.0" });
    expect(bumped).not.toBe(registered.hash);

    const fewerFactors = computeRecipeHash({ ...SYNTHETIC_PRODUCT_FULL, factors: [SYNTHETIC_PRODUCT_FULL.factors[0]] });
    expect(fewerFactors).not.toBe(registered.hash);

    const asPartial = computeRecipeHash({ ...SYNTHETIC_PRODUCT_FULL, decompositionKind: "partial" });
    expect(asPartial).not.toBe(registered.hash);
  });

  it("同じ id@version を二重登録できない", () => {
    const registry = createTestRegistry();
    registry.register(SYNTHETIC_PRODUCT_FULL);
    expect(() => registry.register(SYNTHETIC_PRODUCT_FULL)).toThrow(RecipeRegistrationError);
    expect(() => registry.register({ ...SYNTHETIC_PRODUCT_FULL, version: "1.1.0" })).not.toThrow();
  });

  it("本番レジストリには実データレシピだけが入り、テスト専用レシピを登録できない", () => {
    const production = createProductionRegistry();
    expect(production.allowTestOnly).toBe(false);
    expect(production.list().map((recipe) => recipe.id)).toEqual(PRODUCTION_RECIPES.map((recipe) => recipe.id));
    expect(production.list().every((recipe) => recipe.testOnly === undefined)).toBe(true);
    expect(production.list().every((recipe) => recipe.hash.startsWith("recipe:"))).toBe(true);
    expect(() => production.register(SYNTHETIC_PRODUCT_FULL)).toThrow(RecipeRegistrationError);
    for (const recipe of SYNTHETIC_RECIPES) {
      expect(recipe.testOnly).toBe(true);
    }
  });

  it("実データレシピのレビュー状態は実行可能(evidence_verified / domain_approved)である", () => {
    for (const recipe of PRODUCTION_RECIPES) {
      expect(["evidence_verified", "domain_approved"]).toContain(recipe.review.status);
    }
  });

  it("手法ID・内訳ID・版レンジが一致するレシピを見つける", () => {
    const registry = createTestRegistry();
    registry.register(SYNTHETIC_PRODUCT_FULL);
    const match = registry.find(traceA, traceB);
    expect(match?.recipe.id).toBe("synthetic-product-full");
    expect(match?.swappedOrientation).toBe(false);
  });

  it("A/Bを入れ替えた向きでも見つけ、swappedOrientation を立てる", () => {
    const registry = createTestRegistry();
    registry.register(SYNTHETIC_PRODUCT_FULL);
    const match = registry.find(traceB, traceA);
    expect(match?.recipe.id).toBe("synthetic-product-full");
    expect(match?.swappedOrientation).toBe(true);
  });

  it("版レンジ外・未登録の手法ペアは null を返す(自動推定で比較しない)", () => {
    const registry = createTestRegistry();
    registry.register(SYNTHETIC_PRODUCT_FULL);
    const newerA = makeSyntheticTrace({
      methodId: "synthetic-product-a",
      methodVersion: "2.0.0",
      shape: "product",
      quantity: 1,
      alpha: 3,
      beta: 2,
      gamma: 1,
    });
    expect(registry.find(newerA, traceB)).toBeNull();

    const unknown = makeSyntheticTrace({ methodId: "unknown-method", shape: "product", quantity: 1, alpha: 1, beta: 1, gamma: 1 });
    expect(registry.find(unknown, traceB)).toBeNull();
  });

  it("allowTestOnly が false のレジストリでは testOnly レシピを検索対象にしない", () => {
    const registry = new RecipeRegistry({ allowTestOnly: true });
    registry.register(SYNTHETIC_PRODUCT_FULL);
    expect(registry.find(traceA, traceB)).not.toBeNull();

    // 同じレシピ集合でも本番相当のレジストリには入らない
    const production = createProductionRegistry();
    expect(production.find(traceA, traceB)).toBeNull();
  });

  it("レジストリ版を定数として公開する(再計算ハッシュに入れる)", () => {
    expect(RECIPE_REGISTRY_VERSION).toBe("recipe-registry-v3");
    expect(createTestRegistry().version).toBe(RECIPE_REGISTRY_VERSION);
  });

  it("合成レシピ一式を登録できる(id の重複が無い)", () => {
    const registry = createTestRegistry();
    for (const recipe of SYNTHETIC_RECIPES) registry.register(recipe);
    expect(registry.list()).toHaveLength(SYNTHETIC_RECIPES.length);
    expect(registry.list().some((recipe) => recipe.id === SYNTHETIC_MAX_PARTIAL.id)).toBe(true);
  });

  it("同じ手法ペアに複数レシピが該当する場合、supports を通るレシピを優先する(T-11)", () => {
    const registry = createTestRegistry();
    const rejecting = {
      ...SYNTHETIC_PRODUCT_FULL,
      id: "synthetic-product-full-rejecting",
      supports: () => ({ ok: false, reason: "trace_insufficient" as const, detail: "前提を満たしません" }),
    };
    // 先に「前提を満たさない」レシピを登録しても、後から登録した supports を通るレシピが選ばれる。
    registry.register(rejecting);
    registry.register(SYNTHETIC_PRODUCT_FULL);
    expect(registry.find(traceA, traceB)?.recipe.id).toBe("synthetic-product-full");
  });

  it("どのレシピも supports を通らない場合は最初の一致を返し、停止理由を利用者へ返せるようにする", () => {
    const registry = createTestRegistry();
    const rejecting = {
      ...SYNTHETIC_PRODUCT_FULL,
      id: "synthetic-product-full-rejecting",
      supports: () => ({ ok: false, reason: "trace_insufficient" as const, detail: "前提を満たしません" }),
    };
    registry.register(rejecting);
    registry.register({ ...rejecting, id: "synthetic-product-full-rejecting-2" });
    expect(registry.find(traceA, traceB)?.recipe.id).toBe("synthetic-product-full-rejecting");
  });

  it("supports が例外を投げるレシピは前提を満たさないものとして扱う", () => {
    const registry = createTestRegistry();
    const throwing = {
      ...SYNTHETIC_PRODUCT_FULL,
      id: "synthetic-product-full-throwing",
      supports: () => {
        throw new Error("boom");
      },
    };
    registry.register(throwing);
    registry.register(SYNTHETIC_PRODUCT_FULL);
    expect(() => registry.find(traceA, traceB)).not.toThrow();
    expect(registry.find(traceA, traceB)?.recipe.id).toBe("synthetic-product-full");
  });
});
