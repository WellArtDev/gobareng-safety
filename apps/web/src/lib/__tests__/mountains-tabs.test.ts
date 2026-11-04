// Guard tab Gunung/Jalur di dashboard admin: tab Gunung menampilkan tabel
// yang sudah ada, tab Jalur menampilkan jalur per gunung (diambil lewat
// GET /mountains/:id/routes, jadi jumlah jalur per gunung selalu sama
// dengan jalur yang di-assign ke gunung itu). Tanpa peta dulu — peta
// ikut jalur menyusul setelah ada data track GPS.
// Kunci i18n baru wajib ada di kedua bahasa (parity dijaga
// i18n-menus.test.ts).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { en } from "../i18n/en";
import { id } from "../i18n/id";

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

type Dashboard = { dashboard: Record<string, unknown> };
const idD = (id as unknown as Dashboard).dashboard;
const enD = (en as unknown as Dashboard).dashboard;

const KEYS = [
  "mountainsTabMountains",
  "mountainsTabRoutes",
  "mountainsRoutesAll",
  "mountainsRoutesMountain",
  "mountainsRoutesName",
  "mountainsRoutesMeetingPoint",
  "mountainsRoutesDistance",
  "mountainsRoutesGain",
  "mountainsRoutesEst",
  "mountainsRoutesEmpty",
] as const;

describe("tab Gunung/Jalur", () => {
  test("kunci i18n tab + tabel jalur ada di id + en", () => {
    for (const k of KEYS) {
      expect(idD[k]).toBeDefined();
      expect(enD[k]).toBeDefined();
      expect(typeof idD[k]).toBe("string");
      expect(typeof enD[k]).toBe("string");
    }
  });

  test("halaman punya state tab + pemuat jalur per gunung + filter gunung", () => {
    const page = read("../../routes/+page.svelte");
    expect(page).toContain("mountainsTab");
    expect(page).toContain("mountainsTabRoutes");
    expect(page).toContain("loadMountainRoutes");
    expect(page).toContain("mountainsRoutesById");
    expect(page).toContain("mountainsRoutesFilter");
    expect(page).toContain("filteredMountainRoutes");
    expect(page).toContain("mountainsRoutesAll");
    expect(page).toContain("mountainsRoutesEmpty");
  });

  test("klien api punya mountainRoutes ke GET /mountains/:id/routes", () => {
    const apiSrc = read("../api.ts");
    expect(apiSrc).toContain("mountainRoutes");
    expect(apiSrc).toContain("/routes");
    expect(apiSrc).toContain("MountainRoute");
  });

  test("tabel jalur menampilkan gunung penugasan + detail jalur", () => {
    const page = read("../../routes/+page.svelte");
    expect(page).toContain("mountainsRoutesMountain");
    expect(page).toContain("mountainsRoutesName");
    expect(page).toContain("mountainsRoutesMeetingPoint");
    expect(page).toContain("mountainsRoutesDistance");
    expect(page).toContain("mountainsRoutesGain");
    expect(page).toContain("mountainsRoutesEst");
    expect(page).toContain("route.meetingPoint");
    expect(page).toContain("route.distanceKm");
    expect(page).toContain("route.gainM");
    expect(page).toContain("route.estHours");
  });
});
