import type { CustomerId } from "./branded";

export interface Table {
  readonly id: number;
  readonly customerId: CustomerId | undefined;
}

export interface TableLayout {
  readonly tables: ReadonlyArray<Table>;
}

export const createTableLayout = (count: number): TableLayout => ({
  tables: Array.from({ length: count }, (_, i) => ({
    id: i,
    customerId: undefined,
  })),
});

export const emptyTableIds = (layout: TableLayout): ReadonlyArray<number> =>
  layout.tables
    .filter((t) => t.customerId === undefined)
    .map((t) => t.id);

export const seatCustomer = (
  layout: TableLayout,
  tableId: number,
  customerId: CustomerId
): TableLayout => {
  const table = layout.tables.find((t) => t.id === tableId);
  if (table === undefined || table.customerId !== undefined) return layout;
  return {
    tables: layout.tables.map((t) =>
      t.id === tableId ? { ...t, customerId } : t
    ),
  };
};

export const unseatCustomer = (
  layout: TableLayout,
  customerId: CustomerId
): TableLayout => {
  if (!layout.tables.some((t) => t.customerId === customerId)) return layout;
  return {
    tables: layout.tables.map((t) =>
      t.customerId === customerId ? { ...t, customerId: undefined } : t
    ),
  };
};

export const findCustomerTable = (
  layout: TableLayout,
  customerId: CustomerId
): number | undefined =>
  layout.tables.find((t) => t.customerId === customerId)?.id;

export const occupiedCount = (layout: TableLayout): number =>
  layout.tables.filter((t) => t.customerId !== undefined).length;

export const tableCount = (layout: TableLayout): number =>
  layout.tables.length;
