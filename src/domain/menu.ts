import type { ItemId } from "./branded";
import { itemId } from "./branded";
import type { RestaurantType } from "./save-slots";
import { findItem } from "./items";
import {
  findRecipe,
  resolveRecipeChain,
  flattenRecipeChain,
} from "./recipes";
import type { RecipeStep, RecipeNode } from "./recipes";

export interface MenuItem {
  readonly dishId: ItemId;
  readonly sellPrice: number;
}

export interface MenuDef {
  readonly restaurantType: RestaurantType;
  readonly items: ReadonlyArray<MenuItem>;
}

const mi = (dishId: string, sellPrice: number): MenuItem => ({
  dishId: itemId(dishId),
  sellPrice,
});

// Array position = unlock order. items[0] = starter dish.
const BURGER_MENU: MenuDef = {
  restaurantType: "burger",
  items: [
    mi("classic-burger", 8),
    mi("cheeseburger", 8),
    mi("chicken-sandwich", 8),
    mi("loaded-fries", 8),
    mi("bacon-cheeseburger", 12),
  ],
};

const BBQ_MENU: MenuDef = {
  restaurantType: "bbq",
  items: [
    mi("smoked-ribs-plate", 9),
    mi("smoked-chicken-plate", 7),
    mi("pulled-pork-sandwich", 9),
    mi("brisket-sandwich", 9),
    mi("bbq-burger", 8),
  ],
};

const SUSHI_MENU: MenuDef = {
  restaurantType: "sushi",
  items: [
    mi("salmon-nigiri", 8),
    mi("miso-soup", 5),
    mi("tuna-roll", 10),
    mi("california-roll", 12),
    mi("tempura-shrimp-roll", 10),
  ],
};

const MENUS: Readonly<Record<RestaurantType, MenuDef>> = {
  burger: BURGER_MENU,
  bbq: BBQ_MENU,
  sushi: SUSHI_MENU,
};

export const STARTER_DISH_COUNT = 1;

export const menuFor = (type: RestaurantType): MenuDef => MENUS[type];

export const unlockedMenuFor = (
  type: RestaurantType,
  count: number
): MenuDef => {
  const menu = MENUS[type];
  const clamped = Math.max(1, Math.min(count, menu.items.length));
  return { ...menu, items: menu.items.slice(0, clamped) };
};

export const dishIdsFor = (type: RestaurantType): ReadonlyArray<ItemId> =>
  MENUS[type].items.map((mi) => mi.dishId);

export const unlockedDishIdsFor = (
  type: RestaurantType,
  count: number
): ReadonlyArray<ItemId> =>
  unlockedMenuFor(type, count).items.map((mi) => mi.dishId);

const collectRawItems = (node: RecipeNode): ReadonlyArray<ItemId> => {
  const raws = new Set<ItemId>();

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
): ReadonlyArray<ItemId> => {
  const allRaws = new Set<ItemId>();
  dishIdsFor(type).forEach((dishId) => {
    const chain = resolveRecipeChain(dishId);
    if (chain === undefined) return;
    collectRawItems(chain).forEach((id) => allRaws.add(id));
  });
  return [...allRaws];
};

export const unlockedGroceryItemsFor = (
  type: RestaurantType,
  count: number
): ReadonlyArray<ItemId> => {
  const allRaws = new Set<ItemId>();
  unlockedDishIdsFor(type, count).forEach((dishId) => {
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
  const seen = new Set<ItemId>();
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

export const unlockedRecipesFor = (
  type: RestaurantType,
  count: number
): ReadonlyArray<RecipeStep> => {
  const seen = new Set<ItemId>();
  const result: RecipeStep[] = [];

  unlockedDishIdsFor(type, count).forEach((dishId) => {
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

export const shouldUnlockNextDish = (
  customersLost: number,
  coins: number,
  currentUnlocked: number,
  maxDishes: number = 5
): number =>
  customersLost === 0 && coins > 0 && currentUnlocked < maxDishes
    ? currentUnlocked + 1
    : currentUnlocked;

export const pickRandomDish = (
  type: RestaurantType,
  randomValue: number,
  unlockedCount?: number
): MenuItem => {
  const items =
    unlockedCount !== undefined
      ? unlockedMenuFor(type, unlockedCount).items
      : MENUS[type].items;
  const index = Math.min(
    Math.floor(randomValue * items.length),
    items.length - 1
  );
  return items[index];
};
