// Channel push M2 — FCM SAJA (keputusan Wella 3 Nov 2026 11:22).
// Satu-satunya jalur push adalah FCM HTTP v1; tidak ada Expo Push,
// tidak ada setting pilihan penyedia, tidak ada fallback antar jalur.
// Kredensial service account dari env FCM_SERVICE_ACCOUNT_JSON
// (atau file di FCM_SERVICE_ACCOUNT_PATH). Kredensial tidak terpasang
// = gagal EKSPLISIT (FCM_NOT_CONFIGURED), bukan diam-diam sukses.
// Pengiriman per token fail-soft (hasil ok:false, bukan throw) —
// kecuali kredensial hilang/invalid yang di-throw sendFcmPush supaya
// caller tidak bisa salah mengartikannya sebagai sukses diam-diam;
// sendFcmPushMany mengubahnya menjadi hasil error per token.
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

export interface PushSendResult {
  token: string;
  ok: boolean;
  error?: string;
}

export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

// Registrasi token: hanya token device native (FCM). Kunci lain dari
// klien lama diabaikan; tanpa deviceToken = INVALID_PAYLOAD.
export function normalizeDeviceTokenPayload(body: Record<string, unknown>): {
  deviceToken: string;
} {
  const v = body.deviceToken;
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error("INVALID_PAYLOAD");
  }
  return { deviceToken: v.trim() };
}

const FCM_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Kredensial FCM: JSON service account dari env, atau path file.
// Mengembalikan null kalau tidak ada yang terpasang.
export function fcmServiceAccountJson(): string | null {
  const inline = (process.env.FCM_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (inline) return inline;
  const path = (process.env.FCM_SERVICE_ACCOUNT_PATH ?? "").trim();
  if (!path) return null;
  try {
    const content = readFileSync(path, "utf8").trim();
    return content || null;
  } catch {
    return null;
  }
}

interface ServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

async function getFcmAccessToken(
  serviceAccountJson: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(serviceAccountJson) as ServiceAccount;
  } catch {
    throw new Error("FCM_INVALID_CREDENTIAL");
  }
  if (!sa.project_id || !sa.private_key || !sa.client_email) {
    throw new Error("FCM_INVALID_CREDENTIAL");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );
  const payload = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: FCM_TOKEN_URL,
      exp: now + 3600,
      iat: now,
    }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .end()
    .sign(sa.private_key, "base64url");
  const assertion = `${header}.${payload}.${signature}`;
  const res = await fetchImpl(FCM_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

export async function sendFcmPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  opts: {
    fetchImpl?: typeof fetch;
    serviceAccountJson?: string | null;
  } = {},
): Promise<PushSendResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const saJson = opts.serviceAccountJson ?? fcmServiceAccountJson();
  if (!saJson) throw new Error("FCM_NOT_CONFIGURED");
  let projectId: string;
  try {
    projectId = (JSON.parse(saJson) as ServiceAccount).project_id;
  } catch {
    throw new Error("FCM_INVALID_CREDENTIAL");
  }
  if (!projectId) throw new Error("FCM_INVALID_CREDENTIAL");
  try {
    const accessToken = await getFcmAccessToken(saJson, fetchImpl);
    if (!accessToken) return { token, ok: false, error: "FCM_TOKEN_FAILED" };
    // Nilai data FCM harus string — objek di-JSON-kan.
    const stringData: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      stringData[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
    const res = await fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: stringData,
          },
        }),
      },
    );
    if (!res.ok) return { token, ok: false, error: `FCM_HTTP_${res.status}` };
    return { token, ok: true };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("FCM_")) throw err;
    return { token, ok: false, error: "FCM_FETCH_FAILED" };
  }
}

// Kirim ke banyak token: throw kredensial jadi hasil error per token.
// Kode error tetap eksplisit (FCM_*), tapi detail mentah (err.message)
// TIDAK dibawa ke respons — hanya ke log server supaya tidak bocor ke klien.
export async function sendFcmPushMany(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  opts: {
    fetchImpl?: typeof fetch;
    serviceAccountJson?: string | null;
  } = {},
): Promise<PushSendResult[]> {
  const out: PushSendResult[] = [];
  for (const token of tokens) {
    try {
      out.push(await sendFcmPush(token, title, body, data, opts));
    } catch (err) {
      if (err instanceof Error) {
        console.warn("[api] fcm batch send failed", err.message);
      }
      out.push({
        token,
        ok: false,
        error:
          err instanceof Error && err.message.startsWith("FCM_")
            ? err.message
            : "PUSH_FAILED",
      });
    }
  }
  return out;
}

// Start Trip otomatis Berangkat (keputusan pemilik 3 Nov 2026 16:51
// WIB): payload push trip-dimulai — murni supaya bisa dites tanpa
// FCM. Judul + isi berbahasa Indonesia (default app); data membawa
// tripId + type supaya ketukan notifikasi di HP anggota membuka layar
// tracking trip itu (pemicu tracking sedini mungkin — GPS anggota
// TIDAK bisa dinyalakan dari jauh oleh HP leader).
export function tripStartedPushPayload(
  tripName: string,
  tripId: string,
): PushPayload {
  return {
    title: "GoBareng — trip dimulai",
    body: `Trip ${tripName} sudah dimulai. Semua anggota otomatis berangkat — buka tracking untuk mulai mengirim posisimu.`,
    data: { type: "TRIP_STARTED", tripId },
  };
}

// Store minimal yang dibutuhkan fanout SOS — Db asli mengimplementasi
// pushTokensForUsers; tes memakai stub bentuk yang sama.
export interface PushTokenStore {
  pushTokensForUsers(userIds: string[]): Promise<string[]>;
}

export async function sendSosPush(
  store: PushTokenStore,
  userIds: string[],
  payload: PushPayload,
  opts: {
    fetchImpl?: typeof fetch;
    serviceAccountJson?: string | null;
  } = {},
): Promise<PushSendResult[]> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return [];
  try {
    const tokens = await store.pushTokensForUsers(unique);
    if (tokens.length === 0) return [];
    return await sendFcmPushMany(
      tokens,
      payload.title,
      payload.body,
      payload.data,
      opts,
    );
  } catch {
    // Fanout SOS tidak pernah menggagalkan respons SOS utama.
    return [];
  }
}
