import { type ItemId, itemId } from "./branded";

export type ItemCategory = "raw" | "prepped" | "dish";

export interface ItemDef {
  readonly id: ItemId;
  readonly name: string;
  readonly category: ItemCategory;
  readonly cost: number | undefined;
  readonly shelfLifeMs: number | undefined;
}

const raw = (id: string, name: string, cost: number): ItemDef => ({
  id: itemId(id),
  name,
  category: "raw",
  cost,
  shelfLifeMs: undefined,
});

const prepped = (id: string, name: string, shelfLifeMs: number): ItemDef => ({
  id: itemId(id),
  name,
  category: "prepped",
  cost: undefined,
  shelfLifeMs,
});

const dish = (id: string, name: string, shelfLifeMs: number): ItemDef => ({
  id: itemId(id),
  name,
  category: "dish",
  cost: undefined,
  shelfLifeMs,
});

const ALL_ITEMS: ReadonlyArray<ItemDef> = [
  // ── Raw Ingredients (28) ──────────────────────────────────────────────
  // Shared
  raw("bun", "Bun", 1),
  raw("ground-beef", "Ground Beef", 2),
  raw("onion", "Onion", 1),
  // Burger
  raw("lettuce", "Lettuce", 1),
  raw("tomato", "Tomato", 1),
  raw("cheese", "Cheese", 1),
  raw("bacon", "Bacon", 2),
  raw("chicken-breast", "Chicken Breast", 2),
  raw("potato", "Potato", 1),
  // BBQ
  raw("pork-shoulder", "Pork Shoulder", 3),
  raw("ribs", "Ribs", 3),
  raw("brisket", "Brisket", 3),
  raw("chicken", "Chicken", 2),
  raw("corn", "Corn", 1),
  raw("cabbage", "Cabbage", 1),
  raw("pickle", "Pickle", 1),
  raw("bbq-sauce", "BBQ Sauce", 1),
  // Sushi
  raw("rice", "Rice", 1),
  raw("rice-vinegar", "Rice Vinegar", 1),
  raw("nori", "Nori", 1),
  raw("salmon", "Salmon", 3),
  raw("tuna", "Tuna", 3),
  raw("shrimp", "Shrimp", 2),
  raw("cucumber", "Cucumber", 1),
  raw("avocado", "Avocado", 2),
  raw("crab", "Crab", 2),
  raw("tofu", "Tofu", 1),
  raw("miso-paste", "Miso Paste", 1),

  // ── Prepped & Cooked Intermediates (31) ───────────────────────────────
  // Burger prepped
  prepped("shredded-lettuce", "Shredded Lettuce", 120_000),
  prepped("sliced-tomato", "Sliced Tomato", 90_000),
  prepped("sliced-onion", "Sliced Onion", 120_000),
  prepped("beef-patty", "Beef Patty", 120_000),
  prepped("grilled-patty", "Grilled Patty", 60_000),
  prepped("cut-fries", "Cut Fries", 120_000),
  prepped("french-fries", "French Fries", 45_000),
  prepped("crispy-bacon", "Crispy Bacon", 60_000),
  prepped("grilled-chicken", "Grilled Chicken", 60_000),
  // BBQ prepped
  prepped("coleslaw", "Coleslaw", 120_000),
  prepped("onion-rings", "Onion Rings", 45_000),
  prepped("smoked-patty", "Smoked Patty", 90_000),
  prepped("seasoned-pork", "Seasoned Pork", 120_000),
  prepped("smoked-pork", "Smoked Pork", 120_000),
  prepped("pulled-pork", "Pulled Pork", 90_000),
  prepped("seasoned-ribs", "Seasoned Ribs", 120_000),
  prepped("smoked-ribs", "Smoked Ribs", 120_000),
  prepped("seasoned-brisket", "Seasoned Brisket", 120_000),
  prepped("smoked-brisket", "Smoked Brisket", 120_000),
  prepped("sliced-brisket", "Sliced Brisket", 90_000),
  prepped("seasoned-chicken", "Seasoned Chicken", 120_000),
  prepped("smoked-chicken", "Smoked Chicken", 90_000),
  prepped("grilled-corn", "Grilled Corn", 60_000),
  // Sushi prepped
  prepped("sushi-rice", "Sushi Rice", 90_000),
  prepped("rice-ball", "Rice Ball", 60_000),
  prepped("sliced-salmon", "Sliced Salmon", 45_000),
  prepped("sliced-tuna", "Sliced Tuna", 45_000),
  prepped("sliced-cucumber", "Sliced Cucumber", 120_000),
  prepped("sliced-avocado", "Sliced Avocado", 60_000),
  prepped("cubed-tofu", "Cubed Tofu", 120_000),
  prepped("tempura-shrimp", "Tempura Shrimp", 30_000),

  // ── Dishes (15) ───────────────────────────────────────────────────────
  // Burger dishes
  dish("classic-burger", "Classic Burger", 45_000),
  dish("cheeseburger", "Cheeseburger", 45_000),
  dish("bacon-cheeseburger", "Bacon Cheeseburger", 40_000),
  dish("chicken-sandwich", "Chicken Sandwich", 45_000),
  dish("loaded-fries", "Loaded Fries", 30_000),
  // BBQ dishes
  dish("pulled-pork-sandwich", "Pulled Pork Sandwich", 60_000),
  dish("smoked-ribs-plate", "Smoked Ribs Plate", 60_000),
  dish("brisket-sandwich", "Brisket Sandwich", 60_000),
  dish("bbq-burger", "BBQ Burger", 50_000),
  dish("smoked-chicken-plate", "Smoked Chicken Plate", 60_000),
  // Sushi dishes
  dish("salmon-nigiri", "Salmon Nigiri", 30_000),
  dish("tuna-roll", "Tuna Roll", 30_000),
  dish("california-roll", "California Roll", 30_000),
  dish("tempura-shrimp-roll", "Tempura Shrimp Roll", 30_000),
  dish("miso-soup", "Miso Soup", 60_000),
];

const ITEM_MAP: ReadonlyMap<ItemId, ItemDef> = new Map(
  ALL_ITEMS.map((item) => [item.id, item])
);

export const findItem = (id: ItemId): ItemDef | undefined =>
  ITEM_MAP.get(id);

export const rawItems = (): ReadonlyArray<ItemDef> =>
  ALL_ITEMS.filter((i) => i.category === "raw");

export const preppedItems = (): ReadonlyArray<ItemDef> =>
  ALL_ITEMS.filter((i) => i.category === "prepped");

export const dishItems = (): ReadonlyArray<ItemDef> =>
  ALL_ITEMS.filter((i) => i.category === "dish");

export const allItems = (): ReadonlyArray<ItemDef> => ALL_ITEMS;
