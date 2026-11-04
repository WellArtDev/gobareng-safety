// AI-P fail-soft TANPA stub vision: env model dikosongkan sebelum app
// diimpor, sehingga jalur produksi "belum dikonfigurasi" benar-benar
// teruji — foto tetap tersimpan, SOS tetap jalan, deskripsi AI bernilai
// null dan status UNAVAILABLE (klien menampilkan "belum tersedia").
// File ini HARUS dijalankan terpisah dari sos-photos.test.ts (yang
// memakai mock vision) supaya mock tidak bocor antar file.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4296;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-aipnc-${run}@t.local`;
  process.env.ADMIN_PASSWORD = `aipnc-test-${run}`;
  process.env.UPLOADS_DIR = `/tmp/gbtest_aip_uploads_nc_${run}`;
  // Jalur produksi tanpa konfigurasi vision.
  process.env.META_MODEL_API_KEY = "";
  process.env.META_MODEL_API_BASE = "";
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  const testDb = new Db();
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

async function register(name: string): Promise<{ token: string; id: string }> {
  const email = `${name}-${run}@t.local`;
  const req = await call("POST", "/auth/otp/request", undefined, { identifier: email });
  expect(req.status).toBe(200);
  const code = sentCodes.get(email);
  expect(code).toMatch(/^\d{6}$/);
  await call("POST", "/auth/otp/verify", undefined, { identifier: email, code });
  const second = await call("POST", "/auth/otp/verify", undefined, {
    identifier: email,
    code,
    name: `User ${name}`,
  });
  expect(second.status).toBe(200);
  const d = data(second);
  return { token: d.token as string, id: (d.user as Json).id as string };
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

describe("AI-P fail-soft: vision belum dikonfigurasi", () => {
  test("foto tersimpan, deskripsi AI null + UNAVAILABLE, tanpa karangan", async () => {
    const sender = await register("aipnc");
    await call("PATCH", "/auth/me", sender.token, { phone: "0811111111" });
    const trip = await call("POST", "/trip-groups", sender.token, {
      name: "Trip AI-P NC",
      type: "HIKING",
      date: "2026-11-01",
      meetingPoint: "X",
    });
    expect(trip.status).toBe(201);
    const tripId = (data(trip).trip as Json).id as string;
    const sos = await call("POST", `/trip-groups/${tripId}/sos`, sender.token, {
      reason: "CEDERA",
      lat: -7.2,
      lon: 109.9,
    });
    expect(sos.status).toBe(201);
    const sosId = (data(sos).sos as Json).id as string;
    const form = new FormData();
    form.append("kind", "TRIP");
    form.append("sosId", sosId);
    form.append("photo", new Blob([PNG_1X1], { type: "image/png" }), "sos.png");
    const res = await fetch(`${BASE}/sos-photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sender.token}` },
      body: form,
    });
    expect(res.status).toBe(201);
    const photo = ((await res.json()) as { data: { photo: Json } }).data.photo;
    expect((photo.photoUrl as string)).toContain("/uploads/sos/");
    expect(photo.aiStatus).toBe("UNAVAILABLE");
    expect(photo.aiDescription).toBeNull();
    expect(photo.model).toBeNull();
  });
});
