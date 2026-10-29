import { describe, expect, it } from "vitest";
import { app, auth, loginAs, request } from "./helpers.js";

describe("portal + buyer chat (supertest)", () => {
  it("admin creates portal thread and merchant can read/reply", async () => {
    const admin = await loginAs("qrshop@gmail.com", "11111", "admin");
    const merchant = await loginAs("admin@gmail.com", "1111", "merchant");
    const shopId = merchant.user.shopId;
    expect(shopId).toBeTruthy();

    const created = await request(app)
      .post("/api/admin/portal/threads")
      .set(auth(admin.token))
      .send({
        shopId,
        subject: `Vitest portal ${Date.now()}`,
        body: "Hello from vitest admin",
      })
      .expect(200);

    expect(created.body.ok).toBe(true);
    const threadId = created.body.data.id;
    expect(threadId).toBeTruthy();

    const list = await request(app)
      .get("/api/merchant/portal/threads")
      .set(auth(merchant.token))
      .expect(200);
    expect(list.body.data.some((t) => t.id === threadId)).toBe(true);

    const reply = await request(app)
      .post(`/api/merchant/portal/threads/${threadId}/messages`)
      .set(auth(merchant.token))
      .send({ body: "Merchant vitest reply" })
      .expect(200);
    expect(reply.body.ok).toBe(true);
  });

  it("buyer can open shop chat and merchant can reply", async () => {
    const buyer = await loginAs("09111222333", "1111", "buyer");
    const merchant = await loginAs("admin@gmail.com", "1111", "merchant");
    const shopId = merchant.user.shopId;

    const open = await request(app)
      .get(`/api/chat/with-shop/${shopId}`)
      .set(auth(buyer.token))
      .expect(200);
    expect(open.body.ok).toBe(true);

    const send = await request(app)
      .post(`/api/chat/with-shop/${shopId}/messages`)
      .set(auth(buyer.token))
      .send({ text: `Buyer vitest ${Date.now()}` })
      .expect(200);
    expect(send.body.ok).toBe(true);

    const threads = await request(app)
      .get("/api/merchant/chat/threads")
      .set(auth(merchant.token))
      .expect(200);
    expect(threads.body.data.length).toBeGreaterThan(0);

    const tid = threads.body.data[0].id;
    const reply = await request(app)
      .post(`/api/merchant/chat/threads/${tid}/messages`)
      .set(auth(merchant.token))
      .send({ text: `Merchant chat vitest ${Date.now()}` })
      .expect(200);
    expect(reply.body.ok).toBe(true);
  });

  it("returns 404 for unknown portal shop", async () => {
    const admin = await loginAs("qrshop@gmail.com", "11111", "admin");
    const res = await request(app)
      .post("/api/admin/portal/threads")
      .set(auth(admin.token))
      .send({ shopId: "nope-not-real", body: "x" });
    expect(res.status).toBe(404);
  });
});
