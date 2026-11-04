// TDD — impor katalog MDPL SHIFTED saja (Wella, 1 Nov 2026).
// Tes ini membaca file ringkas yang di-commit + membandingkannya
// dengan sumber shifted (bukan converted) untuk satu sampel Prau —
// bukti bahwa koordinat yang diimpor = shifted, bukan asli MDPL.
// Catatan: tes TIDAK mengimpor apa pun dari converted/ ke aplikasi;
// converted/ hanya dibaca di sini sebagai pembanding negatif.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  estHoursFromDistance,
  gainFromTrack,
  loadMdplCatalog,
  provinceLabel,
  slugifyName,
} from "../mdpl-import.js";

const SHIFTED =
  "/home/hatch/workspace/rea-mdpl/api-data/converted-shifted/gunung-prau/routes.geojson";
const ORIGINAL =
  "/home/hatch/workspace/rea-mdpl/api-data/converted/gunung-prau/routes.geojson";

describe("parse katalog MDPL shifted", () => {
  test("125 destinasi, 305 rute", () => {
    const { mountains, totalRoutes } = loadMdplCatalog();
    expect(mountains).toHaveLength(125);
    expect(totalRoutes).toBe(305);
  });

  test("Prau: 8 rute, nama Indonesia, provinsi, elevasi", () => {
    const { mountains } = loadMdplCatalog();
    const prau = mountains.find((m) => m.name === "Gunung Prau");
    expect(prau).toBeDefined();
    expect(prau!.id).toBe("gunung-prau");
    expect(prau!.elevationM).toBe(2565);
    expect(prau!.province).toBe("Jawa Tengah");
    expect(prau!.routes).toHaveLength(8);
    expect(prau!.routes.map((r) => r.name)).toContain("Jalur Campurejo");
  });

  test("koordinat impor = shifted (bukan asli) untuk sampel Prau", () => {
    const { mountains } = loadMdplCatalog();
    const prau = mountains.find((m) => m.name === "Gunung Prau")!;
    const campurejo = prau.routes.find((r) => r.name === "Jalur Campurejo")!;
    const shifted = JSON.parse(readFileSync(SHIFTED, "utf8"));
    const original = JSON.parse(readFileSync(ORIGINAL, "utf8"));
    const shiftedFirst = shifted.features.find(
      (f: { properties: { name: string } }) => f.properties.name === "Jalur Campurejo",
    ).geometry.coordinates[0][0];
    const originalFirst = original.features.find(
      (f: { properties: { name: string } }) => f.properties.name === "Jalur Campurejo",
    ).geometry.coordinates[0][0];
    const importedFirst = campurejo.track[0][0];
    // Dibulatkan 5 desimal di file ringkas: toleransi 2e-5 derajat.
    expect(Math.abs(importedFirst[0] - shiftedFirst[0])).toBeLessThan(2e-5);
    expect(Math.abs(importedFirst[1] - shiftedFirst[1])).toBeLessThan(2e-5);
    // Dan jelas BERBEDA dari koordinat asli (geseran 15-30 m).
    const distM = (a: number[], b: number[]) =>
      Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 110540);
    expect(distM(importedFirst, originalFirst)).toBeGreaterThan(10);
  });

  test("tidak ada imageUrl Firebase MDPL; hanya Wiki Slamet/Cikuray", () => {
    const { mountains } = loadMdplCatalog();
    for (const m of mountains) {
      expect(m.imageUrl ?? "").not.toContain("firebasestorage");
      expect(m.imageUrl ?? "").not.toContain("mdpl");
    }
    const slamet = mountains.find((m) => m.name === "Gunung Slamet")!;
    const cikuray = mountains.find((m) => m.name === "Gunung Cikuray")!;
    expect(slamet.imageUrl).toContain("upload.wikimedia.org");
    expect(cikuray.imageUrl).toContain("upload.wikimedia.org");
    const prau = mountains.find((m) => m.name === "Gunung Prau")!;
    expect(prau.imageUrl).toBeNull();
  });

  test("checkpoint: auto_checkpoint dipertahankan, urutan elevasi menaik", () => {
    const { mountains } = loadMdplCatalog();
    const prau = mountains.find((m) => m.name === "Gunung Prau")!;
    const campurejo = prau.routes.find((r) => r.name === "Jalur Campurejo")!;
    expect(campurejo.checkpoints.length).toBeGreaterThan(0);
    expect(campurejo.checkpoints.some((c) => c.autoCheckpoint)).toBe(true);
    const elevs = campurejo.checkpoints
      .map((c) => c.elevationM)
      .filter((e): e is number => e !== null);
    const sorted = [...elevs].sort((a, b) => a - b);
    expect(elevs).toEqual(sorted);
  });

  test("gain dari track, estimasi dari jarak (turunan, bukan data MDPL)", () => {
    expect(gainFromTrack([[[0, 0, 100], [0, 0, 350]]])).toBe(250);
    expect(gainFromTrack([])).toBeNull();
    expect(estHoursFromDistance(9.44)).toBe(4.7);
    expect(estHoursFromDistance(null)).toBeNull();
  });

  test("slug + label provinsi", () => {
    expect(slugifyName("Gunung Prau")).toBe("gunung-prau");
    expect(provinceLabel("JawaTengah")).toBe("Jawa Tengah");
    expect(provinceLabel("NTT")).toBe("NTT");
  });
});
