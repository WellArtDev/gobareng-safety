// Layar Pengaturan — mockup data-screen="settings" (7 seksi):
// seksi lipat: Notifikasi, Privasi, Baterai & GPS, Bahasa, Tema,
// Akun. Bahasa & Tema HANYA di seksinya masing-masing — toggle cepat
// di kartu atas dihapus 1 Nov 2026 karena duplikat (laporan Wella
// dari screenshot: bahasa + tema muncul 2x di Pengaturan).
// Opsi "ikut sistem" mockup TIDAK dirender — kebijakan sama dengan
// web (toggle manual saja). Seksi Peta offline mockup TIDAK dirender — butuh unduhan peta
// nyata (belum ada; jangan data palsu). Opsi "ikut sistem" mockup
// TIDAK dirender — kebijakan sama dengan web (toggle manual saja).
// Preferensi in-memory (persist + server = SET-2..8).
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import {
  RadioRow,
  SettingsButton,
  SettingsNote,
  SettingsSection,
  SwitchRow,
} from "@/components/SettingsUi";
import { useTranslation, type Locale } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme";
import { clearSession, getRefreshToken } from "@/utils/auth-store";
import { revokeRefreshToken } from "@/utils/auth-api";
import { fetchMe, type MeUser } from "@/utils/profile-api";
import {
  DEFAULT_PREFS,
  setGpsMode,
  setTheme as setThemePref,
  toggleSwitch,
  type GpsMode,
  type SettingsPrefs,
  type ThemeMode,
} from "@/utils/settings-store";

const GPS_MODES: Array<{ mode: GpsMode; titleKey: string; descKey: string }> = [
  { mode: "hemat", titleKey: "settings.gpsHemat", descKey: "settings.gpsHematDesc" },
  {
    mode: "seimbang",
    titleKey: "settings.gpsSeimbang",
    descKey: "settings.gpsSeimbangDesc",
  },
  {
    mode: "akurat",
    titleKey: "settings.gpsAkurat",
    descKey: "settings.gpsAkuratDesc",
  },
];

export function SettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [prefs, setPrefs] = useState<SettingsPrefs>(DEFAULT_PREFS);
  const [me, setMe] = useState<MeUser | null>(null);

  const load = useCallback(async () => {
    setMe(await fetchMe().catch(() => null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (key: Parameters<typeof toggleSwitch>[1]) =>
    setPrefs((p) => toggleSwitch(p, key));

  const pickLang = (lang: Locale) => setLocale(lang);

  // Tema: provider (efek visual) + prefs (sumber preferensi, SET-1).
  const pickTheme = (mode: ThemeMode) => {
    setTheme(mode);
    setPrefs((p) => setThemePref(p, mode));
  };

  const logout = async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) await revokeRefreshToken(refreshToken);
    await clearSession();
    router.replace("/login");
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityLabel={t("settings.backLabel")}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t("settings.title")}</Text>
      </View>

      {/* 1. Notifikasi — terbuka default (mockup .set-sec.open) */}
      <SettingsSection
        title={t("settings.notifTitle")}
        subtitle={t("settings.notifSub")}
        icon="🔔"
        defaultOpen
      >
        <SwitchRow
          title={t("settings.notifTripReminder")}
          desc={t("settings.notifTripReminderDesc")}
          on={prefs.notifTripReminder}
          onToggle={() => toggle("notifTripReminder")}
        />
        <SwitchRow
          title={t("settings.notifBystander")}
          desc={t("settings.notifBystanderDesc")}
          on={prefs.notifBystander}
          onToggle={() => toggle("notifBystander")}
        />
        <SwitchRow
          title={t("settings.notifSos")}
          desc={t("settings.notifSosDesc")}
          on={prefs.notifSos}
          onToggle={() => toggle("notifSos")}
        />
        <SwitchRow
          title={t("settings.notifPromo")}
          desc={t("settings.notifPromoDesc")}
          on={prefs.notifPromo}
          onToggle={() => toggle("notifPromo")}
          last
        />
      </SettingsSection>

      {/* 2. Privasi */}
      <SettingsSection
        title={t("settings.privacyTitle")}
        subtitle={t("settings.privacySub")}
        icon="🛡"
      >
        <SwitchRow
          title={t("settings.privacyPublicProfile")}
          desc={t("settings.privacyPublicProfileDesc")}
          on={prefs.privacyPublicProfile}
          onToggle={() => toggle("privacyPublicProfile")}
        />
        <SwitchRow
          title={t("settings.privacyShowStats")}
          desc={t("settings.privacyShowStatsDesc")}
          on={prefs.privacyShowStats}
          onToggle={() => toggle("privacyShowStats")}
        />
        <SwitchRow
          title={t("settings.privacyAllowReports")}
          desc={t("settings.privacyAllowReportsDesc")}
          on={prefs.privacyAllowReports}
          onToggle={() => toggle("privacyAllowReports")}
          last
        />
        <SettingsNote>{t("settings.privacyNote")}</SettingsNote>
      </SettingsSection>

      {/* 3. Baterai & GPS */}
      <SettingsSection
        title={t("settings.gpsTitle")}
        subtitle={t("settings.gpsSub")}
        icon="🔋"
      >
        <Text style={styles.secTitleIn}>{t("settings.gpsAccuracy")}</Text>
        {GPS_MODES.map(({ mode, titleKey, descKey }) => (
          <RadioRow
            key={mode}
            title={t(titleKey)}
            desc={t(descKey)}
            selected={prefs.gpsMode === mode}
            onPress={() => setPrefs((p) => setGpsMode(p, mode))}
          />
        ))}
        <SwitchRow
          title={t("settings.backgroundTracking")}
          desc={t("settings.backgroundTrackingDesc")}
          on={prefs.backgroundTracking}
          onToggle={() => toggle("backgroundTracking")}
          last
        />
        <View style={styles.noteBox}>
          <Text style={styles.noteBoxText}>{t("settings.batteryNote")}</Text>
        </View>
      </SettingsSection>

      {/* 4. Bahasa */}
      <SettingsSection
        title={t("settings.langTitle")}
        subtitle={t("settings.langSub")}
        icon="🌐"
      >
        <RadioRow
          title={t("settings.langId")}
          desc={t("settings.langIdDesc")}
          selected={locale === "id"}
          onPress={() => pickLang("id")}
        />
        <RadioRow
          title={t("settings.langEn")}
          desc={t("settings.langEnDesc")}
          selected={locale === "en"}
          onPress={() => pickLang("en")}
        />
        <SettingsNote>{t("settings.langNote")}</SettingsNote>
      </SettingsSection>

      {/* 5. Tema — mockup seksi 6; opsi "ikut sistem" TIDAK dirender
          (kebijakan web: manual Terang/Gelap saja) */}
      <SettingsSection
        title={t("settings.themeTitle")}
        subtitle={t("settings.themeSubLong")}
        icon="🌙"
      >
        <RadioRow
          title={t("settings.themeLight")}
          desc={t("settings.themeLightDesc")}
          selected={theme === "light"}
          onPress={() => pickTheme("light")}
        />
        <RadioRow
          title={t("settings.themeDark")}
          desc={t("settings.themeDarkDesc")}
          selected={theme === "dark"}
          onPress={() => pickTheme("dark")}
        />
        <SettingsNote>{t("settings.themeNote")}</SettingsNote>
      </SettingsSection>

      {/* 6. Akun */}
      <SettingsSection
        title={t("settings.accountTitle")}
        subtitle={t("settings.accountSub")}
        icon="👤"
      >
        <View style={styles.kv}>
          <Text style={styles.k}>{t("settings.accountEmail")}</Text>
          <Text style={styles.v}>{me?.email ?? "—"}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("settings.accountWa")}</Text>
          <Text style={styles.v}>{me?.phone ?? "-"}</Text>
        </View>
        <SettingsButton label={t("settings.logout")} onPress={logout} />
        <SettingsButton
          label={t("settings.deleteAccount")}
          danger
          onPress={() =>
            Alert.alert(t("app.name"), t("settings.deleteComingSoon"))
          }
        />
        <SettingsNote>{t("settings.deleteNote")}</SettingsNote>
      </SettingsSection>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
  appbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: { fontSize: 24, fontWeight: "700", color: c.text },
  appbarTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: c.text,
    flex: 1,
  },
  secTitleIn: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginTop: 8,
    marginBottom: 10,
  },
  // .note-box biru
  noteBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: c.catOpenBg,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  noteBoxText: {
    flex: 1,
    fontSize: 12.5,
    color: c.catOpen,
    lineHeight: 12.5 * 1.6,
  },
  kv: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 6,
  },
  k: { color: c.text2, fontWeight: "600", fontSize: 13 },
  v: {
    fontWeight: "700",
    fontSize: 13,
    color: c.text,
    textAlign: "right",
    flexShrink: 1,
  },
});
