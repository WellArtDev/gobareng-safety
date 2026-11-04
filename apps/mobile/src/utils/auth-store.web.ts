// Varian web auth-store (dipilih Metro untuk platform web):
// expo-secure-store tidak jalan di web, jadi localStorage dengan
// fallback memori (session-token.ts). A-2: refresh token ikut.
import {
  getRefreshToken,
  getSessionName,
  getSessionToken,
  setSessionCache,
} from "./session-token";

const TOKEN_KEY = "gobareng.session.token";
const NAME_KEY = "gobareng.session.name";
const REFRESH_KEY = "gobareng.session.refresh";

let loaded = false;

function readStorage(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: string | undefined): void {
  try {
    if (value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Fallback memori; sesi tetap jalan selama halaman hidup.
  }
}

export async function loadSession(): Promise<void> {
  if (loaded) return;
  setSessionCache(
    readStorage(TOKEN_KEY),
    readStorage(NAME_KEY),
    readStorage(REFRESH_KEY),
  );
  loaded = true;
}

// Varian web dari persistSession (lihat auth-store.ts): satu jalur
// tulis supaya rotasi token tidak pernah hanya di memori.
export async function persistSession(
  token: string,
  name: string | undefined,
  refreshToken?: string,
): Promise<void> {
  writeStorage(TOKEN_KEY, token);
  if (name !== undefined) writeStorage(NAME_KEY, name);
  if (refreshToken) writeStorage(REFRESH_KEY, refreshToken);
}

export async function saveSession(
  token: string,
  name: string,
  refreshToken?: string,
): Promise<void> {
  setSessionCache(token, name, refreshToken ?? getRefreshToken());
  loaded = true;
  await persistSession(token, name, refreshToken);
}

export async function clearSession(): Promise<void> {
  setSessionCache(undefined, undefined, undefined);
  loaded = true;
  writeStorage(TOKEN_KEY, undefined);
  writeStorage(NAME_KEY, undefined);
  writeStorage(REFRESH_KEY, undefined);
}

export { getRefreshToken, getSessionName, getSessionToken };
