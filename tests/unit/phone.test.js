import { describe, expect, it } from "vitest";
import { normalizeLogin, normalizePhone } from "../../src/lib/phone.js";

describe("normalizePhone", () => {
  it("strips spaces and dashes", () => {
    expect(normalizePhone("09 111 222 333")).toBe("09111222333");
    expect(normalizePhone("09-777-100-201")).toBe("09777100201");
  });

  it("handles empty input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
  });
});

describe("normalizeLogin", () => {
  it("detects email", () => {
    expect(normalizeLogin("QRShop@Gmail.com")).toEqual({
      email: "qrshop@gmail.com",
      phone: null,
    });
  });

  it("detects phone", () => {
    expect(normalizeLogin("09 111 222 333")).toEqual({
      email: null,
      phone: "09111222333",
    });
  });
});
