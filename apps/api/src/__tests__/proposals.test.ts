// Usulan gunung & jalur buatan user (antre persetujuan admin).
// Aturan yang dikunci tes ini:
// 1. Validasi: koordinat di luar rentang = 400; jalur tanpa checkpoint
//    pertama bertanda titik kumpul awal = 400.
// 2. Usulan PENDING tidak tampil di katalog publik GET /mountains.
// 3. Approve gunung/jalur -> baris katalog source 'USER'.
// 4. Seed ulang (replaceMountainCatalog + ready) TIDAK menghapus
//    entri USER — ini regresi kritis fitur ini.
// 5. Reject hanya dari PENDING; approve kedua kali = 404.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4191;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;

// Kredensial admin file ini ditangkap ke konstanta lokal — jangan
// dibaca dari process.env saat login: di full-suite, file tes lain
// bisa menimpa ADMIN_* di env bersama setelah beforeAll file ini.
const ADMIN_EMAIL = `admin-${run}@t.local`;
const ADMIN_PASSWORD = `AdminPass-${run}-16ch`;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  const { hashPassword } = await import("../auth.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  // Seed admin hanya dibuat bila belum ada admin sama sekali — di
  // full-suite, file tes lain bisa lebih dulu men-seed admin lain di
  // DB bersama, sehingga admin file ini tidak terbentuk. Buat admin
  // file ini secara eksplisit (email unik per run, jadi aman diulang).
  await testDb.createUser({
    email: ADMIN_EMAIL,
    name: "Admin Proposals",
    slug: `admin-prop-${run}`,
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    phone: null,
    isAdmin: true,
    role: "admin",
    isVerified: true,
  });
  await new Promise<void>((resolve) => http.listen(PORT, resolve));
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

async function register(name: string): Promise<{ token: string; id: string }> {
  const r = await call("POST", "/auth/register", undefined, {
    email: `${name}-${run}@t.local`,
    name: `User ${name}`,
    password: `Password-${run}-ok`,
  });
  expect(r.status).toBe(201);
  const d = data(r);
  return { token: d.token as string, id: (d.user as Json).id as string };
}

async function adminLogin(): Promise<string> {
  const r = await call("POST", "/auth/login", undefined, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  expect(r.status).toBe(200);
  return data(r).token as string;
}

describe("usulan gunung & jalur buatan user", () => {
  test("validasi koordinat + checkpoint pertama titik kumpul", async () => {
    const user = await register("propval");
    const badLat = await call("POST", "/mountains/proposals", user.token, {
      name: "Gunung Tes",
      location: "Jawa Barat",
      lat: 95,
      lon: 107,
    });
    expect(badLat.status).toBe(400);

    const mountains = data(await call("GET", "/mountains", user.token))
      .mountains as { id: string }[];
    expect(mountains.length).toBeGreaterThan(0);
    const first = mountains[0];
    const noGathering = await call(
      "POST",
      `/mountains/${first.id}/route-proposals`,
      user.token,
      {
        name: "Jalur Tanpa Kumpul",
        checkpoints: [
          { name: "Pos Satu", lat: -6.9, lon: 107.6, isGathering: false },
          { name: "Puncak", lat: -6.91, lon: 107.61, isGathering: false },
        ],
      },
    );
    expect(noGathering.status).toBe(400);

    const missingPair = await call(
      "POST",
      `/mountains/${first.id}/route-proposals`,
      user.token,
      {
        name: "Jalur Tanpa Koordinat",
        checkpoints: [{ name: "Pos Satu", isGathering: true }],
      },
    );
    expect(missingPair.status).toBe(400);
  });

  test("pending tidak tampil di katalog; approve jadi katalog USER dan selamat dari seed ulang", async () => {
    const user = await register("propflow");
    const admin = await adminLogin();

    const created = await call("POST", "/mountains/proposals", user.token, {
      name: `Gunung Usulan ${run}`,
      location: "Jawa Barat",
      lat: -6.85,
      lon: 107.55,
      elevationM: 2200,
    });
    expect(created.status).toBe(201);
    const proposal = data(created).proposal as Json;
    expect(proposal.status).toBe("PENDING");

    // Katalog publik belum memuat usulan pending.
    const before = data(await call("GET", "/mountains", user.token))
      .mountains as { name: string }[];
    expect(before.some((m) => m.name === `Gunung Usulan ${run}`)).toBe(false);

    // Admin melihat antrean + menyetujui.
    const queue = data(await call("GET", "/mountains/proposals", admin))
      .mountains as Json[];
    expect(queue.some((p) => p.id === proposal.id)).toBe(true);
    const approved = await call(
      "POST",
      `/mountains/proposals/${proposal.id}/approve`,
      admin,
    );
    expect(approved.status).toBe(200);
    const mountain = data(approved).approved as Json;
    expect(mountain.source).toBe("USER");

    // Katalog publik sekarang memuat gunung yang disetujui.
    const after = data(await call("GET", "/mountains", user.token))
      .mountains as { id: string; name: string }[];
    const live = after.find((m) => m.id === mountain.id);
    expect(live?.name).toBe(`Gunung Usulan ${run}`);

    // Jalur buatan user untuk gunung itu: approve -> RoutePost pertama
    // bertanda titik kumpul awal.
    const routeCreated = await call(
      "POST",
      `/mountains/${mountain.id}/route-proposals`,
      user.token,
      {
        name: "Jalur Kaki Gunung",
        checkpoints: [
          { name: "Basecamp Warga", lat: -6.85, lon: 107.55, isGathering: true },
          { name: "Pos Tengah", lat: -6.86, lon: 107.56, isGathering: false },
          { name: "Puncak", lat: -6.87, lon: 107.57, isGathering: false },
        ],
      },
    );
    expect(routeCreated.status).toBe(201);
    const routeProposal = data(routeCreated).proposal as Json;
    const routeApproved = await call(
      "POST",
      `/mountains/proposals/${routeProposal.id}/approve?kind=route`,
      admin,
    );
    expect(routeApproved.status).toBe(200);
    const route = data(routeApproved).approved as Json;
    expect(route.source).toBe("USER");
    const checkpoints = route.checkpoints as Json[];
    expect(checkpoints[0].isGathering).toBe(true);
    expect(checkpoints[0].name).toBe("Basecamp Warga");

    // SEED ULANG: katalog MDPL diganti total — entri USER harus tetap ada.
    const { seedMountains } = await import("../seed-mountains.js");
    await testDb.replaceMountainCatalog([]);
    await seedMountains(testDb);
    const afterSeed = data(await call("GET", "/mountains", user.token))
      .mountains as { id: string; name: string }[];
    expect(afterSeed.some((m) => m.id === mountain.id)).toBe(true);
    const detail = data(
      await call("GET", `/mountains/${mountain.id}`, user.token),
    ).mountain as Json;
    const detailRoutes = detail.routes as Json[];
    expect(detailRoutes.some((rt) => rt.id === route.id)).toBe(true);

    // Approve kedua kali ditolak (sudah bukan PENDING).
    const again = await call(
      "POST",
      `/mountains/proposals/${proposal.id}/approve`,
      admin,
    );
    expect(again.status).toBe(404);
  });

  test("reject menandai usulan + user melihat statusnya", async () => {
    const user = await register("proprej");
    const admin = await adminLogin();
    const created = await call("POST", "/mountains/proposals", user.token, {
      name: `Gunung Ditolak ${run}`,
      location: "Jawa Tengah",
      lat: -7.2,
      lon: 110.1,
    });
    const proposal = data(created).proposal as Json;
    const rejected = await call(
      "POST",
      `/mountains/proposals/${proposal.id}/reject`,
      admin,
      { reason: "Duplikat katalog" },
    );
    expect(rejected.status).toBe(200);
    expect((data(rejected).proposal as Json).status).toBe("REJECTED");

    const mine = data(await call("GET", "/mountains/proposals/mine", user.token));
    const mineMountains = mine.mountains as Json[];
    const found = mineMountains.find((p) => p.id === proposal.id);
    expect(found?.status).toBe("REJECTED");
    expect(found?.rejectReason).toBe("Duplikat katalog");

    // Bukan admin tidak boleh mengakses antrean.
    const forbidden = await call("GET", "/mountains/proposals", user.token);
    expect(forbidden.status).toBe(403);
  });
});
