/** Branded string type for customer IDs. */
export type CustomerId = string & { readonly __brand: "CustomerId" };

/** Branded string type for order IDs. */
export type OrderId = string & { readonly __brand: "OrderId" };

/** Branded string type for save slot IDs. */
export type SlotId = string & { readonly __brand: "SlotId" };

/** Branded string type for item/dish IDs. */
export type ItemId = string & { readonly __brand: "ItemId" };

export const customerId = (s: string): CustomerId => s as CustomerId;
export const orderId = (s: string): OrderId => s as OrderId;
export const slotId = (s: string): SlotId => s as SlotId;
export const itemId = (s: string): ItemId => s as ItemId;
