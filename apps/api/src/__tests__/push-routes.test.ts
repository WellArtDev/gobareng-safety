// Integration: POST /push-tokens (FCM saja, keputusan Wella 3 Nov
// 2026 11:22) + GET /admin/settings tanpa setting pushProvider.
// Pola api.test.ts: app Express asli + Postgres asli, token JWT dibuat
// langsung via signToken (tanpa alur OTP) supaya tidak kena cooldown.
// DATABASE_URL dibaca dari file /tmp/push-test-pw (dibuat setup DB,
// chmod 600, dihapus setelah run) — BUKAN dari repo.
// Catatan: file ini butuh DATABASE_URL di env shell ATAU file di atas,
// dan --timeout 60000 (seedMountains di ready() melewati 5 detik).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4191;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;
let adminToken = "";
let userToken = "";
let user2Token = "";
let userId = "";
let user2Id = "";

type Json = Record<string, unknown>;

async function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Json };
}

function data(r: { json: Json }): Json {
  return r.json.data as Json;
}
function errCode(r: { json: Json }): string {
  return (r.json.error as Json)?.code as string;
}

beforeAll(async () => {
  try {
    const pw = readFileSync("/tmp/push-test-pw", "utf8").trim();
    process.env.DATABASE_URL ??= `postgresql://push_test:${pw}@127.0.0.1:5432/gobareng_push_test`;
  } catch {
    // DATABASE_URL sudah di env shell — pakai itu.
  }
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = `pw-${run}`;
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  const { signToken } = await import("../auth.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  await new Promise<void>((resolve) => http.listen(PORT, resolve));
  const admin = await testDb.prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL as string },
    create: {
      email: process.env.ADMIN_EMAIL as string,
      slug: `admin-${run}`,
      name: "Admin",
      isAdmin: true,
      role: "admin",
      isVerified: true,
      passwordHash: null,
    },
    update: {},
  });
  const user = await testDb.prisma.user.create({
    data: {
      email: `user-${run}@t.local`,
      slug: `user-${run}`,
      name: "User",
      isVerified: true,
      passwordHash: null,
    },
  });
  const user2 = await testDb.prisma.user.create({
    data: {
      email: `user2-${run}@t.local`,
      slug: `user2-${run}`,
      name: "User2",
      isVerified: true,
      passwordHash: null,
    },
  });
  userId = user.id;
  user2Id = user2.id;
  adminToken = signToken(admin as never);
  userToken = signToken(user as never);
  user2Token = signToken(user2 as never);
});

afterAll(async () => {
  await testDb?.prisma.$disconnect();
  http?.close();
});

describe("GET /admin/settings (FCM saja)", () => {
  test("tidak ada lagi setting pushProvider", async () => {
    const r = await call("GET", "/admin/settings", adminToken);
    expect(r.status).toBe(200);
    expect((data(r).settings as Json).pushProvider).toBeUndefined();
  });
});

describe("POST /push-tokens (device token FCM saja)", () => {
  test("tanpa auth 401, payload kosong/salah 400, simpan + timpa token", async () => {
    const noAuth = await call("POST", "/push-tokens", undefined, {
      deviceToken: "fcm-a",
    });
    expect(noAuth.status).toBe(401);

    const empty = await call("POST", "/push-tokens", userToken, {});
    expect(empty.status).toBe(400);
    expect(errCode(empty)).toBe("INVALID_PAYLOAD");

    const blank = await call("POST", "/push-tokens", userToken, {
      deviceToken: "   ",
    });
    expect(blank.status).toBe(400);

    const first = await call("POST", "/push-tokens", userToken, {
      deviceToken: "fcm-a",
    });
    expect(first.status).toBe(200);
    expect(data(first)).toEqual({ registered: true });

    let rows = await testDb.prisma.pushToken.findMany({
      where: { userId },
    });
    expect(rows.map((r) => r.token)).toEqual(["fcm-a"]);

    const second = await call("POST", "/push-tokens", userToken, {
      deviceToken: "fcm-b",
    });
    expect(second.status).toBe(200);
    rows = await testDb.prisma.pushToken.findMany({ where: { userId } });
    expect(rows.map((r) => r.token)).toEqual(["fcm-b"]);
  });

  test("token yang sama pindah user saat didaftar akun lain", async () => {
    await call("POST", "/push-tokens", userToken, { deviceToken: "fcm-shared" });
    await call("POST", "/push-tokens", user2Token, {
      deviceToken: "fcm-shared",
    });
    const oldOwner = await testDb.prisma.pushToken.findMany({
      where: { userId },
    });
    expect(oldOwner.map((r) => r.token)).not.toContain("fcm-shared");
    const newOwner = await testDb.prisma.pushToken.findMany({
      where: { userId: user2Id },
    });
    expect(newOwner.map((r) => r.token)).toEqual(["fcm-shared"]);
  });
});
