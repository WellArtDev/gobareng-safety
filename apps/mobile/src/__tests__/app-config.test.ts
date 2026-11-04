// Branding app: nama tampil GoBareng + icon/splash dari pin logo resmi.
// Slug & package sengaja TIDAK diubah agar app terinstall tetap sama.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

// fileURLToPath + join: pathname URL mentah ("/C:/...") membuat
// existsSync gagal di Windows — path FS asli selalu benar.
const appDir = dirname(
  fileURLToPath(new URL("../../package.json", import.meta.url)),
);
const config = JSON.parse(
  readFileSync(new URL("../../app.json", import.meta.url), "utf8"),
).expo;

describe("app branding", () => {
  test("nama tampil = GoBareng", () => {
    expect(config.name).toBe("GoBareng");
  });

  test("slug & package tetap (kontinuitas install/EAS)", () => {
    expect(config.slug).toBe("gobareng-safety");
    expect(config.android.package).toBe("app.gobareng.safety");
  });

  test("icon + splash + adaptive icon terpasang & file ada", () => {
    expect(config.icon).toBe("./assets/icon.png");
    expect(config.splash.image).toBe("./assets/splash.png");
    expect(config.splash.resizeMode).toBe("contain");
    expect(config.splash.backgroundColor).toBe("#ffffff");
    expect(config.android.adaptiveIcon.foregroundImage).toBe(
      "./assets/adaptive-icon.png",
    );
    expect(config.android.adaptiveIcon.backgroundColor).toBe("#ffffff");
    for (const f of [
      "assets/icon.png",
      "assets/splash.png",
      "assets/adaptive-icon.png",
    ]) {
      expect(existsSync(join(appDir, f))).toBe(true);
    }
  });
});
