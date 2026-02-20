import { describe, it, expect } from "vitest";
import {
  customerId,
  orderId,
  slotId,
  itemId,
  type CustomerId,
  type OrderId,
  type SlotId,
  type ItemId,
} from "../branded";

describe("branded ID factories", () => {
  it("customerId preserves the underlying string", () => {
    const id = customerId("abc-123");
    expect(id).toBe("abc-123");
    // Can be used as a string
    expect(id.length).toBe(7);
  });

  it("orderId preserves the underlying string", () => {
    const id = orderId("order-1");
    expect(id).toBe("order-1");
  });

  it("slotId preserves the underlying string", () => {
    const id = slotId("slot-1");
    expect(id).toBe("slot-1");
  });

  it("itemId preserves the underlying string", () => {
    const id = itemId("classic-burger");
    expect(id).toBe("classic-burger");
  });

  it("branded IDs are structurally strings at runtime", () => {
    const cid: CustomerId = customerId("c1");
    const oid: OrderId = orderId("o1");
    const sid: SlotId = slotId("s1");
    const iid: ItemId = itemId("i1");
    // All are strings at runtime
    expect(typeof cid).toBe("string");
    expect(typeof oid).toBe("string");
    expect(typeof sid).toBe("string");
    expect(typeof iid).toBe("string");
  });

  it("branded IDs work with JSON serialization", () => {
    const id = customerId("abc");
    expect(JSON.stringify(id)).toBe('"abc"');
    expect(JSON.parse(JSON.stringify(id))).toBe("abc");
  });
});
