// Guard i18n — aturan repo: ID/EN seimbang bentuknya di setiap PR,
// tanpa string "Tamu"/"Demo" (keputusan 28 Okt 2026: wajib login).
import { describe, expect, test } from "bun:test";

import { en } from "../i18n/en";
import { id } from "../i18n/id";

function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null
      ? keyPaths(value as Record<string, unknown>, path)
      : [path];
  });
}

function stringValues(obj: Record<string, unknown>): string[] {
  return Object.values(obj).flatMap((value) =>
    typeof value === "object" && value !== null
      ? stringValues(value as Record<string, unknown>)
      : typeof value === "string"
        ? [value]
        : [],
  );
}

describe("i18n", () => {
  test("ID dan EN punya kunci yang sama persis", () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(id).sort());
  });

  test("tidak ada string tamu/demo di terjemahan", () => {
    const all = [...stringValues(id), ...stringValues(en)].join(" ");
    expect(/\btamu\b/i.test(all)).toBe(false);
    expect(/\bguest\b/i.test(all)).toBe(false);
    expect(/\bdemo\b/i.test(all)).toBe(false);
  });

  test("label tema terang/gelap ada di kedua bahasa (SET-1)", () => {
    const idSettings = id.settings as Record<string, string>;
    const enSettings = en.settings as Record<string, string>;
    expect(idSettings.themeLight).toBeString();
    expect(idSettings.themeDark).toBeString();
    expect(enSettings.themeLight).toBeString();
    expect(enSettings.themeDark).toBeString();
    // themeNote tidak lagi menjanjikan "menyusul/coming"
    expect(/menyusul|coming/i.test(idSettings.themeNote)).toBe(false);
    expect(/menyusul|coming/i.test(enSettings.themeNote)).toBe(false);
  });

  test("placeholder {identifier} ada di kedua bahasa (OTP)", () => {
    expect(id.auth.otpIntro).toContain("{identifier}");
    expect(en.auth.otpIntro).toContain("{identifier}");
  });

  test("ringkasan peta memakai placeholder anggota dan SOS di kedua bahasa", () => {
    const idSummary = (id.tracking as Record<string, string>).mapSummary;
    const enSummary = (en.tracking as Record<string, string>).mapSummary;
    expect(idSummary).toContain("{members}");
    expect(idSummary).toContain("{sos}");
    expect(enSummary).toContain("{members}");
    expect(enSummary).toContain("{sos}");
  });
});
