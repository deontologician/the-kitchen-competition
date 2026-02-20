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
    mi("classic-burger", 5),
    mi("cheeseburger", 5),
    mi("bacon-cheeseburger", 7),
    mi("chicken-sandwich", 5),
    mi("loaded-fries", 5),
  ],
};

const BBQ_MENU: MenuDef = {
  restaurantType: "bbq",
  items: [
    mi("pulled-pork-sandwich", 5),
    mi("smoked-ribs-plate", 5),
    mi("brisket-sandwich", 5),
    mi("bbq-burger", 5),
    mi("smoked-chicken-plate", 4),
  ],
};

const SUSHI_MENU: MenuDef = {
  restaurantType: "sushi",
  items: [
    mi("salmon-nigiri", 5),
    mi("tuna-roll", 6),
    mi("california-roll", 7),
    mi("tempura-shrimp-roll", 6),
    mi("miso-soup", 2),
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
