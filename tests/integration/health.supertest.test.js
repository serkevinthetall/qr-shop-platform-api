import { describe, expect, it } from "vitest";
import { app, request } from "./helpers.js";

describe("GET /health (supertest)", () => {
  it("returns platform health payload", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.service).toBe("qr-shop-platform-api");
    expect(res.body.data.clients).toEqual(
      expect.arrayContaining(["marketplace", "merchant", "admin"]),
    );
  });
});
