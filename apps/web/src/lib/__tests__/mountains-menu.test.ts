// Guard menu Gunung + Jalur: item ada di poskoMenus (bukan di set
// referensi dashboardMenus yang wajib sama persis dengan layout acuan),
// halaman menangani activeMenu 'mountains', klien api punya metodenya,
// dan kunci i18n ada di kedua bahasa (parity penuh dijaga
// i18n-menus.test.ts).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { dashboardMenus, poskoMenus } from "../dashboard-menus";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

type DashboardMenus = { menus: Record<string, string> };
const idDashboard = (id as unknown as { dashboard: DashboardMenus }).dashboard;
const enDashboard = (en as unknown as { dashboard: DashboardMenus }).dashboard;

describe("menu Gunung", () => {
  test("poskoMenus memuat mountains dengan labelKey yang resolve", () => {
    const item = poskoMenus.find((m) => m.id === "mountains");
    expect(item).toBeDefined();
    expect(item?.labelKey).toBe("dashboard.menus.mountains");
    expect(idDashboard.menus.mountains).toBe("Gunung");
    expect(enDashboard.menus.mountains).toBe("Mountains");
  });

  test("set referensi dashboardMenus tidak diubah", () => {
    expect(dashboardMenus.some((m) => m.id === "mountains")).toBe(false);
  });

  test("halaman menangani activeMenu mountains", () => {
    const page = read("../../routes/+page.svelte");
    expect(page).toContain("activeMenu === 'mountains'");
    expect(page).toContain("mountainsSnippet()");
    expect(page).toContain("loadMountains()");
  });

  test("klien api punya mountains + mountain", () => {
    const apiSrc = read("../api.ts");
    expect(apiSrc).toContain("'/api/v1/mountains'");
    expect(apiSrc).toContain("`/api/v1/mountains/${id}`");
  });
});
