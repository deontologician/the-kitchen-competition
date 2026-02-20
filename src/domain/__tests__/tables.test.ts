import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  createTableLayout,
  emptyTableIds,
  seatCustomer,
  unseatCustomer,
  findCustomerTable,
  occupiedCount,
  tableCount,
} from "../tables";
import { customerId } from "../branded";

// ---------------------------------------------------------------------------
// createTableLayout
// ---------------------------------------------------------------------------
describe("createTableLayout", () => {
  it("creates N empty tables with ids 0..count-1", () => {
    const layout = createTableLayout(4);
    expect(tableCount(layout)).toBe(4);
    expect(layout.tables.map((t) => t.id)).toEqual([0, 1, 2, 3]);
    expect(layout.tables.every((t) => t.customerId === undefined)).toBe(true);
  });

  it("creates zero tables when count is 0", () => {
    const layout = createTableLayout(0);
    expect(tableCount(layout)).toBe(0);
    expect(layout.tables).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// emptyTableIds
// ---------------------------------------------------------------------------
describe("emptyTableIds", () => {
  it("returns all ids when all tables are empty", () => {
    const layout = createTableLayout(3);
    expect(emptyTableIds(layout)).toEqual([0, 1, 2]);
  });

  it("excludes occupied tables", () => {
    const layout = seatCustomer(createTableLayout(3), 1, customerId("c1"));
    expect(emptyTableIds(layout)).toEqual([0, 2]);
  });

  it("returns empty array when all tables are occupied", () => {
    let layout = createTableLayout(2);
    layout = seatCustomer(layout, 0, customerId("c1"));
    layout = seatCustomer(layout, 1, customerId("c2"));
    expect(emptyTableIds(layout)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// seatCustomer
// ---------------------------------------------------------------------------
describe("seatCustomer", () => {
  it("assigns customer to the specified table", () => {
    const layout = seatCustomer(createTableLayout(3), 1, customerId("c1"));
    expect(layout.tables[1].customerId).toBe(customerId("c1"));
  });

  it("is no-op if table is already occupied", () => {
    const seated = seatCustomer(createTableLayout(3), 1, customerId("c1"));
    const again = seatCustomer(seated, 1, customerId("c2"));
    expect(again.tables[1].customerId).toBe(customerId("c1"));
  });

  it("is no-op if table id is out of range", () => {
    const layout = createTableLayout(3);
    const result = seatCustomer(layout, 99, customerId("c1"));
    expect(result).toEqual(layout);
  });

  it("does not affect other tables", () => {
    const layout = seatCustomer(createTableLayout(3), 1, customerId("c1"));
    expect(layout.tables[0].customerId).toBeUndefined();
    expect(layout.tables[2].customerId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// unseatCustomer
// ---------------------------------------------------------------------------
describe("unseatCustomer", () => {
  it("removes customer from their table", () => {
    const seated = seatCustomer(createTableLayout(3), 1, customerId("c1"));
    const unseated = unseatCustomer(seated, customerId("c1"));
    expect(unseated.tables[1].customerId).toBeUndefined();
  });

  it("is no-op if customer is not found", () => {
    const layout = createTableLayout(3);
    const result = unseatCustomer(layout, customerId("missing"));
    expect(result).toEqual(layout);
  });
});

// ---------------------------------------------------------------------------
// findCustomerTable
// ---------------------------------------------------------------------------
describe("findCustomerTable", () => {
  it("returns table id where customer is seated", () => {
    const layout = seatCustomer(createTableLayout(4), 2, customerId("c1"));
    expect(findCustomerTable(layout, customerId("c1"))).toBe(2);
  });

  it("returns undefined if customer is not seated", () => {
    const layout = createTableLayout(4);
    expect(findCustomerTable(layout, customerId("c1"))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// occupiedCount / tableCount
// ---------------------------------------------------------------------------
describe("occupiedCount", () => {
  it("returns 0 for all-empty layout", () => {
    expect(occupiedCount(createTableLayout(4))).toBe(0);
  });

  it("counts occupied tables", () => {
    let layout = createTableLayout(4);
    layout = seatCustomer(layout, 0, customerId("c1"));
    layout = seatCustomer(layout, 2, customerId("c2"));
    expect(occupiedCount(layout)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------
describe("property-based tests", () => {
  it("seat + unseat roundtrip leaves table empty", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 19 }),
        fc.string({ minLength: 1 }),
        (count, rawTableId, cid) => {
          const tableId = rawTableId % count;
          const layout = createTableLayout(count);
          const seated = seatCustomer(layout, tableId, customerId(cid));
          const unseated = unseatCustomer(seated, customerId(cid));
          expect(unseated.tables[tableId].customerId).toBeUndefined();
        }
      )
    );
  });

  it("occupiedCount + emptyTableIds length = tableCount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 10 }),
        (count, customerIds) => {
          let layout = createTableLayout(count);
          const uniqueIds = [...new Set(customerIds)];
          uniqueIds.forEach((cid, i) => {
            if (i < count) {
              layout = seatCustomer(layout, i, customerId(cid));
            }
          });
          expect(occupiedCount(layout) + emptyTableIds(layout).length).toBe(
            tableCount(layout)
          );
        }
      )
    );
  });

  it("seatCustomer never exceeds tableCount occupied", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 20 }),
        (count, customerIds) => {
          let layout = createTableLayout(count);
          customerIds.forEach((cid, i) => {
            layout = seatCustomer(layout, i % count, customerId(cid));
          });
          expect(occupiedCount(layout)).toBeLessThanOrEqual(tableCount(layout));
        }
      )
    );
  });
});
