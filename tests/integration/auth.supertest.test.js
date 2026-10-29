import { describe, expect, it } from "vitest";
import { app, auth, loginAs, request } from "./helpers.js";

describe("auth login (supertest)", () => {
  it("logs in admin", async () => {
    const { token, user } = await loginAs("qrshop@gmail.com", "11111", "admin");
    expect(user.role).toMatch(/admin/);
    expect(token.split(".")).toHaveLength(3);
  });

  it("logs in merchant", async () => {
    const { user } = await loginAs("admin@gmail.com", "1111", "merchant");
    expect(user.role).toBe("merchant");
    expect(user.shopId).toBeTruthy();
  });

  it("logs in buyer by phone", async () => {
    const { user } = await loginAs("09111222333", "1111", "buyer");
    expect(user.role).toBe("buyer");
  });

  it("rejects wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ login: "qrshop@gmail.com", password: "wrong-password", role: "admin" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.ok).toBe(false);
  });

  it("rejects missing login field", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "qrshop@gmail.com", password: "11111" });
    expect(res.status).toBe(400);
  });
});

describe("admin gated routes (supertest)", () => {
  it("requires auth for /api/admin/modules", async () => {
    const res = await request(app).get("/api/admin/modules");
    expect(res.status).toBe(401);
  });

  it("returns module adoption for admin", async () => {
    const { token } = await loginAs("qrshop@gmail.com", "11111", "admin");
    const res = await request(app)
      .get("/api/admin/modules")
      .set(auth(token))
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.shopCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.data.modules)).toBe(true);
    expect(res.body.data.modules.length).toBeGreaterThanOrEqual(5);
  });

  it("returns cross-shop products for admin", async () => {
    const { token } = await loginAs("qrshop@gmail.com", "11111", "admin");
    const res = await request(app)
      .get("/api/admin/products")
      .set(auth(token))
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
