import { describe, it, expect } from "vitest";
import { restaurantVM } from "../../view/restaurant-vm";
import { createInventory, addItem, type Inventory } from "../../inventory";
import type { ServicePhase } from "../../day-cycle";
import { createCustomer, advanceToService, advanceToKitchenPrep, createDayCycle, enqueueCustomer, takeOrder, sendOrderToKitchen, notifyOrderReady, defaultDurations } from "../../day-cycle";
import { createKitchenServiceState } from "../../kitchen-service";
import { customerId, itemId, orderId } from "../../branded";

// Helper to create a service phase
const makeServicePhase = (tableCount = 4): ServicePhase => {
  const cycle = advanceToService(
    advanceToKitchenPrep(createDayCycle(1), defaultDurations.kitchenPrepMs),
    defaultDurations.serviceMs,
    tableCount
  );
  if (cycle.phase.tag !== "service") throw new Error("expected service");
  return cycle.phase;
};

describe("restaurantVM", () => {
  describe("tables", () => {
    it("returns neutral tint for empty tables", () => {
      const phase = makeServicePhase();
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      vm.tables.forEach((t) => {
        expect(t.occupied).toBe(false);
        expect(t.tint).toBe("neutral");
        expect(t.showPatienceBar).toBe(false);
        expect(t.action).toBeUndefined();
      });
    });

    it("returns occupied tables with patience-based tint and take_order action", () => {
      let phase = makeServicePhase();
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      phase = enqueueCustomer(phase, cust);
      const vm = restaurantVM(phase, createInventory(), "burger", 1);

      const t0 = vm.tables[0];
      expect(t0.occupied).toBe(true);
      expect(t0.customerId).toBe("c1");
      expect(t0.tint).toBe("ok"); // full patience = ok
      expect(t0.patienceFraction).toBe(1);
      expect(t0.action).toBe("take_order");
    });

    it("shows warning tint when patience is moderate", () => {
      let phase = makeServicePhase();
      const cust: import("../../day-cycle").Customer = {
        id: customerId("c1"),
        dishId: itemId("classic-burger"),
        patienceMs: 24_000,
        maxPatienceMs: 60_000,
      };
      phase = enqueueCustomer(phase, cust);
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.tables[0].tint).toBe("warning");
    });

    it("shows critical tint when patience is low", () => {
      let phase = makeServicePhase();
      const cust: import("../../day-cycle").Customer = {
        id: customerId("c1"),
        dishId: itemId("classic-burger"),
        patienceMs: 5_000,
        maxPatienceMs: 60_000,
      };
      phase = enqueueCustomer(phase, cust);
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.tables[0].tint).toBe("critical");
    });

    it("shows active tint for ready_to_serve table", () => {
      let phase = makeServicePhase();
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      phase = enqueueCustomer(phase, cust);
      phase = takeOrder(phase, 0);
      const oid = orderId("o1");
      phase = sendOrderToKitchen(phase, 0, oid);
      phase = notifyOrderReady(phase, oid);

      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.tables[0].tint).toBe("active");
      expect(vm.tables[0].showPatienceBar).toBe(false);
      expect(vm.tables[0].action).toBe("serve");
    });

    it("includes dish sprite key for occupied tables", () => {
      let phase = makeServicePhase();
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      phase = enqueueCustomer(phase, cust);
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.tables[0].dishSpriteKey).toBe("item-classic-burger");
    });

    it("shows send_to_kitchen action for order_pending tables", () => {
      let phase = makeServicePhase();
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      phase = enqueueCustomer(phase, cust);
      phase = takeOrder(phase, 0);
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.tables[0].action).toBe("send_to_kitchen");
    });

    it("shows no action for in_kitchen tables", () => {
      let phase = makeServicePhase();
      const cust = createCustomer(customerId("c1"), itemId("classic-burger"), 60_000);
      phase = enqueueCustomer(phase, cust);
      phase = takeOrder(phase, 0);
      phase = sendOrderToKitchen(phase, 0, orderId("o1"));
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.tables[0].action).toBeUndefined();
    });
  });

  describe("kitchenBadge", () => {
    it("returns 0 when no orders ready", () => {
      const phase = makeServicePhase();
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.kitchenBadge).toBe(0);
    });

    it("returns count of orders in orderUp", () => {
      let phase = makeServicePhase();
      const orderUpOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("classic-burger") };
      phase = { ...phase, kitchen: { ...createKitchenServiceState(), orderUp: [orderUpOrder] } };
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.kitchenBadge).toBe(1);
    });
  });

  describe("playerLocation", () => {
    it("reflects the current playerLocation", () => {
      const phase = makeServicePhase();
      const vm = restaurantVM(phase, createInventory(), "burger", 1);
      expect(vm.playerLocation).toBe("floor");
    });
  });
});
