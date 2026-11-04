// TDD — channel push M2, FCM SAJA (keputusan Wella 3 Nov 2026 11:22:
// tanpa Expo Push, tanpa setting pilihan penyedia).
// Unit murni: fetch di-stub, tanpa DB / jaringan asli.
import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fcmServiceAccountJson,
  normalizeDeviceTokenPayload,
  sendFcmPush,
  sendFcmPushMany,
  sendSosPush,
  tripStartedPushPayload,
  type PushSendResult,
} from "../push.js";

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return (async (url: unknown, init?: RequestInit) => {
    return handler(String(url), init);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeServiceAccount(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  return JSON.stringify({
    type: "service_account",
    project_id: "gobareng-test",
    private_key_id: "key1",
    private_key: pem,
    client_email: "test@gobareng-test.iam.gserviceaccount.com",
    client_id: "123",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
  });
}

describe("normalizeDeviceTokenPayload", () => {
  test("menerima deviceToken saja (trim), menolak kosong/bukan-string/tanpa token", () => {
    expect(
      normalizeDeviceTokenPayload({ deviceToken: "  fcm-abc  " }),
    ).toEqual({ deviceToken: "fcm-abc" });
    expect(() => normalizeDeviceTokenPayload({})).toThrow("INVALID_PAYLOAD");
    expect(() => normalizeDeviceTokenPayload({ deviceToken: "  " })).toThrow(
      "INVALID_PAYLOAD",
    );
    expect(() => normalizeDeviceTokenPayload({ deviceToken: 42 })).toThrow(
      "INVALID_PAYLOAD",
    );
    // Kunci lain (mis. sisa expoToken dari klien lama) diabaikan.
    expect(
      normalizeDeviceTokenPayload({ deviceToken: "fcm-1", expoToken: "x" }),
    ).toEqual({ deviceToken: "fcm-1" });
  });
});

describe("fcmServiceAccountJson", () => {
  test("env inline menang; path file dibaca; tidak ada -> null", () => {
    const prevInline = process.env.FCM_SERVICE_ACCOUNT_JSON;
    const prevPath = process.env.FCM_SERVICE_ACCOUNT_PATH;
    try {
      process.env.FCM_SERVICE_ACCOUNT_JSON = "inline-json";
      process.env.FCM_SERVICE_ACCOUNT_PATH = "";
      expect(fcmServiceAccountJson()).toBe("inline-json");
      delete process.env.FCM_SERVICE_ACCOUNT_JSON;
      const p = join(tmpdir(), `sa-${Date.now()}.json`);
      writeFileSync(p, "  file-json  ");
      process.env.FCM_SERVICE_ACCOUNT_PATH = p;
      expect(fcmServiceAccountJson()).toBe("file-json");
      process.env.FCM_SERVICE_ACCOUNT_PATH = "/tmp/does-not-exist-sa.json";
      expect(fcmServiceAccountJson()).toBeNull();
    } finally {
      if (prevInline === undefined) delete process.env.FCM_SERVICE_ACCOUNT_JSON;
      else process.env.FCM_SERVICE_ACCOUNT_JSON = prevInline;
      if (prevPath === undefined) delete process.env.FCM_SERVICE_ACCOUNT_PATH;
      else process.env.FCM_SERVICE_ACCOUNT_PATH = prevPath;
    }
  });
});

describe("sendFcmPush", () => {
  test("tanpa kredensial -> throw FCM_NOT_CONFIGURED (eksplisit, tanpa fallback)", async () => {
    await expect(
      sendFcmPush("tok", "T", "B", {}, { serviceAccountJson: null }),
    ).rejects.toThrow("FCM_NOT_CONFIGURED");
  });

  test("kredensial malformed -> throw FCM_INVALID_CREDENTIAL", async () => {
    await expect(
      sendFcmPush("tok", "T", "B", {}, { serviceAccountJson: "bukan-json" }),
    ).rejects.toThrow("FCM_INVALID_CREDENTIAL");
  });

  test("dengan kredensial: tukar token lalu kirim v1 -> ok", async () => {
    const seen: string[] = [];
    const fake = stubFetch((url, init) => {
      seen.push(url);
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "ya29.test" });
      }
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body.message.token).toBe("tok-1");
      expect(body.message.notification).toEqual({ title: "T", body: "B" });
      expect(body.message.data).toEqual({ sosId: "s1", lat: "-7.1" });
      return jsonResponse({ name: "projects/gobareng-test/messages/1" });
    });
    const r = await sendFcmPush("tok-1", "T", "B", { sosId: "s1", lat: -7.1 }, {
      fetchImpl: fake,
      serviceAccountJson: makeServiceAccount(),
    });
    expect(r).toEqual({ token: "tok-1", ok: true });
    expect(seen).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://fcm.googleapis.com/v1/projects/gobareng-test/messages:send",
    ]);
  });

  test("token endpoint gagal -> tidak ok, tanpa throw", async () => {
    const fake = stubFetch((url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ error: "invalid_grant" }, 400);
      }
      throw new Error("must not reach v1");
    });
    const r = await sendFcmPush("tok-1", "T", "B", {}, {
      fetchImpl: fake,
      serviceAccountJson: makeServiceAccount(),
    });
    expect(r).toEqual({ token: "tok-1", ok: false, error: "FCM_TOKEN_FAILED" });
  });

  test("v1 HTTP 500 -> tidak ok FCM_HTTP_500", async () => {
    const fake = stubFetch((url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "ya29.test" });
      }
      return jsonResponse({ error: "boom" }, 500);
    });
    const r = await sendFcmPush("tok-1", "T", "B", {}, {
      fetchImpl: fake,
      serviceAccountJson: makeServiceAccount(),
    });
    expect(r).toEqual({ token: "tok-1", ok: false, error: "FCM_HTTP_500" });
  });

  test("fetch throw -> tidak ok FCM_FETCH_FAILED", async () => {
    const fake = stubFetch(() => {
      throw new Error("network down");
    });
    const r = await sendFcmPush("tok-1", "T", "B", {}, {
      fetchImpl: fake,
      serviceAccountJson: makeServiceAccount(),
    });
    expect(r).toEqual({ token: "tok-1", ok: false, error: "FCM_FETCH_FAILED" });
  });
});

describe("sendSosPush (FCM saja)", () => {
  const payload = {
    title: "GoBareng SOS",
    body: "SOS dari A: CEDERA",
    data: { sosId: "s1", tripId: "t1", lat: -7.1, lon: 109.9 },
  };

  test("mengirim ke token device penerima, dedup user", async () => {
    const sent: string[] = [];
    const fake = stubFetch((url, init) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "ya29.test" });
      }
      sent.push(JSON.parse(String((init as RequestInit).body)).message.token);
      return jsonResponse({ name: "x" });
    });
    const store = {
      pushTokensForUsers: async (ids: string[]) => {
        expect(ids).toEqual(["u1", "u2"]);
        return ["tok-1", "tok-2"];
      },
    };
    const out = await sendSosPush(store, ["u1", "u1", "u2"], payload, {
      fetchImpl: fake,
      serviceAccountJson: makeServiceAccount(),
    });
    expect(sent).toEqual(["tok-1", "tok-2"]);
    expect(out.every((r: PushSendResult) => r.ok)).toBe(true);
  });

  test("user kosong / tanpa token -> hasil kosong", async () => {
    const store = { pushTokensForUsers: async () => [] as string[] };
    expect(
      await sendSosPush(store, [], payload, {
        serviceAccountJson: makeServiceAccount(),
      }),
    ).toEqual([]);
    expect(
      await sendSosPush(store, ["u1"], payload, {
        serviceAccountJson: makeServiceAccount(),
      }),
    ).toEqual([]);
  });

  test("FCM belum terpasang -> error eksplisit per token, tanpa fallback", async () => {
    const store = {
      pushTokensForUsers: async () => ["tok-1", "tok-2"],
    };
    const out = await sendSosPush(store, ["u1", "u2"], payload, {
      serviceAccountJson: null,
    });
    expect(out).toEqual([
      { token: "tok-1", ok: false, error: "FCM_NOT_CONFIGURED" },
      { token: "tok-2", ok: false, error: "FCM_NOT_CONFIGURED" },
    ]);
  });

  test("store throw -> fail-soft [] (respons SOS tidak gagal)", async () => {
    const store = {
      pushTokensForUsers: async () => {
        throw new Error("db down");
      },
    };
    expect(
      await sendSosPush(store, ["u1"], payload, {
        serviceAccountJson: makeServiceAccount(),
      }),
    ).toEqual([]);
  });
});

describe("tripStartedPushPayload: payload push trip-dimulai", () => {
  test("judul + isi menyebut nama trip; data membawa type + tripId untuk ketuk-ke-tracking", () => {
    const payload = tripStartedPushPayload("Trip Warjok", "trip-123");
    expect(payload.title).toBe("GoBareng — trip dimulai");
    expect(payload.body).toContain("Trip Warjok");
    expect(payload.data).toEqual({ type: "TRIP_STARTED", tripId: "trip-123" });
  });
});

describe("sendFcmPushMany: kode error tetap, detail mentah ke log", () => {
  test("fetch throw (detail network mentah) -> kode generik, tanpa bocor pesan", async () => {
    const errSpy: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      errSpy.push(String(args[0]));
    };
    try {
      const out = await sendFcmPushMany(["tok-x"], "T", "B", {}, {
        fetchImpl: (() => {
          throw new Error("secret-connection-string db://internal");
        }) as unknown as typeof fetch,
        serviceAccountJson: makeServiceAccount(),
      });
      // Kode generik FCM_FETCH_FAILED — detail mentah tidak ikut respons.
      expect(out).toEqual([{ token: "tok-x", ok: false, error: "FCM_FETCH_FAILED" }]);
      expect(JSON.stringify(out)).not.toContain("secret-connection-string");
    } finally {
      console.warn = origWarn;
    }
  });

  test("throw kredensial FCM_* tetap membawa kode aslinya", async () => {
    const out = await sendFcmPushMany(["tok-1"], "T", "B", {}, {
      serviceAccountJson: null,
    });
    expect(out).toEqual([{ token: "tok-1", ok: false, error: "FCM_NOT_CONFIGURED" }]);
  });
});
