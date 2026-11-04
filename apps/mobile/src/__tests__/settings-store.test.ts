// TDD RED — store preferensi pengaturan: default sesuai mockup,
// toggle switch, pilihan GPS, validasi nilai.
import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PREFS,
  setGpsMode,
  setTheme,
  toggleSwitch,
  type SettingsPrefs,
} from "../utils/settings-store";

describe("DEFAULT_PREFS", () => {
  test("default mockup: pengingat/bystander/sos ON, promo OFF", () => {
    expect(DEFAULT_PREFS.notifTripReminder).toBe(true);
    expect(DEFAULT_PREFS.notifBystander).toBe(true);
    expect(DEFAULT_PREFS.notifSos).toBe(true);
    expect(DEFAULT_PREFS.notifPromo).toBe(false);
  });

  test("privasi default semua ON", () => {
    expect(DEFAULT_PREFS.privacyPublicProfile).toBe(true);
    expect(DEFAULT_PREFS.privacyShowStats).toBe(true);
    expect(DEFAULT_PREFS.privacyAllowReports).toBe(true);
  });

  test("GPS default seimbang; tracking latar ON", () => {
    expect(DEFAULT_PREFS.gpsMode).toBe("seimbang");
    expect(DEFAULT_PREFS.backgroundTracking).toBe(true);
  });

  test("tema default light (kebijakan web: selalu mulai terang)", () => {
    expect(DEFAULT_PREFS.theme).toBe("light");
  });
});

describe("setTheme", () => {
  test("mengubah ke dark tanpa mutasi objek asal", () => {
    const prefs: SettingsPrefs = { ...DEFAULT_PREFS };
    const next = setTheme(prefs, "dark");
    expect(next.theme).toBe("dark");
    expect(prefs.theme).toBe("light");
    expect(next).not.toBe(prefs);
  });

  test("kembali ke light", () => {
    const dark = setTheme(DEFAULT_PREFS, "dark");
    expect(setTheme(dark, "light").theme).toBe("light");
  });
});

describe("toggleSwitch", () => {
  test("membalik nilai tanpa mutasi objek asal", () => {
    const prefs: SettingsPrefs = { ...DEFAULT_PREFS };
    const next = toggleSwitch(prefs, "notifPromo");
    expect(next.notifPromo).toBe(true);
    expect(prefs.notifPromo).toBe(false);
    expect(next).not.toBe(prefs);
  });
});

describe("setGpsMode", () => {
  test("mengubah mode valid", () => {
    const next = setGpsMode(DEFAULT_PREFS, "akurat");
    expect(next.gpsMode).toBe("akurat");
  });
});
