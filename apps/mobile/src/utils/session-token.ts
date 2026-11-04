// Cache token sesi in-memory — modul murni tanpa dependensi native
// supaya klien API dan tes unit tidak ikut menyeret react-native.
// auth-store (native/web) adalah satu-satunya penulis persist.
// A-2: menyimpan juga refresh token untuk rotasi.
let token: string | undefined;
let name: string | undefined;
let refreshToken: string | undefined;

export function setSessionCache(
  newToken: string | undefined,
  newName: string | undefined,
  newRefreshToken?: string | undefined,
): void {
  token = newToken;
  name = newName;
  if (arguments.length >= 3 || newToken === undefined) {
    refreshToken = newRefreshToken;
  }
}

export function setAccessToken(newToken: string): void {
  token = newToken;
}

export function getSessionToken(): string | undefined {
  return token;
}

export function getSessionName(): string | undefined {
  return name;
}

export function getRefreshToken(): string | undefined {
  return refreshToken;
}
