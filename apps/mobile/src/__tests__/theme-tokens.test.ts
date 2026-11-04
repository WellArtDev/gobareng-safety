// TDD RED — SET-1 dark mode: paritas kunci colors vs colorsDark,
// nilai palet dark mengikuti mockup :root[data-theme="dark"].
import { describe, expect, test } from "bun:test";

import { colors, colorsDark } from "../theme/tokens";

describe("colorsDark", () => {
  test("kunci colorsDark sama persis dengan colors", () => {
    expect(Object.keys(colorsDark).sort()).toEqual(
      Object.keys(colors).sort(),
    );
  });

  test("semua nilai berupa hex valid", () => {
    for (const value of Object.values(colorsDark)) {
      expect(value).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });

  test("permukaan inti mengikuti mockup dark", () => {
    expect(colorsDark.bg).toBe("#0d151b");
    expect(colorsDark.surface).toBe("#16222b");
    expect(colorsDark.surface2).toBe("#1d2c37");
    expect(colorsDark.text).toBe("#eef4f7");
    expect(colorsDark.text2).toBe("#a7b8c1");
    expect(colorsDark.text3).toBe("#6e828d");
    expect(colorsDark.line).toBe("#26363f");
  });

  test("bg kategori & status mengikuti mockup dark", () => {
    expect(colorsDark.primarySoft).toBe("#123526");
    expect(colorsDark.catPendakianBg).toBe("#123526");
    expect(colorsDark.catTouringBg).toBe("#3a2410");
    expect(colorsDark.catOpenBg).toBe("#16294d");
    expect(colorsDark.catPrivateBg).toBe("#2d1c52");
    expect(colorsDark.successBg).toBe("#123526");
    expect(colorsDark.warningBg).toBe("#3a2a10");
    expect(colorsDark.goldBg).toBe("#3a2f10");
  });

  test("warna aksen/status tetap sama (mockup tidak menimpanya)", () => {
    expect(colorsDark.primary).toBe(colors.primary);
    expect(colorsDark.danger).toBe(colors.danger);
    expect(colorsDark.stSos).toBe(colors.stSos);
  });
});
