import { describe, it, expect } from "vitest";
import { restaurantVM, type TableVM, type ActionPrompt } from "../../view/restaurant-vm";
import { createInventory, addItem, type Inventory } from "../../inventory";
import type { ServicePhase, Customer } from "../../day-cycle";
import { createCustomer } from "../../day-cycle";
import { createTableLayout, seatCustomer } from "../../tables";
import { customerId, itemId, orderId } from "../../branded";

const waitingPhase = (
  customers: ReadonlyArray<Customer> = [],
  tableCount: number = 4
): ServicePhase => {
  let layout = createTableLayout(tableCount);
  customers.forEach((c, i) => {
    layout = seatCustomer(layout, i, c.id);
  });
  return {
    tag: "service",
    remainingMs: 60_000,
    durationMs: 120_000,
    subPhase: { tag: "waiting_for_customer" },
    customersServed: 0,
    customersLost: 0,
    earnings: 0,
    customerQueue: customers,
    tableLayout: layout,
  };
};

describe("restaurantVM", () => {
  describe("tables", () => {
    it("returns neutral tint for empty tables", () => {
      const phase = waitingPhase();
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      vm.tables.forEach((t) => {
        expect(t.occupied).toBe(false);
        expect(t.tint).toBe("neutral");
        expect(t.showPatienceBar).toBe(false);
      });
    });

    it("returns occupied tables with patience-based tint", () => {
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      const phase = waitingPhase([cust]);
      const vm = restaurantVM(phase, createInventory(), "burger", 1);

      const t0 = vm.tables[0];
      expect(t0.occupied).toBe(true);
      expect(t0.customerId).toBe("c1");
      expect(t0.tint).toBe("ok"); // full patience = ok
      expect(t0.patienceFraction).toBe(1);
    });

    it("shows warning tint when patience is moderate", () => {
      const cust: Customer = {
        id: customerId("c1"),
        dishId: itemId("classic-burger"),
        patienceMs: 24_000,
        maxPatienceMs: 60_000,
      };
      const phase = waitingPhase([cust]);
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.tables[0].tint).toBe("warning");
    });

    it("shows critical tint when patience is low", () => {
      const cust: Customer = {
        id: customerId("c1"),
        dishId: itemId("classic-burger"),
        patienceMs: 5_000,
        maxPatienceMs: 60_000,
      };
      const phase = waitingPhase([cust]);
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.tables[0].tint).toBe("critical");
    });

    it("shows active tint for active customer", () => {
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      let layout = createTableLayout(4);
      layout = seatCustomer(layout, 0, cust.id);

      const phase: ServicePhase = {
        tag: "service",
        remainingMs: 60_000,
        durationMs: 120_000,
        subPhase: { tag: "taking_order", customer: cust },
        customersServed: 0,
        customersLost: 0,
        earnings: 0,
        customerQueue: [cust],
        tableLayout: layout,
      };

      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.tables[0].tint).toBe("active");
      expect(vm.tables[0].showPatienceBar).toBe(false);
    });

    it("includes dish sprite key for occupied tables", () => {
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      const phase = waitingPhase([cust]);
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.tables[0].dishSpriteKey).toBe("item-classic-burger");
    });
  });

  describe("actionPrompt", () => {
    it("returns waiting prompt when no customers", () => {
      const phase = waitingPhase();
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.actionPrompt.tag).toBe("waiting");
      if (vm.actionPrompt.tag === "waiting") {
        expect(vm.actionPrompt.message).toBe("Waiting for customers...");
      }
    });

    it("returns waiting prompt with queue count", () => {
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      let layout = createTableLayout(4);
      layout = seatCustomer(layout, 0, cust.id);
      const phase: ServicePhase = {
        ...waitingPhase([cust]),
        tableLayout: layout,
      };
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.actionPrompt.tag).toBe("waiting");
      if (vm.actionPrompt.tag === "waiting") {
        expect(vm.actionPrompt.message).toBe("1 in queue...");
      }
    });

    it("returns taking_order prompt with dish info and hasDish=false", () => {
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      let layout = createTableLayout(4);
      layout = seatCustomer(layout, 0, cust.id);

      const phase: ServicePhase = {
        tag: "service",
        remainingMs: 60_000,
        durationMs: 120_000,
        subPhase: { tag: "taking_order", customer: cust },
        customersServed: 0,
        customersLost: 0,
        earnings: 0,
        customerQueue: [cust],
        tableLayout: layout,
      };

      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.actionPrompt.tag).toBe("taking_order");
      if (vm.actionPrompt.tag === "taking_order") {
        expect(vm.actionPrompt.dishName).toBe("Classic Burger");
        expect(vm.actionPrompt.dishSpriteKey).toBe("item-classic-burger");
        expect(vm.actionPrompt.hasDish).toBe(false);
        expect(vm.actionPrompt.sellPrice).toBe(8);
      }
    });

    it("returns taking_order with hasDish=true when dish is in inventory", () => {
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      let layout = createTableLayout(4);
      layout = seatCustomer(layout, 0, cust.id);
      let inv: Inventory = createInventory();
      inv = addItem(inv, itemId("classic-burger"), Date.now());

      const phase: ServicePhase = {
        tag: "service",
        remainingMs: 60_000,
        durationMs: 120_000,
        subPhase: { tag: "taking_order", customer: cust },
        customersServed: 0,
        customersLost: 0,
        earnings: 0,
        customerQueue: [cust],
        tableLayout: layout,
      };

      const vm = restaurantVM(phase, inv, "burger", 1);
      if (vm.actionPrompt.tag === "taking_order") {
        expect(vm.actionPrompt.hasDish).toBe(true);
      }
    });

    it("returns cooking prompt during cooking sub-phase", () => {
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      let layout = createTableLayout(4);
      layout = seatCustomer(layout, 0, cust.id);

      const phase: ServicePhase = {
        tag: "service",
        remainingMs: 60_000,
        durationMs: 120_000,
        subPhase: {
          tag: "cooking",
          order: { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("classic-burger") },
        },
        customersServed: 0,
        customersLost: 0,
        earnings: 0,
        customerQueue: [cust],
        tableLayout: layout,
      };

      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.actionPrompt.tag).toBe("cooking");
    });

    it("returns serving prompt with dish info", () => {
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      let layout = createTableLayout(4);
      layout = seatCustomer(layout, 0, cust.id);
      let inv: Inventory = createInventory();
      inv = addItem(inv, itemId("classic-burger"), Date.now());

      const phase: ServicePhase = {
        tag: "service",
        remainingMs: 60_000,
        durationMs: 120_000,
        subPhase: {
          tag: "serving",
          order: { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("classic-burger") },
        },
        customersServed: 0,
        customersLost: 0,
        earnings: 0,
        customerQueue: [cust],
        tableLayout: layout,
      };

      const vm = restaurantVM(phase, inv, "burger", 1);
      expect(vm.actionPrompt.tag).toBe("serving");
      if (vm.actionPrompt.tag === "serving") {
        expect(vm.actionPrompt.dishName).toBe("Classic Burger");
        expect(vm.actionPrompt.hasDish).toBe(true);
        expect(vm.actionPrompt.sellPrice).toBe(8);
      }
    });
  });
});
