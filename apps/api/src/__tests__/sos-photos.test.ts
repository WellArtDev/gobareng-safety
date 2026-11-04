// AI-P — SOS foto (TDD): lampiran foto SOS trip + SOS umum, analisis
// vision AI, dan detail SOS yang diperkaya foto + deskripsi AI.
//
// Aturan yang dikunci di sini:
// - Foto tersimpan mengikuti pola upload yang ada (images only, 5 MB).
// - Bila vision tersedia: aiStatus AVAILABLE + deskripsi + model.
// - Bila vision TIDAK terkonfigurasi: SOS tetap jalan, foto tetap
//   tersimpan, aiStatus UNAVAILABLE, aiDescription null — TIDAK BOLEH
//   ada deskripsi karangan (lihat sos-photos-unconfigured.test.ts
//   untuk jalur tanpa stub).
// - Lampiran hanya oleh pengirim SOS (sender-only); baca mengikuti
//   guard detail SOS yang sudah ada (member trip / penerima alert).
// - Stub vision HANYA di tes ini (mock.module di bawah); kode produksi
//   tidak pernah mengarang deskripsi.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4295;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-aip-${run}@t.local`;
  process.env.ADMIN_PASSWORD = `aip-test-${run}`;
  process.env.UPLOADS_DIR = `/tmp/gbtest_aip_uploads_${run}`;
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
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

function data(r: { status: number; json: Json }): Json {
  return r.json.data as Json;
}
function errCode(r: { json: Json }): string {
  return (r.json.error as Json)?.code as string;
}

const sentCodes = new Map<string, string>();
mock.module("../otp-delivery.js", () => ({
  sendOtpCode: async (
    _channel: string,
    destination: string,
    code: string,
  ): Promise<{ ok: boolean }> => {
    sentCodes.set(destination, code);
    return { ok: true };
  },
}));

// Stub klien AI vision — HANYA di tes. Produksi memanggil model Meta
// yang sama via env (lihat ai-vision.ts) dan tidak pernah memakai teks
// ini.
mock.module("../ai-vision.js", () => ({
  describeSosPhoto: async (): Promise<{
    description: string;
    model: string;
  }> => ({
    description: "STUB VISION: terlihat kondisi darurat di foto.",
    model: "muse-spark-open",
  }),
}));

let registerSeq = 0;

async function register(name: string): Promise<{ token: string; id: string }> {
  const email = `${name.toLowerCase()}-${run}-${registerSeq++}@t.local`;
  const req = await call("POST", "/auth/otp/request", undefined, { identifier: email });
  expect(req.status).toBe(200);
  const code = sentCodes.get(email);
  expect(code).toMatch(/^\d{6}$/);
  const first = await call("POST", "/auth/otp/verify", undefined, { identifier: email, code });
  expect(first.status).toBe(200);
  const second = await call("POST", "/auth/otp/verify", undefined, {
    identifier: email,
    code,
    name: `User ${name}`,
  });
  expect(second.status).toBe(200);
  const d = data(second);
  return { token: d.token as string, id: (d.user as Json).id as string };
}

let cachedAdmin: { token: string; id: string } | undefined;
async function adminLogin(): Promise<{ token: string; id: string }> {
  if (cachedAdmin) return cachedAdmin;
  const email = process.env.ADMIN_EMAIL as string;
  const req = await call("POST", "/auth/otp/request", undefined, { identifier: email });
  expect(req.status).toBe(200);
  const code = sentCodes.get(email);
  const ver = await call("POST", "/auth/otp/verify", undefined, { identifier: email, code });
  expect(ver.status).toBe(200);
  let d = data(ver);
  // DB tes dipakai ulang antar run: seed admin dilewati bila admin
  // mana pun sudah ada, sehingga email admin run ini belum punya
  // akun dan verify pertama mengembalikan needsName — lengkapi nama
  // seperti alur register biasa.
  if ((d as Json).needsName) {
    const second = await call("POST", "/auth/otp/verify", undefined, {
      identifier: email,
      code,
      name: "Admin AI-P",
    });
    expect(second.status).toBe(200);
    d = data(second);
  }
  cachedAdmin = { token: d.token as string, id: (d.user as Json).id as string };
  // Pastikan pemanggil ini benar-benar admin apa pun jalur di atas
  // (seed admin dilewati di DB pakai-ulang; fallback needsName
  // membuat user biasa). Promosi langsung via Prisma — hanya di tes.
  await testDb.prisma.user.update({
    where: { id: cachedAdmin.id },
    data: { isAdmin: true, role: "admin", isVerified: true },
  });
  return cachedAdmin;
}

async function verifyUser(adminToken: string, userId: string): Promise<void> {
  const r = await call("PATCH", `/admin/members/${userId}/verify`, adminToken);
  expect(r.status).toBe(200);
}

async function makeTrip(token: string): Promise<string> {
  await call("PATCH", "/auth/me", token, { phone: "0811111111" });
  const r = await call("POST", "/trip-groups", token, {
    name: "Trip AI-P",
    type: "HIKING",
    // Tanggal hari ini (bukan tanggal tetap): guard TRIP_EXPIRED
    // menolak start trip bertanggal lewat.
    date: new Date().toISOString().slice(0, 10),
    meetingPoint: "X",
  });
  expect(r.status).toBe(201);
  return (data(r).trip as Json).id as string;
}

async function makeTripSos(token: string, tripId: string): Promise<string> {
  const r = await call("POST", `/trip-groups/${tripId}/sos`, token, {
    reason: "CEDERA",
    lat: -7.2,
    lon: 109.9,
  });
  expect(r.status).toBe(201);
  return (data(r).sos as Json).id as string;
}

async function makeGeneralSos(token: string): Promise<string> {
  const r = await call("POST", "/sos-general", token, {
    reason: "KECELAKAAN_LALU_LINTAS",
    lat: -7.2,
    lon: 109.91,
  });
  expect(r.status).toBe(201);
  return (data(r).sos as Json).id as string;
}

// PNG 1x1 transparan — cukup untuk lolos filter images-only multer.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

async function attachPhoto(
  token: string | undefined,
  kind: "TRIP" | "GENERAL",
  sosId: string,
  file?: { bytes: Buffer; name: string; type: string },
): Promise<{ status: number; json: Json }> {
  const form = new FormData();
  form.append("kind", kind);
  form.append("sosId", sosId);
  const f = file ?? { bytes: PNG_1X1, name: "sos.png", type: "image/png" };
  form.append("photo", new Blob([f.bytes], { type: f.type }), f.name);
  const res = await fetch(`${BASE}/sos-photos`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return { status: res.status, json: (await res.json()) as Json };
}

describe("AI-P: lampiran foto SOS", () => {
  test("modul aiP mati = 403 AI_MODULE_DISABLED, lalu nyala lagi", async () => {
    const u = await register("gate");
    await testDb.updatePlatformSettings({ aiP: false });
    const off = await call("GET", "/sos-photos/TRIP/tidak-ada", u.token);
    expect(off.status).toBe(403);
    expect(errCode(off)).toBe("AI_MODULE_DISABLED");
    await testDb.updatePlatformSettings({ aiP: true });
    const on = await call("GET", "/sos-photos/TRIP/tidak-ada", u.token);
    expect(on.status).toBe(404);
  });

  test("foto SOS trip: tersimpan + deskripsi vision stub + model", async () => {
    const sender = await register("aipTrip");
    const tripId = await makeTrip(sender.token);
    const sosId = await makeTripSos(sender.token, tripId);
    const r = await attachPhoto(sender.token, "TRIP", sosId);
    expect(r.status).toBe(201);
    const photo = data(r).photo as Json;
    expect(photo.sosId).toBe(sosId);
    expect(photo.kind).toBe("TRIP");
    expect(typeof photo.photoUrl).toBe("string");
    expect(photo.photoUrl as string).toContain("/uploads/sos/");
    expect(photo.aiStatus).toBe("AVAILABLE");
    expect(photo.aiDescription).toBe("STUB VISION: terlihat kondisi darurat di foto.");
    expect(photo.model).toBe("muse-spark-open");
    // Foto bisa diunduh lewat URL publik hasil upload.
    const got = await fetch(photo.photoUrl as string);
    expect(got.status).toBe(200);
  });

  test("detail SOS trip diperkaya foto + deskripsi AI", async () => {
    const sender = await register("aipTripDetail");
    const tripId = await makeTrip(sender.token);
    const sosId = await makeTripSos(sender.token, tripId);
    await attachPhoto(sender.token, "TRIP", sosId);
    const r = await call("GET", `/trip-groups/${tripId}/sos/${sosId}`, sender.token);
    expect(r.status).toBe(200);
    const photos = (data(r).sos as Json).photos as Json[];
    expect(Array.isArray(photos)).toBe(true);
    expect(photos.length).toBe(1);
    expect(photos[0].aiStatus).toBe("AVAILABLE");
    expect(photos[0].aiDescription).toBe(
      "STUB VISION: terlihat kondisi darurat di foto.",
    );
  });

  test("foto SOS umum: tersimpan + detail umum diperkaya", async () => {
    const admin = await adminLogin();
    const sender = await register("aipGeneral");
    await verifyUser(admin.token, sender.id);
    const sosId = await makeGeneralSos(sender.token);
    const r = await attachPhoto(sender.token, "GENERAL", sosId);
    expect(r.status).toBe(201);
    expect((data(r).photo as Json).aiStatus).toBe("AVAILABLE");
    const detail = await call("GET", `/sos-general/${sosId}`, sender.token);
    expect(detail.status).toBe(200);
    const photos = (data(detail).sos as Json).photos as Json[];
    expect(photos.length).toBe(1);
    expect(photos[0].photoUrl).toContain("/uploads/sos/");
  });

  test("daftar foto per SOS + analisis ulang", async () => {
    const sender = await register("aipList");
    const tripId = await makeTrip(sender.token);
    const sosId = await makeTripSos(sender.token, tripId);
    const created = await attachPhoto(sender.token, "TRIP", sosId);
    const photoId = (data(created).photo as Json).id as string;
    const list = await call("GET", `/sos-photos/TRIP/${sosId}`, sender.token);
    expect(list.status).toBe(200);
    expect(((data(list).photos as Json[]).length)).toBe(1);
    const again = await call("POST", `/sos-photos/${photoId}/analyze`, sender.token, {});
    expect(again.status).toBe(200);
    expect((data(again).photo as Json).aiStatus).toBe("AVAILABLE");
  });

  test("bukan pengirim tidak boleh melampirkan foto", async () => {
    const sender = await register("aipSender");
    const stranger = await register("aipStranger");
    const tripId = await makeTrip(sender.token);
    const sosId = await makeTripSos(sender.token, tripId);
    const r = await attachPhoto(stranger.token, "TRIP", sosId);
    expect(r.status).toBe(403);
    // Tanpa token = 401.
    const anon = await attachPhoto(undefined, "TRIP", sosId);
    expect(anon.status).toBe(401);
  });

  test("file bukan gambar ditolak, SOS tanpa foto tidak dibuat", async () => {
    const sender = await register("aipBadFile");
    const tripId = await makeTrip(sender.token);
    const sosId = await makeTripSos(sender.token, tripId);
    const r = await attachPhoto(sender.token, "TRIP", sosId, {
      bytes: Buffer.from("bukan gambar", "utf-8"),
      name: "catatan.txt",
      type: "text/plain",
    });
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("INVALID_IMAGE");
    const list = await call("GET", `/sos-photos/TRIP/${sosId}`, sender.token);
    expect((data(list).photos as Json[]).length).toBe(0);
  });

  test("SOS tidak ditemukan = 404, kind tidak valid = 400", async () => {
    const sender = await register("aipNotFound");
    const r = await attachPhoto(sender.token, "TRIP", "sos-tidak-ada");
    expect(r.status).toBe(404);
    expect(errCode(r)).toBe("SOS_NOT_FOUND");
    const bad = await attachPhoto(sender.token, "LAINNYA" as "TRIP", "x");
    expect(bad.status).toBe(400);
  });

  test("overview posko memuat foto SOS trip aktif", async () => {
    const admin = await adminLogin();
    const sender = await register("aipOverview");
    const tripId = await makeTrip(sender.token);
    const sosId = await makeTripSos(sender.token, tripId);
    await attachPhoto(sender.token, "TRIP", sosId);
    const started = await call("POST", `/trip-groups/${tripId}/start`, sender.token, {});
    expect(started.status).toBe(200);
    const overview = await call("GET", "/command-center/overview", admin.token);
    expect(overview.status).toBe(200);
    const trips = (data(overview).trips as Json[]);
    const row = trips.find((t) => (t.trip as Json).id === tripId);
    expect(row).toBeDefined();
    const sosRows = (row as Json).sos as Json[];
    const found = sosRows.find((s) => s.id === sosId);
    expect(found).toBeDefined();
    expect(((found as Json).photos as Json[]).length).toBe(1);
  });
});
