import type { RestaurantType } from "./save-slots";
import { findItem } from "./items";
import {
  findRecipe,
  resolveRecipeChain,
  flattenRecipeChain,
} from "./recipes";
import type { RecipeStep, RecipeNode } from "./recipes";

export interface MenuItem {
  readonly dishId: string;
  readonly sellPrice: number;
}

export interface MenuDef {
  readonly restaurantType: RestaurantType;
  readonly items: ReadonlyArray<MenuItem>;
}

const mi = (dishId: string, sellPrice: number): MenuItem => ({
  dishId,
  sellPrice,
});

const BURGER_MENU: MenuDef = {
  restaurantType: "burger",
  items: [
    mi("classic-burger", 8),
    mi("cheeseburger", 8),
    mi("bacon-cheeseburger", 12),
    mi("chicken-sandwich", 8),
    mi("loaded-fries", 8),
  ],
};

const BBQ_MENU: MenuDef = {
  restaurantType: "bbq",
  items: [
    mi("pulled-pork-sandwich", 9),
    mi("smoked-ribs-plate", 9),
    mi("brisket-sandwich", 9),
    mi("bbq-burger", 8),
    mi("smoked-chicken-plate", 7),
  ],
};

const SUSHI_MENU: MenuDef = {
  restaurantType: "sushi",
  items: [
    mi("salmon-nigiri", 8),
    mi("tuna-roll", 10),
    mi("california-roll", 12),
    mi("tempura-shrimp-roll", 10),
    mi("miso-soup", 5),
  ],
};

const MENUS: Readonly<Record<RestaurantType, MenuDef>> = {
  burger: BURGER_MENU,
  bbq: BBQ_MENU,
  sushi: SUSHI_MENU,
};

export const menuFor = (type: RestaurantType): MenuDef => MENUS[type];

export const dishIdsFor = (type: RestaurantType): ReadonlyArray<string> =>
  MENUS[type].items.map((mi) => mi.dishId);

const collectRawItems = (node: RecipeNode): ReadonlyArray<string> => {
  const raws = new Set<string>();

  const visit = (n: RecipeNode): void => {
    n.step.inputs.forEach((input) => {
      const item = findItem(input.itemId);
      if (item !== undefined && item.category === "raw") {
        raws.add(input.itemId);
      }
    });
    n.children.forEach(visit);
  };

  visit(node);
  return [...raws];
};

export const groceryItemsFor = (
  type: RestaurantType
): ReadonlyArray<string> => {
  const allRaws = new Set<string>();
  dishIdsFor(type).forEach((dishId) => {
    const chain = resolveRecipeChain(dishId);
    if (chain === undefined) return;
    collectRawItems(chain).forEach((id) => allRaws.add(id));
  });
  return [...allRaws];
};

const collectRecipeSteps = (node: RecipeNode): ReadonlyArray<RecipeStep> =>
  flattenRecipeChain(node);

export const availableRecipesFor = (
  type: RestaurantType
): ReadonlyArray<RecipeStep> => {
  const seen = new Set<string>();
  const result: RecipeStep[] = [];

  dishIdsFor(type).forEach((dishId) => {
    const chain = resolveRecipeChain(dishId);
    if (chain === undefined) return;
    collectRecipeSteps(chain).forEach((step) => {
      if (!seen.has(step.id)) {
        seen.add(step.id);
        result.push(step);
      }
    });
  });

  return result;
};

export const pickRandomDish = (
  type: RestaurantType,
  randomValue: number
): MenuItem => {
  const items = MENUS[type].items;
  const index = Math.min(
    Math.floor(randomValue * items.length),
    items.length - 1
  );
  return items[index];
};
