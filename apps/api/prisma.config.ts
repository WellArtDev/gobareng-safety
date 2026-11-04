// Prisma 7 CLI config — the migrate connection URL comes from env only
// (DATABASE_URL), never from a committed file (repo rule: no secrets in
// git). Runtime connections use the pg adapter in src/db.ts.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
