export type RestaurantType = "sushi" | "bbq" | "burger";

const RESTAURANT_DISPLAY_NAMES: Readonly<Record<RestaurantType, string>> = {
  sushi: "Sushi",
  bbq: "BBQ",
  burger: "Burger Joint",
};

export const restaurantDisplayName = (type: RestaurantType): string =>
  RESTAURANT_DISPLAY_NAMES[type];
