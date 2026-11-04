// Preferensi pengaturan — default sesuai mockup settings (31 layar).
// SEMENTARA in-memory + state layar; persist (AsyncStorage/secure) +
// sinkron server menyusul bersama kartu SET-2..8. Tema (SET-1): manual
// Terang/Gelap, selalu mulai light — kebijakan sama dengan web.
export type GpsMode = "hemat" | "seimbang" | "akurat";
export type ThemeMode = "light" | "dark";

export interface SettingsPrefs {
  notifTripReminder: boolean;
  notifBystander: boolean;
  notifSos: boolean;
  notifPromo: boolean;
  privacyPublicProfile: boolean;
  privacyShowStats: boolean;
  privacyAllowReports: boolean;
  gpsMode: GpsMode;
  backgroundTracking: boolean;
  theme: ThemeMode;
}

export const DEFAULT_PREFS: SettingsPrefs = {
  notifTripReminder: true,
  notifBystander: true,
  notifSos: true,
  notifPromo: false,
  privacyPublicProfile: true,
  privacyShowStats: true,
  privacyAllowReports: true,
  gpsMode: "seimbang",
  backgroundTracking: true,
  theme: "light",
};

type BooleanPrefKey = {
  [K in keyof SettingsPrefs]: SettingsPrefs[K] extends boolean ? K : never;
}[keyof SettingsPrefs];

export function toggleSwitch(
  prefs: SettingsPrefs,
  key: BooleanPrefKey,
): SettingsPrefs {
  return { ...prefs, [key]: !prefs[key] };
}

export function setGpsMode(prefs: SettingsPrefs, mode: GpsMode): SettingsPrefs {
  return { ...prefs, gpsMode: mode };
}

export function setTheme(
  prefs: SettingsPrefs,
  theme: ThemeMode,
): SettingsPrefs {
  return { ...prefs, theme };
}
