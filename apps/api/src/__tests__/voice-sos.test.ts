// AI-V — SOS suara (TDD RED): transkripsi via provider STT sungguhan
// (stub HTTP OpenAI-compatible di tes ini, BUKAN stub modul), lalu
// konfirmasi -> SOS yang persis sama jalurnya dengan SOS biasa
// (dispatch realtime + WA + guard yang sama dengan trips.ts /
// general-sos.ts). Provider STT dibaca lewat env LAZY (stt.ts) supaya
// tes "belum dikonfigurasi" bisa jalan dalam satu file.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4192;
const STT_PORT = 4193;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let sttStub: Server;
let testDb: Db;

const STT_TRANSCRIPT = "tolong saya tersesat di jalur pendakian";

beforeAll(async () => {
  // Suite ini TIDAK butuh admin (verifikasi lewat DB langsung), jadi
  // TIDAK men-set ADMIN_* — men-set-nya akan memenangkan race seed
  // admin dan merusak suite lain yang berbagi DB ini (login admin OTP
  // mereka jatuh ke user biasa + OTP_COOLDOWN 429).
  process.env.STT_PROVIDER = "openai-compatible";
  process.env.STT_API_KEY = "test-key";
  process.env.STT_API_BASE = `http://localhost:${STT_PORT}/v1`;
  process.env.STT_MODEL = "whisper-test";
  // Meta TIDAK dikonfigurasi di tes ini: klasifikasi harus jatuh ke
  // keyword fallback (model null), bukan hasil AI palsu.
  delete process.env.META_MODEL_API_KEY;
  delete process.env.META_MODEL_API_BASE;
  sttStub = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: STT_TRANSCRIPT }));
  });
  await new Promise<void>((resolve) => sttStub.listen(STT_PORT, resolve));
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
  sttStub?.close();
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

let registerSeq = 0;

async function register(name: string): Promise<{ token: string; id: string }> {
  const email = `${name}-${run}-${registerSeq++}@t.local`;
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

// Verifikasi langsung via DB (pola api.test.ts): suite ini tidak
// bergantung pada seed admin — bila suite lain sudah membuat admin
// duluan di DB yang sama, seed admin file ini dilewati dan login admin
// OTP hanya menghasilkan user biasa (PATCH /admin/... gagal). Tes ini
// tidak butuh admin sama sekali, jadi verifikasi tidak lewat API admin.
async function verifyUser(_adminToken: string, userId: string): Promise<void> {
  await testDb.prisma.user.update({
    where: { id: userId },
    data: { isVerified: true },
  });
}

const SOS_LAT = -7.2;
const SOS_LON = 109.91;
const NEAR = { lat: -7.195, lon: 109.915 };

const FAKE_AUDIO = Buffer.from("fake-audio-bytes-untuk-tes").toString("base64");

async function makeTrip(leaderToken: string): Promise<string> {
  await call("PATCH", "/auth/me", leaderToken, { phone: "0811111111" });
  const trip = await call("POST", "/trip-groups", leaderToken, {
    name: "Voice Trip",
    type: "HIKING",
    date: "2026-11-03",
    meetingPoint: "Basecamp",
  });
  expect(trip.status).toBe(201);
  return (data(trip).trip as Json).id as string;
}

describe("AI-V transcribe", () => {
  test("modul aiV mati = 403 AI_MODULE_DISABLED, lalu nyala lagi", async () => {
    const u = await register("gate");
    await testDb.updatePlatformSettings({ aiV: false });
    const off = await call("POST", "/voice-sos/transcribe", u.token, {
      audioBase64: FAKE_AUDIO,
      kind: "general",
    });
    expect(off.status).toBe(403);
    expect(errCode(off)).toBe("AI_MODULE_DISABLED");
    await testDb.updatePlatformSettings({ aiV: true });
    const on = await call("POST", "/voice-sos/transcribe", u.token, {
      audioBase64: FAKE_AUDIO,
      kind: "general",
    });
    expect(on.status).toBe(200);
  });

  test("tanpa token ditolak 401", async () => {
    const r = await call("POST", "/voice-sos/transcribe", undefined, {
      audioBase64: FAKE_AUDIO,
      kind: "trip",
      tripType: "HIKING",
    });
    expect(r.status).toBe(401);
  });

  test("STT belum dikonfigurasi -> 503 STT_NOT_CONFIGURED, bukan transkrip palsu", async () => {
    const saved = {
      provider: process.env.STT_PROVIDER,
      key: process.env.STT_API_KEY,
      base: process.env.STT_API_BASE,
    };
    delete process.env.STT_PROVIDER;
    delete process.env.STT_API_KEY;
    delete process.env.STT_API_BASE;
    try {
      const u = await register("voice-unconf");
      const r = await call("POST", "/voice-sos/transcribe", u.token, {
        audioBase64: FAKE_AUDIO,
        kind: "trip",
        tripType: "HIKING",
      });
      expect(r.status).toBe(503);
      expect(errCode(r)).toBe("STT_NOT_CONFIGURED");
    } finally {
      process.env.STT_PROVIDER = saved.provider;
      process.env.STT_API_KEY = saved.key;
      process.env.STT_API_BASE = saved.base;
    }
  });

  test("transkripsi trip HIKING: teks provider + alasan TERSESAT + model null (tanpa AI)", async () => {
    const u = await register("voice-trip");
    const r = await call("POST", "/voice-sos/transcribe", u.token, {
      audioBase64: FAKE_AUDIO,
      mimeType: "audio/m4a",
      kind: "trip",
      tripType: "HIKING",
    });
    expect(r.status).toBe(200);
    const d = data(r);
    expect(d.transcript).toBe(STT_TRANSCRIPT);
    expect(d.detectedReason).toBe("TERSESAT");
    expect(d.kind).toBe("trip");
    // Meta tidak dikonfigurasi -> tidak ada klaim model AI.
    expect(d.model).toBeNull();
  });

  test("transkripsi general: kata trip-only jatuh ke BUTUH_BANTUAN_SEGERA", async () => {
    const u = await register("voice-gen");
    const r = await call("POST", "/voice-sos/transcribe", u.token, {
      audioBase64: FAKE_AUDIO,
      kind: "general",
    });
    expect(r.status).toBe(200);
    expect(data(r).detectedReason).toBe("BUTUH_BANTUAN_SEGERA");
  });

  test("audio kosong ditolak 400", async () => {
    const u = await register("voice-empty");
    const r = await call("POST", "/voice-sos/transcribe", u.token, {
      audioBase64: "",
      kind: "general",
    });
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("STT_AUDIO_INVALID");
  });

  test("kind tidak dikenal ditolak 400", async () => {
    const u = await register("voice-badkind");
    const r = await call("POST", "/voice-sos/transcribe", u.token, {
      audioBase64: FAKE_AUDIO,
      kind: "telepati",
    });
    expect(r.status).toBe(400);
  });
});

describe("AI-V confirm", () => {
  test("confirm trip SOS: 201 + SOS trip aktif + konfirmasi kedua 409", async () => {
    const u = await register("voice-ctrip");
    const tripId = await makeTrip(u.token);
    const first = await call("POST", "/voice-sos/confirm", u.token, {
      reason: "TERSESAT",
      lat: SOS_LAT,
      lon: SOS_LON,
      tripId,
    });
    expect(first.status).toBe(201);
    const d = data(first);
    expect(d.kind).toBe("trip");
    const sos = d.sos as Json;
    expect(sos.status).toBe("ACTIVE");
    expect(sos.reason).toBe("TERSESAT");
    expect(sos.tripId).toBe(tripId);
    expect(Array.isArray(d.waRecipients)).toBe(true);
    // Persis seperti SOS biasa: satu SOS aktif per user per trip.
    const second = await call("POST", "/voice-sos/confirm", u.token, {
      reason: "TERSESAT",
      lat: SOS_LAT,
      lon: SOS_LON,
      tripId,
    });
    expect(second.status).toBe(409);
    expect(errCode(second)).toBe("SOS_ALREADY_ACTIVE");
  });

  test("confirm trip: alasan touring di trip HIKING ditolak 400", async () => {
    const u = await register("voice-cbad");
    const tripId = await makeTrip(u.token);
    const r = await call("POST", "/voice-sos/confirm", u.token, {
      reason: "MOTOR_RUSAK",
      lat: SOS_LAT,
      lon: SOS_LON,
      tripId,
    });
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("SOS_REASON_INVALID_FOR_TRIP_TYPE");
  });

  test("confirm trip: bukan member ditolak 403", async () => {
    const leader = await register("voice-clead");
    const tripId = await makeTrip(leader.token);
    const stranger = await register("voice-cstranger");
    const r = await call("POST", "/voice-sos/confirm", stranger.token, {
      reason: "TERSESAT",
      lat: SOS_LAT,
      lon: SOS_LON,
      tripId,
    });
    expect(r.status).toBe(403);
    expect(errCode(r)).toBe("NOT_TRIP_MEMBER");
  });

  test("confirm trip tidak ada ditolak 404", async () => {
    const u = await register("voice-c404");
    const r = await call("POST", "/voice-sos/confirm", u.token, {
      reason: "TERSESAT",
      lat: SOS_LAT,
      lon: SOS_LON,
      tripId: "trip-tidak-ada",
    });
    expect(r.status).toBe(404);
  });

  test("confirm general: 201 + penerima hanya Pengguna Sekitar terverifikasi + WA ke ber-HP", async () => {
    
    const sender = await register("voice-gsend");
    const near = await register("voice-gnear");
    await verifyUser("", sender.id);
    await verifyUser("", near.id);
    await call("PATCH", "/auth/me", near.token, { phone: "0822222222" });
    const tripId = await makeTrip(sender.token);
    await call("POST", `/trip-groups/${tripId}/join`, near.token);
    await call("POST", `/trip-groups/${tripId}/locations`, near.token, {
      ...NEAR,
      timestamp: new Date().toISOString(),
    });
    const r = await call("POST", "/voice-sos/confirm", sender.token, {
      reason: "KECELAKAAN_LALU_LINTAS",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(r.status).toBe(201);
    const d = data(r);
    expect(d.kind).toBe("general");
    const sos = d.sos as Json;
    expect(sos.status).toBe("ACTIVE");
    expect(sos.tripId).toBeNull();
    const recipients = (d.recipients as Json[]).map((x) => x.userId);
    expect(recipients).toContain(near.id);
    expect(recipients).not.toContain(sender.id);
    expect(d.waRecipients).toEqual(["0822222222"]);
    // Guard sama: SOS umum kedua saat masih aktif ditolak 409.
    const second = await call("POST", "/voice-sos/confirm", sender.token, {
      reason: "KEBAKARAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(second.status).toBe(409);
    expect(errCode(second)).toBe("GENERAL_SOS_ALREADY_ACTIVE");
  });

  test("confirm general: pengirim belum verifikasi ditolak 403", async () => {
    const u = await register("voice-gunver");
    const r = await call("POST", "/voice-sos/confirm", u.token, {
      reason: "KEBAKARAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(r.status).toBe(403);
    expect(errCode(r)).toBe("GENERAL_SOS_UNVERIFIED_SENDER");
  });

  test("confirm general: lokasi 0,0 ditolak 400", async () => {
    
    const u = await register("voice-gzero");
    await verifyUser("", u.id);
    const r = await call("POST", "/voice-sos/confirm", u.token, {
      reason: "KEBAKARAN",
      lat: 0,
      lon: 0,
    });
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("INVALID_LOCATION");
  });

  test("confirm tanpa token ditolak 401", async () => {
    const r = await call("POST", "/voice-sos/confirm", undefined, {
      reason: "KEBAKARAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(r.status).toBe(401);
  });
});
