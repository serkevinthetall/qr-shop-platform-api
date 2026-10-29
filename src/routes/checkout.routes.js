/**
 * Marketplace alias: POST /api/checkout
 * Delegates to the same multi-shop handler as POST /api/orders/checkout
 * by re-dispatching into the orders router.
 */
import { Router } from "express";
import orderRoutes from "./orders.routes.js";

const router = Router();

router.post("/", (req, res, next) => {
  req.url = "/checkout";
  return orderRoutes(req, res, next);
});

export default router;
