// AI-Q — Q&A member trip (TDD). Kontrak yang dikunci tes ini:
// 1. Jawaban memakai fakta trip yang benar (meeting point dari DB,
//    lewat stub AI yang menggemakan konteks — stub HANYA di tes).
// 2. Pertanyaan di luar data trip dijawab "tidak ada di data trip"
//    (notFound=true, answer=null), BUKAN karangan — dan klien AI
//    tidak pernah dipanggil untuk kasus itu.
// 3. Bukan member trip -> 403 NOT_TRIP_MEMBER (POST maupun GET).
// 4. Pertanyaan kosong / >1000 karakter -> 400 INVALID_PAYLOAD.
// 5. AI membalas sentinel "tidak ada di data" -> notFound=true.
// 6. Riwayat tersimpan dan hanya bisa dibaca member trip itu.
//
// Dijalankan terhadap app Express asli + Postgres segar (DB
// gbtest_aiq, port 4197 — tidak bentrok dengan suite api.test 4190
// maupun agen lain). Stub AI lewat mock.module pola otp-delivery.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4197;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;

// Stub AI (HANYA tes): menggemakan konteks faktual yang dikirim
// server, jadi tes membuktikan server mengirim fakta trip yang benar
// — bukan membuktikan model asli. stubMode bisa diubah per tes.
let stubMode: "echo" | "not-found" = "echo";
let metaChatCalls = 0;
mock.module("../meta-chat.js", () => ({
  metaChat: async (_system: string, user: string) => {
    metaChatCalls += 1;
    if (stubMode === "not-found") {
      return { content: "__QA_NOT_FOUND__", model: "muse-spark-open" };
    }
    return { content: `Dari data trip: ${user}`, model: "muse-spark-open" };
  },
}));

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-aiq-${run}@t.local`;
  process.env.ADMIN_PASSWORD = `AiQ-${run}-pw`;
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  const { hashPassword, signToken } = await import("../auth.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  await new Promise<void>((resolve) => http.listen(PORT, resolve));
  // Simpan helper auth ke global tes (dibuat setelah Db siap).
  (globalThis as Record<string, unknown>).__aiqMakeUser = async (
    name: string,
  ) => {
    const user = await testDb.createUser({
      email: `${name}-${run}@t.local`,
      name: `User ${name}`,
      slug: `${name}-${run}`,
      passwordHash: await hashPassword("pw-tes-aiq"),
      phone: null,
      isAdmin: false,
      role: "user",
      isVerified: true,
    });
    return { id: user.id, token: signToken(user) };
  };
});

afterAll(() => {
  http?.close();
});

type Json = Record<string, unknown>;
type MadeUser = { id: string; token: string };

async function makeUser(name: string): Promise<MadeUser> {
  const fn = (globalThis as Record<string, unknown>).__aiqMakeUser as (
    n: string,
  ) => Promise<MadeUser>;
  return fn(name);
}

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

const MEETING_POINT = `Basecamp AIQ-${run}`;

async function makeTrip(leader: MadeUser): Promise<string> {
  const trip = await testDb.createTrip({
    name: `Trip AIQ ${run}`,
    type: "HIKING",
    date: "2026-12-20",
    meetingPoint: MEETING_POINT,
    meetingLat: null,
    meetingLon: null,
    quota: 10,
    durationDays: null,
    isOpenTrip: false,
    price: null,
    leaderId: leader.id,
  });
  return trip.id;
}

describe("AI-Q", () => {
  test("member bertanya soal titik kumpul -> jawaban memakai fakta trip + sumber + atribusi", async () => {
    stubMode = "echo";
    const leader = await makeUser("aiq-lead1");
    const member = await makeUser("aiq-mem1");
    const tripId = await makeTrip(leader);
    await testDb.upsertMember(tripId, member.id, "MEMBER");
    const r = await call("POST", `/trip-groups/${tripId}/qa`, member.token, {
      question: "Di mana titik kumpul trip ini?",
    });
    expect(r.status).toBe(201);
    const qa = data(r).qa as Json;
    expect(qa.question).toBe("Di mana titik kumpul trip ini?");
    // Fakta trip yang benar: meeting point dari DB harus ada di jawaban.
    expect(qa.answer as string).toContain(MEETING_POINT);
    expect(qa.notFound).toBe(false);
    expect(qa.sources as string[]).toContain("trip.meetingPoint");
    // Atribusi Muse Spark Open dipertahankan (pola ai-summary).
    expect(qa.model).toBe("muse-spark-open");

    const hist = await call("GET", `/trip-groups/${tripId}/qa`, member.token);
    expect(hist.status).toBe(200);
    const rows = (data(hist).qa as Json[]).map((x) => x.id);
    expect(rows).toContain(qa.id);
  });

  test("pertanyaan di luar data trip -> tidak ada di data trip, AI tidak dipanggil", async () => {
    stubMode = "echo";
    const leader = await makeUser("aiq-lead2");
    const member = await makeUser("aiq-mem2");
    const tripId = await makeTrip(leader);
    await testDb.upsertMember(tripId, member.id, "MEMBER");
    const before = metaChatCalls;
    const r = await call("POST", `/trip-groups/${tripId}/qa`, member.token, {
      question: "Berapa harga tiket masuk gunung ini?",
    });
    expect(r.status).toBe(201);
    const qa = data(r).qa as Json;
    expect(qa.notFound).toBe(true);
    expect(qa.answer).toBeNull();
    expect(qa.sources as string[]).toEqual([]);
    expect(qa.model).toBeNull();
    // Guardrail keras: tidak ada panggilan AI sama sekali.
    expect(metaChatCalls).toBe(before);
    // Riwayat mencatat penanda tidak-ditemukan (bukan karangan).
    const hist = await call("GET", `/trip-groups/${tripId}/qa`, member.token);
    const row = (data(hist).qa as Json[]).find((x) => x.id === qa.id);
    expect(row?.notFound).toBe(true);
  });

  test("AI membalas sentinel tidak-ditemukan -> notFound, bukan teks sentinel", async () => {
    stubMode = "not-found";
    try {
      const leader = await makeUser("aiq-lead3");
      const member = await makeUser("aiq-mem3");
      const tripId = await makeTrip(leader);
      await testDb.upsertMember(tripId, member.id, "MEMBER");
      const r = await call("POST", `/trip-groups/${tripId}/qa`, member.token, {
        question: "Siapa leader trip ini?",
      });
      expect(r.status).toBe(201);
      const qa = data(r).qa as Json;
      expect(qa.notFound).toBe(true);
      expect(qa.answer).toBeNull();
      expect(JSON.stringify(qa)).not.toContain("__QA_NOT_FOUND__");
    } finally {
      stubMode = "echo";
    }
  });

  test("bukan member -> 403 NOT_TRIP_MEMBER untuk POST dan GET", async () => {
    const leader = await makeUser("aiq-lead4");
    const outsider = await makeUser("aiq-out4");
    const tripId = await makeTrip(leader);
    const post = await call("POST", `/trip-groups/${tripId}/qa`, outsider.token, {
      question: "Di mana titik kumpul trip ini?",
    });
    expect(post.status).toBe(403);
    expect(errCode(post)).toBe("NOT_TRIP_MEMBER");
    const get = await call("GET", `/trip-groups/${tripId}/qa`, outsider.token);
    expect(get.status).toBe(403);
    expect(errCode(get)).toBe("NOT_TRIP_MEMBER");
  });

  test("pertanyaan kosong / terlalu panjang -> 400 INVALID_PAYLOAD", async () => {
    const leader = await makeUser("aiq-lead5");
    const tripId = await makeTrip(leader);
    const empty = await call("POST", `/trip-groups/${tripId}/qa`, leader.token, {
      question: "   ",
    });
    expect(empty.status).toBe(400);
    expect(errCode(empty)).toBe("INVALID_PAYLOAD");
    const long = await call("POST", `/trip-groups/${tripId}/qa`, leader.token, {
      question: "x".repeat(1001),
    });
    expect(long.status).toBe(400);
    expect(errCode(long)).toBe("INVALID_PAYLOAD");
  });

  test("AI tanpa konfigurasi -> 503 AI_NOT_CONFIGURED (proses anak, modul segar)", async () => {
    // mock.module di file ini menggantikan meta-chat untuk SEMUA file
    // dalam satu run bun test, jadi jalur asli diuji lewat proses anak
    // dengan env META_MODEL_API_* yang dihapus total.
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && k !== "META_MODEL_API_KEY" && k !== "META_MODEL_API_BASE") {
        env[k] = v;
      }
    }
    const proc = Bun.spawnSync(
      ["/opt/hatch-image/bin/bun", "src/__tests__/ai-qa-meta-probe.ts"],
      { cwd: `${import.meta.dir}/../..`, env, stdout: "pipe", stderr: "pipe" },
    );
    const out = proc.stdout.toString().trim();
    expect(out).not.toBe("");
    const parsed = JSON.parse(out) as { status: number; code: string };
    expect(parsed.status).toBe(503);
    expect(parsed.code).toBe("AI_NOT_CONFIGURED");
  });

  test("tanpa token -> 401", async () => {
    const leader = await makeUser("aiq-lead6");
    const tripId = await makeTrip(leader);
    const r = await call("POST", `/trip-groups/${tripId}/qa`, undefined, {
      question: "Di mana titik kumpul trip ini?",
    });
    expect(r.status).toBe(401);
  });

  test("modul aiQ mati = 403 AI_MODULE_DISABLED, lalu nyala lagi", async () => {
    const leader = await makeUser("aiq-leadgate");
    const tripId = await makeTrip(leader);
    await testDb.updatePlatformSettings({ aiQ: false });
    const off = await call("POST", `/trip-groups/${tripId}/qa`, leader.token, {
      question: "Di mana titik kumpul trip ini?",
    });
    expect(off.status).toBe(403);
    expect(errCode(off)).toBe("AI_MODULE_DISABLED");
    await testDb.updatePlatformSettings({ aiQ: true });
    const on = await call("POST", `/trip-groups/${tripId}/qa`, leader.token, {
      question: "Di mana titik kumpul trip ini?",
    });
    expect(on.status).toBe(201);
  });
});

// Link peta di jawaban lokasi (QA 2 Nov 2026): link dibuat server dari
// data trip (BUKAN dari model — koordinat tidak pernah masuk konteks
// AI), disimpan bersama jawaban, dan ikut terbaca di riwayat. notFound
// dan jawaban non-lokasi tidak membawa link.
describe("AI-Q links", () => {
  async function makeTripWithCoords(leader: MadeUser): Promise<string> {
    const trip = await testDb.createTrip({
      name: `Trip AIQ Link ${run}`,
      type: "TOURING",
      date: "2026-12-20",
      meetingPoint: `Basecamp Link-${run}`,
      meetingLat: -6.33492,
      meetingLon: 106.78251,
      destination: `Warjok Link-${run}`,
      destinationLat: -6.2,
      destinationLon: 106.8,
      quota: 10,
      durationDays: null,
      isOpenTrip: false,
      price: null,
      leaderId: leader.id,
    });
    return trip.id;
  }

  function linksOf(qa: Json): { label: string; url: string }[] {
    return (qa.links as { label: string; url: string }[]) ?? [];
  }

  test("tanya titik kumpul -> link titik kumpul, koordinat tidak bocor ke AI", async () => {
    stubMode = "echo";
    const leader = await makeUser("aiq-link1");
    const member = await makeUser("aiq-linkmem1");
    const tripId = await makeTripWithCoords(leader);
    await testDb.upsertMember(tripId, member.id, "MEMBER");
    const r = await call("POST", `/trip-groups/${tripId}/qa`, member.token, {
      question: "Di mana titik kumpul trip ini?",
    });
    expect(r.status).toBe(201);
    const qa = data(r).qa as Json;
    expect(qa.notFound).toBe(false);
    const links = linksOf(qa);
    expect(links.length).toBe(1);
    expect(links[0].label).toContain("Titik kumpul");
    expect(links[0].url).toBe("https://maps.google.com/?q=-6.33492,106.78251");
    // Guardrail: stub menggemakan prompt AI — koordinat tidak boleh
    // muncul di sana, artinya model tidak pernah menerima koordinat.
    expect(qa.answer as string).not.toContain("106.78251");
    expect(qa.answer as string).not.toContain("-6.33492");
    // Riwayat membawa link yang sama.
    const hist = await call("GET", `/trip-groups/${tripId}/qa`, member.token);
    const row = (data(hist).qa as Json[]).find((x) => x.id === qa.id);
    expect(linksOf(row!)).toEqual(links);
  });

  test("tanya tujuan -> link tujuan trip", async () => {
    stubMode = "echo";
    const leader = await makeUser("aiq-link2");
    const member = await makeUser("aiq-linkmem2");
    const tripId = await makeTripWithCoords(leader);
    await testDb.upsertMember(tripId, member.id, "MEMBER");
    const r = await call("POST", `/trip-groups/${tripId}/qa`, member.token, {
      question: "Apa tujuan trip ini?",
    });
    expect(r.status).toBe(201);
    const qa = data(r).qa as Json;
    const links = linksOf(qa);
    expect(links.length).toBe(1);
    expect(links[0].url).toBe("https://maps.google.com/?q=-6.2,106.8");
  });

  test("tanya checkpoint -> satu link per checkpoint", async () => {
    stubMode = "echo";
    const leader = await makeUser("aiq-link3");
    const member = await makeUser("aiq-linkmem3");
    const tripId = await makeTripWithCoords(leader);
    await testDb.upsertMember(tripId, member.id, "MEMBER");
    await testDb.createCheckpoint({
      tripId,
      name: "Pos A",
      lat: -6.3,
      lon: 106.7,
    });
    await testDb.createCheckpoint({
      tripId,
      name: "Pos B",
      lat: -6.25,
      lon: 106.75,
    });
    const r = await call("POST", `/trip-groups/${tripId}/qa`, member.token, {
      question: "Checkpoint apa saja di trip ini?",
    });
    expect(r.status).toBe(201);
    const qa = data(r).qa as Json;
    const links = linksOf(qa);
    expect(links.map((l) => l.label).sort()).toEqual(["Pos A", "Pos B"]);
    expect(links.map((l) => l.url).sort()).toEqual([
      "https://maps.google.com/?q=-6.25,106.75",
      "https://maps.google.com/?q=-6.3,106.7",
    ]);
  });

  test("jawaban non-lokasi dan notFound -> tanpa link", async () => {
    stubMode = "echo";
    const leader = await makeUser("aiq-link4");
    const member = await makeUser("aiq-linkmem4");
    const tripId = await makeTripWithCoords(leader);
    await testDb.upsertMember(tripId, member.id, "MEMBER");
    const quota = await call("POST", `/trip-groups/${tripId}/qa`, member.token, {
      question: "Berapa kuota trip ini?",
    });
    expect((quota.status)).toBe(201);
    expect(linksOf(data(quota).qa as Json)).toEqual([]);
    const nf = await call("POST", `/trip-groups/${tripId}/qa`, member.token, {
      question: "Berapa harga tiket masuk gunung ini?",
    });
    expect(nf.status).toBe(201);
    const qaNf = data(nf).qa as Json;
    expect(qaNf.notFound).toBe(true);
    expect(linksOf(qaNf)).toEqual([]);
  });
});

// AI-Q konteks jalur (Scope B): trip ber-rute menjawab "pos
// selanjutnya?" dari posisi leader terakhir yang tersimpan — jarak dan
// waktu dihitung server, koordinat tidak pernah sampai ke AI (stub
// menggemakan prompt AI, jadi kebocoran koordinat akan terlihat di
// jawaban). Trip tanpa rute tetap tanpa fakta rute.
describe("AI-Q route", () => {
  let seq = 0;

  async function makeRoutedTrip(leader: MadeUser, leaderPos: { lat: number; lon: number } | null): Promise<string> {
    const n = seq++;
    const mountainId = `mtn-aiqr-${run}-${n}`;
    const routeId = `rte-aiqr-${run}-${n}`;
    await testDb.prisma.mountain.create({
      data: { id: mountainId, name: `Gunung AIQR ${n}`, elevationM: 2958, location: "Jawa Barat", difficultyKey: "MEDIUM" },
    });
    await testDb.prisma.mountainRoute.create({
      data: { id: routeId, mountainId, name: `Jalur AIQR ${n}`, meetingPoint: "Basecamp", distanceKm: 8.5, gainM: 1200, estHours: 6 },
    });
    const posts = [
      { order: 1, name: "Basecamp", lat: -6.7, lon: 106.9 },
      { order: 2, name: "Pos 1", lat: -6.71, lon: 106.91 },
      { order: 3, name: "Puncak", lat: -6.72, lon: 106.92 },
    ];
    for (const p of posts) {
      await testDb.prisma.routePost.create({ data: { routeId, ...p } });
    }
    const trip = await testDb.createTrip({
      name: `Trip AIQ Rute ${run}-${n}`,
      type: "HIKING",
      date: "2026-12-20",
      meetingPoint: `Basecamp AIQR-${run}-${n}`,
      meetingLat: null,
      meetingLon: null,
      quota: 10,
      durationDays: null,
      isOpenTrip: false,
      price: null,
      leaderId: leader.id,
      mountainId,
      routeId,
    });
    if (leaderPos) {
      await testDb.addLocation({
        tripId: trip.id,
        userId: leader.id,
        lat: leaderPos.lat,
        lon: leaderPos.lon,
        ts: new Date().toISOString(),
      });
    }
    return trip.id;
  }

  test("member tanya pos selanjutnya -> jawaban pakai jarak/waktu hitungan server + sumber rute", async () => {
    stubMode = "echo";
    const leader = await makeUser("aiq-rute-lead1");
    const member = await makeUser("aiq-rute-mem1");
    const tripId = await makeRoutedTrip(leader, { lat: -6.7, lon: 106.9 });
    await testDb.upsertMember(tripId, member.id, "MEMBER");
    const r = await call("POST", `/trip-groups/${tripId}/qa`, member.token, {
      question: "Pos selanjutnya apa dan berapa jauh?",
    });
    expect(r.status).toBe(201);
    const qa = data(r).qa as Json;
    expect(qa.notFound).toBe(false);
    expect(qa.sources as string[]).toContain("trip.route");
    expect(qa.sources as string[]).toContain("trip.nextPost");
    // Fakta server: nama pos + jarak meter + pace 3 km/jam.
    expect(qa.answer as string).toContain("Pos 1");
    expect(qa.answer as string).toMatch(/\d+ meter/);
    expect(qa.answer as string).toContain("3 km/jam");
    // Guardrail: koordinat tidak bocor ke prompt AI.
    expect(qa.answer as string).not.toContain("106.9");
    expect(qa.answer as string).not.toContain("-6.7");
  });

  test("leader tanpa posisi tersimpan -> jawaban jujur posisi belum tersedia", async () => {
    stubMode = "echo";
    const leader = await makeUser("aiq-rute-lead2");
    const member = await makeUser("aiq-rute-mem2");
    const tripId = await makeRoutedTrip(leader, null);
    await testDb.upsertMember(tripId, member.id, "MEMBER");
    const r = await call("POST", `/trip-groups/${tripId}/qa`, member.token, {
      question: "Pos selanjutnya apa?",
    });
    expect(r.status).toBe(201);
    const qa = data(r).qa as Json;
    expect(qa.notFound).toBe(false);
    expect(qa.answer as string).toMatch(/posisi leader belum tersedia/i);
    expect(qa.answer as string).not.toMatch(/\d+ meter/);
  });
});
