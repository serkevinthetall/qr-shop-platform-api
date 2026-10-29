import { expect } from "vitest";
import request from "supertest";
import app from "../../src/server.js";

export { app, request };

export async function loginAs(login, password, role) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ login, password, role })
    .expect(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.data?.token).toBeTruthy();
  return {
    token: res.body.data.token,
    user: res.body.data.user,
  };
}

export function auth(token) {
  return { Authorization: `Bearer ${token}` };
}
