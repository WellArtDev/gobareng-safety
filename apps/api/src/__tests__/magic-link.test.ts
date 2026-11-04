// Magic link juri tanpa OTP — TDD. Dua akun juri (admin) login lewat
// satu tautan yang dapat dipakai berulang sampai tenggat pengumuman
// (10 Nov 2026 23:59 WIB), lalu mati total — termasuk sesi dan refresh
// token-nya. Token mentah tidak pernah ditulis ke DB (hanya hash sha256),
// token salah/kedaluwarsa tidak membocorkan akun yang dituju.
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import jwt from "jsonwebtoken";
import type { Db } from "../db.js";
import {
  MAGIC_LINK_DEADLINE,
  hashMagicToken,
  redeemMagicLink,
} from "../magic-link.js";

const PORT = 4196;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);
const DEADLINE_MS = MAGIC_LINK_DEADLINE.getTime();

let http: Server;
let testDb: Db;
let judgeUserId = "";
let judgeToken = "";
let expiredToken = "";
let suspendedToken = "";

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = `test-admin-${run}`;
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  await new Promise<void>((resolve) => http.listen(PORT, resolve));

  // Akun juri aktif (admin, terverifikasi akun dua kanal supaya gate
  // SOS lolos; isVerified organizer tetap false — jalur organizer
  // tidak tersentuh).
  const judge = await testDb.createUser({
    email: `juri-${run}@t.local`,
    name: "Juri",
    slug: `juri-${run}`,
    passwordHash: null,
    phone: null,
    isAdmin: true,
    role: "admin",
    isVerified: false,
    emailVerifiedAt: new Date(),
    phoneVerifiedAt: new Date(),
    accountVerifiedAt: new Date(),
  });
  judgeUserId = judge.id;
  judgeToken = randomBytes(32).toString("base64url");
  await testDb.createMagicLinkToken({
    userId: judge.id,
    label: "juri",
    tokenHash: hashMagicToken(judgeToken),
    expiresAt: MAGIC_LINK_DEADLINE,
  });

  // Baris kedaluwarsa (tenggat baris lewat, sebelum tenggat global).
  const expiredUser = await testDb.createUser({
    email: `juri-exp-${run}@t.local`,
    name: "Juri Kedaluwarsa",
    slug: `juri-exp-${run}`,
    passwordHash: null,
    phone: null,
    isAdmin: true,
    role: "admin",
    isVerified: false,
  });
  expiredToken = randomBytes(32).toString("base64url");
  await testDb.createMagicLinkToken({
    userId: expiredUser.id,
    label: "juri",
    tokenHash: hashMagicToken(expiredToken),
    expiresAt: new Date(Date.now() - 60_000),
  });

  // Akun ditangguhkan: token valid tapi akun tidak boleh login.
  const suspendedUser = await testDb.createUser({
    email: `juri-sus-${run}@t.local`,
    name: "Juri Ditangguhkan",
    slug: `juri-sus-${run}`,
    passwordHash: null,
    phone: null,
    isAdmin: true,
    role: "admin",
    isVerified: false,
  });
  await testDb.updateUser(suspendedUser.id, { suspendedAt: new Date() });
  suspendedToken = randomBytes(32).toString("base64url");
  await testDb.createMagicLinkToken({
    userId: suspendedUser.id,
    label: "juri",
    tokenHash: hashMagicToken(suspendedToken),
    expiresAt: MAGIC_LINK_DEADLINE,
  });
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
function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

describe("POST /auth/magic-link", () => {
  test("token valid -> sesi penuh (user + access + refresh)", async () => {
    const r = await call("POST", "/auth/magic-link", undefined, {
      token: judgeToken,
    });
    expect(r.status).toBe(200);
    const d = data(r);
    expect((d.user as Json).id).toBe(judgeUserId);
    expect(typeof d.token).toBe("string");
    expect(typeof d.refreshToken).toBe("string");

    // Access token hidup dan mengarah ke akun juri.
    const me = await call("GET", "/auth/me", d.token as string);
    expect(me.status).toBe(200);
    expect((data(me).user as Json).id).toBe(judgeUserId);

    // Refresh token mati tepat di tenggat, bukan 30 hari.
    const row = await testDb.refreshTokenByHash(sha256(d.refreshToken as string));
    expect(row).not.toBeNull();
    expect(row!.expiresAt.getTime()).toBe(DEADLINE_MS);
  });

  test("access token tidak melewati tenggat", async () => {
    const r = await call("POST", "/auth/magic-link", undefined, {
      token: judgeToken,
    });
    const decoded = jwt.decode(data(r).token as string) as {
      exp?: number;
    } | null;
    expect(decoded?.exp).toBeDefined();
    expect(decoded!.exp! * 1000).toBeLessThanOrEqual(DEADLINE_MS);
  });

  test("tautan dapat dipakai berulang sampai tenggat", async () => {
    const first = await call("POST", "/auth/magic-link", undefined, {
      token: judgeToken,
    });
    const second = await call("POST", "/auth/magic-link", undefined, {
      token: judgeToken,
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((data(second).user as Json).id).toBe(judgeUserId);
  });

  test("token salah -> 401 generik, tanpa bocoran akun", async () => {
    const r = await call("POST", "/auth/magic-link", undefined, {
      token: randomBytes(32).toString("base64url"),
    });
    expect(r.status).toBe(401);
    expect(errCode(r)).toBe("INVALID_MAGIC_LINK");
    expect(r.json.data).toBeUndefined();
  });

  test("baris kedaluwarsa -> 410 yang jelas", async () => {
    const r = await call("POST", "/auth/magic-link", undefined, {
      token: expiredToken,
    });
    expect(r.status).toBe(410);
    expect(errCode(r)).toBe("MAGIC_LINK_EXPIRED");
  });

  test("akun ditangguhkan -> 401 generik", async () => {
    const r = await call("POST", "/auth/magic-link", undefined, {
      token: suspendedToken,
    });
    expect(r.status).toBe(401);
    expect(errCode(r)).toBe("INVALID_MAGIC_LINK");
  });

  test("refresh hasil rotasi tetap dibatasi tenggat", async () => {
    const login = await call("POST", "/auth/magic-link", undefined, {
      token: judgeToken,
    });
    const rotated = await call("POST", "/auth/refresh", undefined, {
      refreshToken: data(login).refreshToken,
    });
    expect(rotated.status).toBe(200);
    const row = await testDb.refreshTokenByHash(
      sha256(data(rotated).refreshToken as string),
    );
    expect(row).not.toBeNull();
    expect(row!.expiresAt.getTime()).toBe(DEADLINE_MS);
  });
});

describe("redeemMagicLink (level service, jam disuntik)", () => {
  test("lewat tenggat global -> 410 walau baris belum kedaluwarsa", async () => {
    let code = "";
    let status = 0;
    try {
      await redeemMagicLink(
        testDb,
        judgeToken,
        new Date("2026-11-11T00:00:00Z"),
      );
    } catch (error) {
      const e = error as { code?: string; status?: number };
      code = e.code ?? "";
      status = e.status ?? 0;
    }
    expect(status).toBe(410);
    expect(code).toBe("MAGIC_LINK_EXPIRED");
  });
});
