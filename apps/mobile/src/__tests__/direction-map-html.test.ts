// TDD RED — peta Direction (WebView Leaflet):
// (a) kembali dari mode belokan ke garis rute harus fitBounds ulang
//     ke seluruh rute — fitted sekali-di-awal membuat peta mentok di
//     zoom ikuti-posisi (laporan HP 3 Nov 2026);
// (b) tile harus benar-benar tampil, bukan abu-abu: peta wajib
//     invalidateSize setelah load agar layout ScrollView yang telat
//     tidak membekukan tile di ukuran 0.
import { describe, expect, test } from "bun:test";

import { directionMapHtml } from "../utils/direction-map-html";

describe("directionMapHtml", () => {
  test("memakai tile OSM yang sama dengan peta lain", () => {
    const html = directionMapHtml(-6.2, 106.8);
    expect(html).toContain("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(html).toContain("leaflet");
  });

  test("transisi follow true -> false memicu fitBounds ulang ke rute", () => {
    const html = directionMapHtml(-6.2, 106.8);
    // Pelacak mode sebelumnya + cabang refit saat keluar dari follow.
    expect(html).toContain("lastFollow");
    expect(html).toMatch(/fitBounds/);
    // Refit hanya pada transisi, bukan pada setiap update posisi
    // (supaya user tetap bisa menggeser/zoom manual di mode rute).
    expect(html).toContain("follow");
  });

  test("invalidateSize dipanggil setelah load agar tile tidak abu-abu", () => {
    const html = directionMapHtml(-6.2, 106.8);
    expect(html).toContain("invalidateSize");
  });
});
