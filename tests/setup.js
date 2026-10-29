/**
 * Load .env before any Prisma / Express imports.
 * NODE_ENV=test keeps src/server.js from calling app.listen().
 */
import "./../src/lib/env.js";
process.env.NODE_ENV = "test";
