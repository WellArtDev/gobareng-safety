// TDD RED — registrasi token push M2, FCM SAJA (Wella 3 Nov 2026,
// tap opsi: tanpa Expo Push). Hanya token device native (FCM) yang
// dikumpulkan + didaftar; expo-notifications dipakai hanya untuk izin
// dan token native, bukan layanan push Expo.
// Semua dependensi di-inject: modul notifikasi palsu + request palsu,
// tanpa React, tanpa device beneran.
import { describe, expect, test } from "bun:test";

import {
  collectPushToken,
  registerPushToken,
  setupPushTokens,
  type NotificationsLike,
} from "../utils/push-tokens";

interface FakeNotifications extends NotificationsLike {
  permission: string;
  requestResult: string;
  deviceToken: string | Error;
  listeners: Array<(t: { data: string }) => void>;
}

function makeFake(over: Partial<FakeNotifications> = {}): FakeNotifications {
  const f: FakeNotifications = {
    permission: "granted",
    requestResult: "granted",
    deviceToken: "fcm-device-1",
    listeners: [],
    async getPermissionsAsync() {
      return { status: f.permission };
    },
    async requestPermissionsAsync() {
      return { status: f.requestResult };
    },
    async getDevicePushTokenAsync() {
      if (f.deviceToken instanceof Error) throw f.deviceToken;
      return { data: f.deviceToken };
    },
    addPushTokenListener(cb) {
      f.listeners.push(cb);
      return { remove: () => undefined };
    },
    ...over,
  };
  return f;
}

describe("collectPushToken", () => {
  test("izin ditolak -> null, tidak ada token", async () => {
    const fake = makeFake({ permission: "denied", requestResult: "denied" });
    expect(await collectPushToken(fake)).toBeNull();
  });

  test("izin diminta dulu bila belum granted, lalu kumpulkan token device", async () => {
    const fake = makeFake({
      permission: "undetermined",
      requestResult: "granted",
    });
    expect(await collectPushToken(fake)).toBe("fcm-device-1");
  });

  test("device fetch gagal -> null (tidak ada fallback ke token lain)", async () => {
    const fake = makeFake({ deviceToken: new Error("fcm down") });
    expect(await collectPushToken(fake)).toBeNull();
  });
});

describe("registerPushToken + setupPushTokens", () => {
  test("POST /push-tokens hanya membawa deviceToken; kosong -> tidak POST", async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    const request = async (path: string, opts: { body?: unknown }) => {
      calls.push({ path, body: opts.body });
      return { data: { registered: {} } };
    };
    await registerPushToken("fcm-device-1", request);
    expect(calls).toEqual([
      { path: "/push-tokens", body: { deviceToken: "fcm-device-1" } },
    ]);
    await registerPushToken("", request);
    expect(calls.length).toBe(1);
  });

  test("setup idempotent; listener memicu re-collect device token dan daftar ulang hanya bila berubah", async () => {
    const fake = makeFake();
    const calls: Array<{ deviceToken: string }> = [];
    const request = async (_path: string, opts: { body?: unknown }) => {
      calls.push(opts.body as { deviceToken: string });
      return { data: { registered: {} } };
    };
    await setupPushTokens(fake, request);
    await setupPushTokens(fake, request);
    expect(calls.length).toBe(1);
    expect(fake.listeners.length).toBe(1);
    // Fire dengan token device yang sama -> tidak ada POST tambahan.
    fake.listeners[0]!({ data: "diabaikan" });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.length).toBe(1);
    // Token device berubah -> daftar ulang sekali dengan token baru.
    fake.deviceToken = "fcm-device-2";
    fake.listeners[0]!({ data: "diabaikan juga" });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.length).toBe(2);
    expect(calls[1]).toEqual({ deviceToken: "fcm-device-2" });
  });

  test("setup fail-soft: tanpa izin tidak throw dan tidak POST", async () => {
    const fake = makeFake({ permission: "denied", requestResult: "denied" });
    let posts = 0;
    const request = async () => {
      posts += 1;
      return { data: {} };
    };
    await setupPushTokens(fake, request);
    expect(posts).toBe(0);
  });
});
