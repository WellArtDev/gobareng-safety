// Validasi + persistensi setting whatsappProvider lewat API admin —
// TDD. Pola harness mengikuti whatsapp-otp.test.ts (server sendiri,
// port sendiri, admin dibuat langsung); modul whatsapp TIDAK di-mock
// di sini karena yang diuji hanya endpoint settings, bukan pengiriman.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4197;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;
let adminToken = "";
let userToken = "";

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = "AdminPass123!";
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  const { signToken } = await import("../auth.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  await new Promise<void>((resolve) => http.listen(PORT, resolve));
  const admin = await testDb.createUser({
    email: `wa-prov-admin-${run}@t.local`,
    name: "WA Provider Admin",
    slug: `wa-prov-admin-${run}`,
    passwordHash: "otp-only:test-dummy",
    phone: null,
    isAdmin: true,
    role: "admin",
    isVerified: true,
  });
  adminToken = signToken(admin);
  const user = await testDb.createUser({
    email: `wa-prov-user-${run}@t.local`,
    name: "WA Provider User",
    slug: `wa-prov-user-${run}`,
    passwordHash: "otp-only:test-dummy",
    phone: null,
    isAdmin: false,
    role: "user",
    isVerified: true,
  });
  userToken = signToken(user);
});

afterAll(() => {
  http?.close();
});

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

describe("PATCH /admin/settings: whatsappProvider", () => {
  test("nilai di luar 'official'/'dikontak' ditolak 400, nilai lama dipertahankan", async () => {
    const before = await call("GET", "/admin/settings", adminToken);
    const beforeValue = (data(before).settings as Json).whatsappProvider;
    const bad = await call("PATCH", "/admin/settings", adminToken, {
      whatsappProvider: "sms",
    });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe("INVALID_PAYLOAD");
    const after = await call("GET", "/admin/settings", adminToken);
    expect((data(after).settings as Json).whatsappProvider).toBe(beforeValue);
  });

  test("nilai 'dikontak' tersimpan dan terbaca kembali; 'official' mengembalikannya", async () => {
    const setDikontak = await call("PATCH", "/admin/settings", adminToken, {
      whatsappProvider: "dikontak",
    });
    expect(setDikontak.status).toBe(200);
    expect((data(setDikontak).settings as Json).whatsappProvider).toBe("dikontak");
    const read = await call("GET", "/admin/settings", adminToken);
    expect((data(read).settings as Json).whatsappProvider).toBe("dikontak");
    const back = await call("PATCH", "/admin/settings", adminToken, {
      whatsappProvider: "official",
    });
    expect(back.status).toBe(200);
    expect((data(back).settings as Json).whatsappProvider).toBe("official");
  });

  test("PATCH tanpa admin ditolak (401 tanpa token, 403 member biasa)", async () => {
    const noToken = await call("PATCH", "/admin/settings", undefined, {
      whatsappProvider: "dikontak",
    });
    expect(noToken.status).toBe(401);
    const member = await call("PATCH", "/admin/settings", userToken, {
      whatsappProvider: "dikontak",
    });
    expect(member.status).toBe(403);
  });
});
