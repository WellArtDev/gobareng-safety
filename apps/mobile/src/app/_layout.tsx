// Root layout — LanguageProvider + gerbang auth: sesi dimuat dari
// secure store saat boot; tanpa token semua rute dialihkan ke /login
// (keputusan 28 Okt 2026: wajib login, tanpa tamu/demo).
import { useEffect, useState } from "react";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { LanguageProvider } from "@/i18n";
import { ThemeProvider, useTheme } from "@/theme";
import { setSessionPersister } from "@/utils/api-client";
import {
  getSessionToken,
  loadSession,
  persistSession,
} from "@/utils/auth-store";

// Wire di scope modul (bukan di effect): refresh bisa terjadi dari
// layar mana pun dan kapan pun, termasuk sesaat sebelum app ditutup —
// persister harus sudah terpasang sebelum request pertama apa pun.
setSessionPersister(persistSession);
// Side-effect: daftarkan background location task di startup supaya
// update lokasi OS tetap punya handler walau proses app di-restart.
import "@/utils/background-location";
import { setupPushTokens } from "@/utils/push-tokens";
import { setupTripStartedPushResponse } from "@/utils/push-response";

// /magic-link publik seperti /login: tautan juri harus bisa ditukar
// jadi sesi SEBELUM gerbang auth berjalan (tanpa ini, layar langsung
// dialihkan ke /login dan token deep link hilang).
const PUBLIC_PATHS = new Set(["/login", "/register", "/magic-link"]);

// Tautan pantau (§16) publik: pemegang tautan tidak punya akun.
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/pantau/");
}

function AuthGate() {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    loadSession().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!getSessionToken() && !isPublicPath(pathname)) {
      router.replace("/login");
    }
    // M2: sesi ada (login / restart app) -> daftarkan token push,
    // fire-and-forget + fail-soft; idempotent di dalam util.
    if (getSessionToken()) {
      void setupPushTokens();
      // Trip-dimulai: ketuk push -> layar tracking (pemicu tracking
      // anggota; GPS tidak bisa dinyalakan dari jauh). Listener
      // dipasang sekali (flag di dalam util); tanpa sesi saat ketuk,
      // navigasi ditahan supaya deep link tidak hilang ke /login.
      setupTripStartedPushResponse(
        undefined,
        () => getSessionToken() !== null,
        (path) => router.push(path),
      );
    }
  }, [ready, pathname, router]);

  return null;
}

// StatusBar mengikuti tema: latar gelap butuh ikon terang, dan sebaliknya.
function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === "dark" ? "light" : "dark"} />;
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthGate />
        <ThemedStatusBar />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </LanguageProvider>
  );
}
