// Guard pagination tabel Gunung/Jalur: 10 baris per halaman, bukan
// scroll panjang. Statistik jalur null (impor katalog) dirender strip,
// bukan 0. Kunci i18n baru wajib ada di kedua bahasa.
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
  "mountainsPagePrev",
  "mountainsPageNext",
  "mountainsPage",
  "mountainsDifficultyUnknown",
] as const;

describe("pagination tabel Gunung/Jalur", () => {
  test("kunci i18n pager + kesulitan belum ditentukan ada di id + en", () => {
    for (const k of KEYS) {
      expect(idD[k]).toBeDefined();
      expect(enD[k]).toBeDefined();
      expect(typeof idD[k]).toBe("string");
      expect(typeof enD[k]).toBe("string");
    }
  });

  test("halaman punya state pager 10 baris + slice + reset + clamp", () => {
    const page = read("../../routes/+page.svelte");
    expect(page).toContain("mountainsPageSize = 10");
    expect(page).toContain("pagedMountains");
    expect(page).toContain("pagedMountainRoutes");
    expect(page).toContain("mountainsPageCount");
    expect(page).toContain("mountainsRoutesPageCount");
    expect(page).toContain("mountains-pager");
    expect(page).toContain("mountainsPagePrev");
    expect(page).toContain("mountainsPageNext");
    // Reset ke halaman 1 saat search/tab/filter berubah.
    expect(page).toContain("mountainsPage = 1");
    expect(page).toContain("mountainsRoutesPage = 1");
    // Tabel memakai hasil paging, bukan daftar penuh.
    expect(page).toContain("{#each pagedMountains as mountain");
    expect(page).toContain("{#each pagedMountainRoutes as { mountain, route }");
  });

  test("statistik jalur null dirender strip, bukan 0", () => {
    const page = read("../../routes/+page.svelte");
    expect(page).toContain("route.distanceKm ?? '—'");
    expect(page).toContain("route.gainM ?? '—'");
    expect(page).toContain("route.estHours ?? '—'");
  });

  test("kesulitan kosong dirender label belum ditentukan + opsi di popup", () => {
    const page = read("../../routes/+page.svelte");
    expect(page).toContain("mountainsDifficultyUnknown");
    expect(page).toContain('<option value="">');
  });
});
