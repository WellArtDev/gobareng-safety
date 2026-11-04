// Helper fetch ber-token — pola kontrak §19: respons { data } atau
// { error: { code } }; klien memetakan kode ke kunci i18n. Fail-soft:
// jaringan mati = ApiError unavailable, tidak pernah crash layar.
import { ApiError } from "./auth-api";
import {
  getRefreshToken,
  getSessionToken,
  setSessionCache,
} from "./session-token";
import { apiV1 } from "./config";

const ERROR_CODE_TO_I18N: Record<string, string> = {
  UNAUTHORIZED: "errors.unauthorized",
  FORBIDDEN: "errors.forbidden",
  ADMIN_ONLY: "errors.forbidden",
  TRIP_NOT_FOUND: "errors.notFound",
  NOT_FOUND: "errors.notFound",
  TRIP_CLOSED: "errors.tripClosed",
  AI_MODULE_DISABLED: "errors.aiModuleDisabled",
  AI_NOT_CONFIGURED: "errors.aiUnavailable",
  AI_UPSTREAM_ERROR: "errors.aiUnavailable",
  TRIP_HAS_UNACCOUNTED_MEMBERS: "errors.unaccountedMembers",
  INVALID_PAYLOAD: "errors.invalidPayload",
  ORGANIZER_BANK_DETAILS_REQUIRED: "create.errors.bankDetailsRequired",
};

const STATUS_FALLBACK: Record<number, string> = {
  401: "errors.unauthorized",
  403: "errors.forbidden",
  404: "errors.notFound",
};

const UNAVAILABLE_KEY = "errors.unavailable";
const GENERIC_KEY = "errors.invalidPayload";

// A-2: access token hanya 15 menit — saat 401, coba tukar refresh
// token (rotasi) sekali lalu ulangi request. Gagal refresh = sesi
// benar-benar habis (layar mengarahkan ke login).
//
// Hasil rotasi WAJIB diteruskan ke persister (di-wire di _layout dari
// auth-store): server me-revoke refresh token lama saat rotasi, jadi
// token baru yang hanya di memori hilang saat force-close dan login
// diminta lagi. Tanpa persister (tes), perilaku lama dipertahankan.
type SessionPersister = (
  token: string,
  name: string | undefined,
  refreshToken: string,
) => Promise<void> | void;

let sessionPersister: SessionPersister | null = null;

export function setSessionPersister(fn: SessionPersister | null): void {
  sessionPersister = fn;
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(apiV1("/auth/refresh"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const json = (await res.json()) as {
          data?: {
            token?: string;
            refreshToken?: string;
            user?: { name?: string };
          };
        };
        const data = json.data;
        if (!data?.token || !data.refreshToken) return false;
        setSessionCache(data.token, data.user?.name, data.refreshToken);
        if (sessionPersister) {
          try {
            await sessionPersister(
              data.token,
              data.user?.name,
              data.refreshToken,
            );
          } catch {
            // Persist best-effort; sesi memori tetap jalan.
          }
        }
        return true;
      } catch {
        return false;
      } finally {
        // Reset gate SETELAH promise selesai dipakai semua penunggu.
        setTimeout(() => {
          refreshing = null;
        }, 0);
      }
    })();
  }
  return refreshing;
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const token = getSessionToken();
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(apiV1(path), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(UNAVAILABLE_KEY);
  }

  // Access kedaluwarsa -> refresh sekali lalu ulangi.
  if (res.status === 401 && !retried && getRefreshToken()) {
    if (await tryRefresh()) {
      return apiRequest<T>(path, options, true);
    }
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(UNAVAILABLE_KEY);
  }

  if (!res.ok) {
    const code =
      typeof json === "object" &&
      json !== null &&
      typeof (json as { error?: { code?: unknown } }).error?.code === "string"
        ? (json as { error: { code: string } }).error.code
        : null;
    throw new ApiError(
      (code && ERROR_CODE_TO_I18N[code]) ||
        STATUS_FALLBACK[res.status] ||
        GENERIC_KEY,
      code,
    );
  }

  return (json as { data: T }).data;
}
