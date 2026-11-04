// Isi Data Profil: field alamat baru di PATCH/GET /auth/me + aturan
// telepon/negara yang sudah ada. TDD — alur login OTP distub di level
// modul delivery seperti otp.test.ts / email-change.test.ts.
import { mock } from "bun:test";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4198;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

const sentCodes = new Map<string, string>();
mock.module("../otp-delivery.js", () => ({
  sendOtpCode: async (
    _channel: string,
    destination: string,
    code: string,
  ): Promise<{ ok: boolean; errorCode?: string }> => {
    sentCodes.set(destination, code);
    return { ok: true };
  },
}));

let http: Server;
let testDb: Db;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = "admin-test-password";
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

function data(r: { json: Json }): Json {
  return r.json.data as Json;
}

async function otpLogin(
  identifier: string,
  name: string,
): Promise<{ token: string; user: Json }> {
  const req = await call("POST", "/auth/otp/request", undefined, {
    identifier,
  });
  expect(req.status).toBe(200);
  const code = sentCodes.get(identifier);
  expect(code).toMatch(/^\d{6}$/);
  const first = await call("POST", "/auth/otp/verify", undefined, {
    identifier,
    code,
  });
  if (first.status === 200 && (data(first) as Json).needsName) {
    const second = await call("POST", "/auth/otp/verify", undefined, {
      identifier,
      code,
      name,
    });
    expect(second.status).toBe(200);
    return {
      token: (data(second) as Json).token as string,
      user: (data(second) as Json).user as Json,
    };
  }
  expect(first.status).toBe(200);
  return {
    token: (data(first) as Json).token as string,
    user: (data(first) as Json).user as Json,
  };
}

// Registrasi OTP dengan field opsional No HP + Negara (langkah
// needsName): alur yang sama dengan otpLogin, tapi verify kedua membawa
// phone + country — harus tersimpan pada User baru.
async function otpRegister(
  identifier: string,
  name: string,
  extra?: Record<string, string>,
): Promise<{ token: string; user: Json }> {
  const req = await call("POST", "/auth/otp/request", undefined, {
    identifier,
  });
  expect(req.status).toBe(200);
  const code = sentCodes.get(identifier);
  expect(code).toMatch(/^\d{6}$/);
  const first = await call("POST", "/auth/otp/verify", undefined, {
    identifier,
    code,
  });
  expect(first.status).toBe(200);
  expect((data(first) as Json).needsName).toBe(true);
  const second = await call("POST", "/auth/otp/verify", undefined, {
    identifier,
    code,
    name,
    ...extra,
  });
  expect(second.status).toBe(200);
  return {
    token: (data(second) as Json).token as string,
    user: (data(second) as Json).user as Json,
  };
}

describe("registrasi otp: telepon + negara opsional", () => {
  test("verify dengan phone+country menyimpan keduanya pada akun baru", async () => {
    const { token, user } = await otpRegister(
      `daftar-${run}@t.local`,
      "Daftar Baru",
      { phone: "0812-3456-7890", country: "id" },
    );
    expect(user.phone).toBe("081234567890");
    expect(user.country).toBe("ID");
    const me = await call("GET", "/auth/me", token);
    expect((data(me).user as Json).phone).toBe("081234567890");
    expect((data(me).user as Json).country).toBe("ID");
  });

  test("tanpa phone+country tetap lolos seperti dulu (null semua)", async () => {
    const { user } = await otpRegister(`polos-${run}@t.local`, "Polos Saja");
    expect(user.phone).toBeNull();
    expect(user.country).toBeNull();
  });

  test("phone tak valid dan country tak valid jadi null, daftar tetap lolos", async () => {
    const { user } = await otpRegister(`acak-${run}@t.local`, "Acak Data", {
      phone: "bukan-nomor",
      country: "ZZZ",
    });
    expect(user.phone).toBeNull();
    expect(user.country).toBeNull();
  });

  test("identifier HP: telepon akun = identifier, country dari field tetap disimpan", async () => {
    const { user } = await otpRegister(
      "081234567891",
      "Akun HP",
      { email: `hp-${run}@t.local`, country: "MY" },
    );
    expect(user.phone).toBe("081234567891");
    expect(user.country).toBe("MY");
  });
});

describe("isi data profil", () => {
  test("PATCH /me menyimpan alamat + telepon + negara; GET /me mengembalikannya", async () => {
    const { token } = await otpLogin(`profil-${run}@t.local`, "Isi Profil");
    const patch = await call("PATCH", "/auth/me", token, {
      name: "Isi Profil",
      address: "  Jl. Kenangan No. 1, Jakarta  ",
      phone: "0812 3456 7890",
      country: "id",
    });
    expect(patch.status).toBe(200);
    const user = data(patch).user as Json;
    expect(user.address).toBe("Jl. Kenangan No. 1, Jakarta");
    expect(user.phone).toBe("081234567890");
    expect(user.country).toBe("ID");

    const me = await call("GET", "/auth/me", token);
    expect(me.status).toBe(200);
    const meUser = data(me).user as Json;
    expect(meUser.address).toBe("Jl. Kenangan No. 1, Jakarta");
    expect(meUser.phone).toBe("081234567890");
    expect(meUser.country).toBe("ID");
  });

  test("alamat kosong dihapus (null); negara null dihapus; nilai tak valid -> 400", async () => {
    const { token } = await otpLogin(`hapus-${run}@t.local`, "Hapus Data");
    const seeded = await call("PATCH", "/auth/me", token, {
      address: "Alamat Lama",
      phone: "081234567890",
      country: "MY",
    });
    expect(seeded.status).toBe(200);
    expect((data(seeded).user as Json).address).toBe("Alamat Lama");

    const cleared = await call("PATCH", "/auth/me", token, {
      address: "   ",
      country: null,
    });
    expect(cleared.status).toBe(200);
    const clearedUser = data(cleared).user as Json;
    expect(clearedUser.address).toBeNull();
    expect(clearedUser.country).toBeNull();

    // Nilai tak valid: telepon + negara kini 400 INVALID_PAYLOAD.
    const badPhone = await call("PATCH", "/auth/me", token, {
      phone: "bukan-nomor",
    });
    expect(badPhone.status).toBe(400);
    const badCountry = await call("PATCH", "/auth/me", token, {
      country: "ZZZ",
    });
    expect(badCountry.status).toBe(400);

    const kept = await call("PATCH", "/auth/me", token, {
      address: "Alamat Baru",
    });
    expect(kept.status).toBe(200);
    // Negara tetap null (request ini tidak menyentuh country), alamat berubah.
    expect((data(kept).user as Json).country).toBeNull();
    expect((data(kept).user as Json).address).toBe("Alamat Baru");
  });
});
