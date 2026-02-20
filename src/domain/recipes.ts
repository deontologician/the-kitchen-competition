import { type ItemId, itemId as toItemId } from "./branded";
import { findItem } from "./items";

export type RecipeMethod = "prep" | "cook" | "assemble";

export interface RecipeInput {
  readonly itemId: ItemId;
  readonly quantity: number;
}

export interface RecipeStep {
  readonly id: ItemId;
  readonly name: string;
  readonly inputs: ReadonlyArray<RecipeInput>;
  readonly output: ItemId;
  readonly method: RecipeMethod;
  readonly timeMs: number;
}

export interface RecipeNode {
  readonly step: RecipeStep;
  readonly children: ReadonlyArray<RecipeNode>;
}

const inp = (id: string, quantity: number = 1): RecipeInput => ({
  itemId: toItemId(id),
  quantity,
});

const step = (
  id: string,
  name: string,
  inputs: ReadonlyArray<RecipeInput>,
  output: string,
  method: RecipeMethod,
  timeMs: number
): RecipeStep => ({ id: toItemId(id), name, inputs, output: toItemId(output), method, timeMs });

const prep = (
  id: string,
  name: string,
  inputs: ReadonlyArray<RecipeInput>,
  timeMs: number
): RecipeStep => step(id, name, inputs, id, "prep", timeMs);

const cook = (
  id: string,
  name: string,
  inputs: ReadonlyArray<RecipeInput>,
  timeMs: number
): RecipeStep => step(id, name, inputs, id, "cook", timeMs);

const assemble = (
  id: string,
  name: string,
  inputs: ReadonlyArray<RecipeInput>
): RecipeStep => step(id, name, inputs, id, "assemble", 0);

const ALL_RECIPES: ReadonlyArray<RecipeStep> = [
  // ── Burger Prepped ────────────────────────────────────────────────────
  prep("shredded-lettuce", "Shredded Lettuce", [inp("lettuce")], 2000),
  prep("sliced-tomato", "Sliced Tomato", [inp("tomato")], 2000),
  prep("sliced-onion", "Sliced Onion", [inp("onion")], 2000),
  prep("beef-patty", "Beef Patty", [inp("ground-beef")], 3000),
  cook("grilled-patty", "Grilled Patty", [inp("beef-patty")], 5000),
  prep("cut-fries", "Cut Fries", [inp("potato")], 3000),
  cook("french-fries", "French Fries", [inp("cut-fries")], 4000),
  cook("crispy-bacon", "Crispy Bacon", [inp("bacon")], 4000),
  cook("grilled-chicken", "Grilled Chicken", [inp("chicken-breast")], 5000),

  // ── BBQ Prepped ───────────────────────────────────────────────────────
  prep("coleslaw", "Coleslaw", [inp("cabbage")], 4000),
  prep("seasoned-pork", "Seasoned Pork", [inp("pork-shoulder")], 3000),
  cook("smoked-pork", "Smoked Pork", [inp("seasoned-pork")], 8000),
  prep("pulled-pork", "Pulled Pork", [inp("smoked-pork")], 3000),
  prep("seasoned-ribs", "Seasoned Ribs", [inp("ribs")], 4000),
  cook("smoked-ribs", "Smoked Ribs", [inp("seasoned-ribs")], 8000),
  prep("seasoned-brisket", "Seasoned Brisket", [inp("brisket")], 4000),
  cook("smoked-brisket", "Smoked Brisket", [inp("seasoned-brisket")], 10000),
  prep("sliced-brisket", "Sliced Brisket", [inp("smoked-brisket")], 3000),
  prep("seasoned-chicken", "Seasoned Chicken", [inp("chicken")], 3000),
  cook("smoked-chicken", "Smoked Chicken", [inp("seasoned-chicken")], 6000),
  cook("grilled-corn", "Grilled Corn", [inp("corn")], 4000),
  cook("smoked-patty", "Smoked Patty", [inp("beef-patty")], 6000),
  cook("onion-rings", "Onion Rings", [inp("sliced-onion")], 5000),

  // ── Sushi Prepped ─────────────────────────────────────────────────────
  cook(
    "sushi-rice",
    "Sushi Rice",
    [inp("rice"), inp("rice-vinegar")],
    5000
  ),
  prep("rice-ball", "Rice Ball", [inp("sushi-rice")], 2000),
  prep("sliced-salmon", "Sliced Salmon", [inp("salmon")], 3000),
  prep("sliced-tuna", "Sliced Tuna", [inp("tuna")], 3000),
  prep("sliced-cucumber", "Sliced Cucumber", [inp("cucumber")], 2000),
  prep("sliced-avocado", "Sliced Avocado", [inp("avocado")], 2000),
  prep("cubed-tofu", "Cubed Tofu", [inp("tofu")], 2000),
  cook("tempura-shrimp", "Tempura Shrimp", [inp("shrimp")], 4000),

  // ── Burger Dishes ─────────────────────────────────────────────────────
  assemble("classic-burger", "Classic Burger", [
    inp("bun"),
    inp("grilled-patty"),
    inp("shredded-lettuce"),
    inp("sliced-tomato"),
  ]),
  assemble("cheeseburger", "Cheeseburger", [
    inp("bun"),
    inp("grilled-patty"),
    inp("cheese"),
    inp("shredded-lettuce"),
  ]),
  assemble("bacon-cheeseburger", "Bacon Cheeseburger", [
    inp("bun"),
    inp("grilled-patty"),
    inp("crispy-bacon"),
    inp("cheese"),
    inp("shredded-lettuce"),
  ]),
  assemble("chicken-sandwich", "Chicken Sandwich", [
    inp("bun"),
    inp("grilled-chicken"),
    inp("shredded-lettuce"),
    inp("sliced-tomato"),
  ]),
  assemble("loaded-fries", "Loaded Fries", [
    inp("french-fries"),
    inp("cheese"),
    inp("crispy-bacon"),
    inp("sliced-onion"),
  ]),

  // ── BBQ Dishes ────────────────────────────────────────────────────────
  assemble("pulled-pork-sandwich", "Pulled Pork Sandwich", [
    inp("bun"),
    inp("pulled-pork"),
    inp("coleslaw"),
  ]),
  assemble("smoked-ribs-plate", "Smoked Ribs Plate", [
    inp("smoked-ribs"),
    inp("bbq-sauce"),
    inp("pickle"),
  ]),
  assemble("brisket-sandwich", "Brisket Sandwich", [
    inp("bun"),
    inp("sliced-brisket"),
    inp("pickle"),
  ]),
  assemble("bbq-burger", "BBQ Burger", [
    inp("bun"),
    inp("smoked-patty"),
    inp("onion-rings"),
    inp("bbq-sauce"),
  ]),
  assemble("smoked-chicken-plate", "Smoked Chicken Plate", [
    inp("smoked-chicken"),
    inp("grilled-corn"),
    inp("bbq-sauce"),
  ]),

  // ── Sushi Dishes ──────────────────────────────────────────────────────
  assemble("salmon-nigiri", "Salmon Nigiri", [
    inp("rice-ball"),
    inp("sliced-salmon"),
  ]),
  assemble("tuna-roll", "Tuna Roll", [
    inp("sushi-rice"),
    inp("nori"),
    inp("sliced-tuna"),
    inp("sliced-cucumber"),
  ]),
  assemble("california-roll", "California Roll", [
    inp("sushi-rice"),
    inp("nori"),
    inp("crab"),
    inp("sliced-avocado"),
    inp("sliced-cucumber"),
  ]),
  assemble("tempura-shrimp-roll", "Tempura Shrimp Roll", [
    inp("sushi-rice"),
    inp("nori"),
    inp("tempura-shrimp"),
    inp("sliced-avocado"),
  ]),
  cook("miso-soup", "Miso Soup", [inp("miso-paste"), inp("cubed-tofu")], 5000),
];

const RECIPE_MAP: ReadonlyMap<ItemId, RecipeStep> = new Map(
  ALL_RECIPES.map((r) => [r.id, r])
);

const OUTPUT_MAP: ReadonlyMap<ItemId, ReadonlyArray<RecipeStep>> = (() => {
  const map = new Map<ItemId, RecipeStep[]>();
  ALL_RECIPES.forEach((r) => {
    const existing = map.get(r.output) ?? [];
    map.set(r.output, [...existing, r]);
  });
  return map;
})();

export const findRecipe = (id: ItemId): RecipeStep | undefined =>
  RECIPE_MAP.get(id);

export const recipesForOutput = (
  id: ItemId
): ReadonlyArray<RecipeStep> => OUTPUT_MAP.get(id) ?? [];

export const allRecipes = (): ReadonlyArray<RecipeStep> => ALL_RECIPES;

export const resolveRecipeChain = (
  targetItemId: ItemId
): RecipeNode | undefined => {
  const recipes = recipesForOutput(targetItemId);
  if (recipes.length === 0) return undefined;
  const recipeStep = recipes[0];
  const children = recipeStep.inputs
    .map((input) => resolveRecipeChain(input.itemId))
    .filter((node): node is RecipeNode => node !== undefined);
  return { step: recipeStep, children };
};

export const foldRecipeTree = <A>(
  node: RecipeNode,
  leaf: (step: RecipeStep) => A,
  merge: (step: RecipeStep, childResults: ReadonlyArray<A>) => A,
): A => {
  const seen = new Set<ItemId>();
  const go = (n: RecipeNode): A => {
    if (seen.has(n.step.id)) return leaf(n.step);
    seen.add(n.step.id);
    return merge(n.step, n.children.map(go));
  };
  return go(node);
};

export const flattenRecipeChain = (
  node: RecipeNode
): ReadonlyArray<RecipeStep> =>
  foldRecipeTree(
    node,
    () => [],
    (step, children) => [...children.flat(), step],
  );

export const totalRawIngredients = (
  node: RecipeNode
): ReadonlyArray<RecipeInput> => {
  const accum = foldRecipeTree<ReadonlyArray<RecipeInput>>(
    node,
    () => [],
    (step, children) => {
      const rawInputs = step.inputs.filter(
        (i) => findItem(i.itemId)?.category === "raw"
      );
      return [...children.flat(), ...rawInputs];
    },
  );
  const map = new Map<ItemId, number>();
  accum.forEach((i) => map.set(i.itemId, (map.get(i.itemId) ?? 0) + i.quantity));
  return [...map.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
};

export const totalRecipeTime = (node: RecipeNode): number =>
  foldRecipeTree(
    node,
    () => 0,
    (step, children) => step.timeMs + children.reduce((a, b) => a + b, 0),
  );
