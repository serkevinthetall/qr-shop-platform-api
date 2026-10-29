import { describe, expect, it } from "vitest";
import {
  isVisibleToMerchant,
  normalizeMerchantScope,
  parseMerchantIds,
  toDbFields,
} from "../../src/lib/announcement.js";

describe("announcement helpers", () => {
  it("parses merchant ids from JSON string", () => {
    expect(parseMerchantIds('["shop-nova","shop-b"]')).toEqual([
      "shop-nova",
      "shop-b",
    ]);
  });

  it("normalizes selected scope with empty ids to none", () => {
    expect(normalizeMerchantScope("selected", [])).toBe("none");
    expect(normalizeMerchantScope("selected", ["shop-nova"])).toBe("selected");
  });

  it("writes selected merchant ids into DB fields", () => {
    const fields = toDbFields(
      {
        title: "Hi",
        body: "Body",
        merchantScope: "selected",
        merchantIds: ["shop-nova"],
        published: true,
      },
      { forCreate: true },
    );
    expect(fields.merchantScope).toBe("selected");
    expect(JSON.parse(fields.merchantIdsJson)).toEqual(["shop-nova"]);
    expect(fields.authorName).toBe("QR Shop Admin");
  });

  it("visibility rules for merchants", () => {
    expect(
      isVisibleToMerchant(
        { published: true, merchantScope: "all", merchantIdsJson: "[]" },
        "shop-nova",
      ),
    ).toBe(true);
    expect(
      isVisibleToMerchant(
        {
          published: true,
          merchantScope: "selected",
          merchantIdsJson: '["shop-nova"]',
        },
        "shop-nova",
      ),
    ).toBe(true);
    expect(
      isVisibleToMerchant(
        {
          published: true,
          merchantScope: "selected",
          merchantIdsJson: '["shop-other"]',
        },
        "shop-nova",
      ),
    ).toBe(false);
    expect(
      isVisibleToMerchant(
        { published: false, merchantScope: "all", merchantIdsJson: "[]" },
        "shop-nova",
      ),
    ).toBe(false);
  });
});
