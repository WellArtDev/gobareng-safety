// Penyimpanan sesi — W-1 + A-2. Native: expo-secure-store (terenkripsi
// OS). Metro memilih auth-store.web.ts untuk web. Token TIDAK pernah
// di env atau bundle. Kegagalan penyimpanan tidak merusak layar — sesi
// jatuh ke memori (session-token.ts) selama aplikasi hidup.
// A-2: refresh token ikut disimpan untuk rotasi (access hanya 15 mnt).
import * as SecureStore from "expo-secure-store";

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

export async function loadSession(): Promise<void> {
  if (loaded) return;
  try {
    setSessionCache(
      (await SecureStore.getItemAsync(TOKEN_KEY)) ?? undefined,
      (await SecureStore.getItemAsync(NAME_KEY)) ?? undefined,
      (await SecureStore.getItemAsync(REFRESH_KEY)) ?? undefined,
    );
  } catch {
    setSessionCache(undefined, undefined, undefined);
  }
  loaded = true;
}

// Tulis sesi ke penyimpanan saja (tanpa mengubah cache memori).
// Dipakai saveSession dan persister hasil refresh di api-client —
// satu jalur tulis supaya rotasi token tidak pernah hanya di memori.
export async function persistSession(
  token: string,
  name: string | undefined,
  refreshToken?: string,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    if (name !== undefined) await SecureStore.setItemAsync(NAME_KEY, name);
    if (refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  } catch {
    // Persist best-effort; sesi memori tetap jalan.
  }
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
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(NAME_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {
    // Idem.
  }
}

export { getRefreshToken, getSessionName, getSessionToken };
