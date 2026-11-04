// Konfigurasi runtime aplikasi. MOB-2: EXPO_PUBLIC_API_URL WAJIB diakses
// secara literal (process.env.EXPO_PUBLIC_API_URL) — Metro hanya
// meng-inline akses literal saat bundle; process.env[name] dinamis tidak
// pernah ter-inline dan diam-diam jatuh ke fallback.

// Deklarasi minimal agar tsc lolos tanpa @types/node; Metro meng-inline
// EXPO_PUBLIC_* saat bundle, jadi pembacaan ini aman.
declare const process: {
  env: { EXPO_PUBLIC_API_URL?: string; EXPO_PUBLIC_WEB_URL?: string };
};

// Expo menyediakan global __DEV__ (true di dev/preview). Deklarasi
// minimal supaya tsc lolos tanpa @types/react-native.
declare const __DEV__: boolean | undefined;

const DEFAULT_API_URL = "http://localhost:3000";

// Base landing web publik (/undang + /pantau). Default di-hardcode ke
// posko.gobareng.app (didokumentasikan di PR); override via env build
// EXPO_PUBLIC_WEB_URL bila dashboard pindah domain.
const DEFAULT_WEB_URL = "https://posko.gobareng.app";

export function apiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (url && url.length > 0) return url.replace(/\/+$/, "");
  // Fail-fast di dev: tanpa EXPO_PUBLIC_API_URL request jatuh ke
  // localhost dan gagal misterius di HP fisik. Set di .env / EAS env:
  // EXPO_PUBLIC_API_URL=https://api.gobareng.app
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    throw new Error(
      "EXPO_PUBLIC_API_URL belum diset. Isi .env (lihat .env.example) lalu restart Expo.",
    );
  }
  return DEFAULT_API_URL;
}

export function webBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_WEB_URL;
  return url && url.length > 0 ? url.replace(/\/+$/, "") : DEFAULT_WEB_URL;
}

export function apiV1(path: string): string {
  return `${apiBaseUrl()}/api/v1${path}`;
}
