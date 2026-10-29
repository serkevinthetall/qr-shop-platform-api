import { describe, expect, it } from "vitest";
import { looksLikeOrderCode } from "../../src/lib/order-code.js";

describe("looksLikeOrderCode", () => {
  it("accepts delivery and pickup short codes", () => {
    expect(looksLikeOrderCode("d1214")).toBe(true);
    expect(looksLikeOrderCode("p12431")).toBe(true);
    expect(looksLikeOrderCode("D9999")).toBe(true);
  });

  it("rejects cuids and junk", () => {
    expect(looksLikeOrderCode("cmvszrl4i0001i2j3airq9pct")).toBe(false);
    expect(looksLikeOrderCode("order-1")).toBe(false);
    expect(looksLikeOrderCode("")).toBe(false);
    expect(looksLikeOrderCode(null)).toBe(false);
  });
});
