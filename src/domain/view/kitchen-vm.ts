import type { ItemId } from "../branded";
import type { RestaurantType } from "../restaurant-type";
import { findItem } from "../items";
import { countItem, hasIngredientsFor, type Inventory } from "../inventory";
import { enabledRecipesFor } from "../menu";
import type { RecipeMethod, RecipeStep } from "../recipes";

export interface ActiveRecipe {
  readonly step: RecipeStep;
  readonly startedAt: number;
}

export interface RecipeInputVM {
  readonly itemId: ItemId;
  readonly name: string;
  readonly have: number;
  readonly need: number;
  readonly isShort: boolean;
}

export interface RecipeVM {
  readonly stepId: string;
  readonly outputName: string;
  readonly outputSpriteKey: string;
  readonly inputs: ReadonlyArray<RecipeInputVM>;
  readonly timeSeconds: number;
  readonly canMake: boolean;
  readonly method: RecipeMethod;
}

export interface ActiveRecipeVM {
  readonly outputName: string;
  readonly fraction: number;
}

export interface KitchenVM {
  readonly recipes: ReadonlyArray<RecipeVM>;
  readonly activeRecipe: ActiveRecipeVM | undefined;
}

export const kitchenVM = (
  inventory: Inventory,
  restaurantType: RestaurantType,
  unlockedCount: number,
  activeRecipe: ActiveRecipe | undefined,
  now: number,
  disabledDishes: ReadonlyArray<ItemId> = []
): KitchenVM => {
  const allRecipes = enabledRecipesFor(restaurantType, unlockedCount, disabledDishes);

  const recipes: ReadonlyArray<RecipeVM> = allRecipes.map((recipe) => {
    const outputItem = findItem(recipe.output);
    const outputName = outputItem?.name ?? recipe.name;

    const inputs: ReadonlyArray<RecipeInputVM> = recipe.inputs.map((inp) => {
      const item = findItem(inp.itemId);
      const have = countItem(inventory, inp.itemId);
      return {
        itemId: inp.itemId,
        name: item?.name ?? inp.itemId,
        have,
        need: inp.quantity,
        isShort: have < inp.quantity,
      };
    });

    return {
      stepId: recipe.id,
      outputName,
      outputSpriteKey: `item-${recipe.output}`,
      inputs,
      timeSeconds: recipe.timeMs / 1_000,
      canMake: hasIngredientsFor(inventory, recipe),
      method: recipe.method,
    };
  });

  const activeRecipeVM: ActiveRecipeVM | undefined =
    activeRecipe !== undefined
      ? {
          outputName:
            findItem(activeRecipe.step.output)?.name ??
            activeRecipe.step.name,
          fraction: Math.min(
            1,
            (now - activeRecipe.startedAt) / activeRecipe.step.timeMs
          ),
        }
      : undefined;

  return { recipes, activeRecipe: activeRecipeVM };
};
