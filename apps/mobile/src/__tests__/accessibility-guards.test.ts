import { describe, expect, test } from "bun:test";

import {
  alertAccessibility,
  announcementAccessibility,
  buttonAccessibility,
  cardAccessibility,
  decorativeAccessibility,
  headingAccessibility,
  groupAccessibility,
  linkAccessibility,
  minimumTouchTarget,
  selectableButtonAccessibility,
  shouldAnnounceForAccessibility,
  switchAccessibility,
  tabAccessibility,
  summaryAccessibility,
} from "../utils/accessibility";

describe("shared accessibility descriptors", () => {
  test("busy buttons expose their name, role, hint, and disabled state", () => {
    expect(
      buttonAccessibility("Masuk", {
        busy: true,
        disabled: true,
        hint: "Membuka beranda",
      }),
    ).toEqual({
      accessibilityRole: "button",
      accessibilityLabel: "Masuk",
      accessibilityHint: "Membuka beranda",
      accessibilityState: { busy: true, disabled: true },
    });
  });

  test("tabs expose which destination is selected", () => {
    expect(tabAccessibility("Beranda", true)).toEqual({
      accessibilityRole: "tab",
      accessibilityLabel: "Beranda",
      accessibilityState: { selected: true },
    });
  });

  test("trip cards only become one button when actionable", () => {
    expect(cardAccessibility("Pendakian Prau", "Buka detail trip", true)).toEqual({
      accessible: true,
      accessibilityRole: "button",
      accessibilityLabel: "Pendakian Prau",
      accessibilityHint: "Buka detail trip",
    });
    expect(cardAccessibility("Pendakian Prau", "Buka detail trip", false)).toEqual({
      accessible: false,
    });
  });

  test("links and decorative content use distinct semantics", () => {
    expect(linkAccessibility("Daftar")).toEqual({
      accessibilityRole: "link",
      accessibilityLabel: "Daftar",
    });
    expect(decorativeAccessibility).toEqual({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: "no",
    });
  });

  test("shared touch targets are at least 44 by 44 points", () => {
    expect(minimumTouchTarget).toEqual({ minHeight: 44, minWidth: 44 });
  });
});

describe("primary screen accessibility descriptors", () => {
  test("screen titles are navigable headings with an explicit name", () => {
    expect(headingAccessibility("Detail Trip")).toEqual({
      accessible: true,
      accessibilityRole: "header",
      accessibilityLabel: "Detail Trip",
    });
  });

  test("errors interrupt the screen reader with the current message", () => {
    expect(alertAccessibility("Server tidak terjangkau")).toEqual({
      accessible: true,
      accessibilityRole: "alert",
      accessibilityLabel: "Server tidak terjangkau",
      accessibilityLiveRegion: "assertive",
    });
  });

  test("start actions expose busy and disabled state together", () => {
    expect(
      buttonAccessibility("Mulai Trip", { busy: true, disabled: true }),
    ).toEqual({
      accessibilityRole: "button",
      accessibilityLabel: "Mulai Trip",
      accessibilityState: { busy: true, disabled: true },
    });
  });
});

describe("live tracking accessibility descriptors", () => {
  test("live map exposes one localized summary instead of visual markers", () => {
    expect(
      summaryAccessibility("Peta live. 4 anggota terlacak, 1 SOS aktif."),
    ).toEqual({
      accessible: true,
      accessibilityRole: "summary",
      accessibilityLabel: "Peta live. 4 anggota terlacak, 1 SOS aktif.",
    });
  });

  test("tracking statistics expose their label and value as one group", () => {
    expect(groupAccessibility("Jarak tempuh: 2,4 km")).toEqual({
      accessible: true,
      accessibilityLabel: "Jarak tempuh: 2,4 km",
    });
  });
});

describe("SOS accessibility descriptors", () => {
  test("SOS reasons expose the selected state", () => {
    expect(selectableButtonAccessibility("Cedera", true)).toEqual({
      accessibilityRole: "button",
      accessibilityLabel: "Cedera",
      accessibilityState: { selected: true },
    });
  });

  test("SOS success is announced politely as one message", () => {
    expect(announcementAccessibility("SOS terkirim", "polite")).toEqual({
      accessible: true,
      accessibilityLabel: "SOS terkirim",
      accessibilityLiveRegion: "polite",
    });
  });

  test("emergency tools expose switch state", () => {
    expect(switchAccessibility("Suara minta tolong", true)).toEqual({
      accessibilityRole: "switch",
      accessibilityLabel: "Suara minta tolong",
      accessibilityState: { checked: true },
    });
  });
});

describe("iOS accessibility announcements", () => {
  test("announces only a new non-empty message on iOS", () => {
    expect(shouldAnnounceForAccessibility(null, "Server gagal", true)).toBe(true);
    expect(
      shouldAnnounceForAccessibility("Server gagal", "Server gagal", true),
    ).toBe(false);
    expect(shouldAnnounceForAccessibility(null, null, true)).toBe(false);
    expect(shouldAnnounceForAccessibility(null, "Server gagal", false)).toBe(false);
  });
});
