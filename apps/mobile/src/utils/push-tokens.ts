// Registrasi token push M2, FCM SAJA (Wella 3 Nov 2026, tap opsi:
// tanpa Expo Push). Kumpulkan token device native (FCM) via
// expo-notifications — dipakai HANYA untuk izin + token native, bukan
// layanan push Expo — daftarkan ke POST /push-tokens saat login / app
// start, dan daftar ulang saat token berubah.
// Fail-soft total: tanpa izin, tanpa token, atau server down — tidak
// throw, tidak mengganggu login/tracking. Modul notifikasi di-inject
// supaya bisa dites tanpa device (default: expo-notifications asli,
// diimpor DINAMIS — impor statis menarik react-native dan memecahkan
// bun test; tes selalu memakai fake, jadi impor asli tidak dievaluasi).
import { apiRequest } from "./api-client";

export interface NotificationsLike {
  getPermissionsAsync(): Promise<{ status: string }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  getDevicePushTokenAsync(): Promise<{ data: string }>;
  // Sinyal re-collect best-effort saja: argumen callback DIABAIKAN,
  // handler selalu re-collect token device dan daftar ulang bila
  // berubah. Ini BUKAN langganan token Expo — tidak ada token Expo
  // di jalur ini sama sekali.
  addPushTokenListener(
    cb: (token: { data: string }) => void,
  ): { remove: () => void };
}

type RequestFn = (
  path: string,
  opts: { method?: string; body?: unknown },
) => Promise<unknown>;

const realNotifications: NotificationsLike = {
  getPermissionsAsync: async () =>
    (await import("expo-notifications")).getPermissionsAsync(),
  requestPermissionsAsync: async () =>
    (await import("expo-notifications")).requestPermissionsAsync(),
  getDevicePushTokenAsync: async () =>
    (await import("expo-notifications")).getDevicePushTokenAsync(),
  addPushTokenListener: (cb) => {
    let sub: { remove: () => void } | undefined;
    void import("expo-notifications").then((mod) => {
      sub = mod.addPushTokenListener(cb);
    });
    return { remove: () => sub?.remove() };
  },
};

// Minta izin notifikasi bila belum granted, lalu kumpulkan token
// device native. Gagal di titik mana pun (izin ditolak, fetch throw,
// token kosong) -> null. Tidak ada fallback ke jalur lain.
export async function collectPushToken(
  notifications: NotificationsLike = realNotifications,
): Promise<string | null> {
  try {
    const current = await notifications.getPermissionsAsync();
    if (current.status !== "granted") {
      const asked = await notifications.requestPermissionsAsync();
      if (asked.status !== "granted") return null;
    }
    const { data } = await notifications.getDevicePushTokenAsync();
    return typeof data === "string" && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

export async function registerPushToken(
  deviceToken: string,
  request: RequestFn = (path, opts) =>
    apiRequest(path, { method: "POST", body: opts.body }),
): Promise<void> {
  if (!deviceToken) return;
  await request("/push-tokens", { method: "POST", body: { deviceToken } });
}

// State modul: token terakhir yang berhasil didaftar (idempotensi —
// setup dipanggil dari layout + layar login, tidak boleh dobel POST)
// dan flag listener supaya hanya dipasang sekali.
let lastRegisteredToken: string | null = null;
let listenerAttached = false;

export async function setupPushTokens(
  notifications: NotificationsLike = realNotifications,
  request: RequestFn = (path, opts) =>
    apiRequest(path, { method: "POST", body: opts.body }),
): Promise<void> {
  if (!listenerAttached) {
    listenerAttached = true;
    notifications.addPushTokenListener(() => {
      // Argumen diabaikan dengan sengaja: re-collect token device
      // yang sebenarnya, daftar ulang hanya bila berubah.
      void collectPushToken(notifications)
        .then((token) => {
          if (token && token !== lastRegisteredToken) {
            return registerPushToken(token, request).then(() => {
              lastRegisteredToken = token;
            });
          }
        })
        .catch(() => undefined);
    });
  }
  try {
    const token = await collectPushToken(notifications);
    if (!token) return;
    if (token === lastRegisteredToken) return;
    await registerPushToken(token, request);
    lastRegisteredToken = token;
  } catch {
    // Fail-soft: registrasi push tidak boleh menggagalkan login/startup.
  }
}
