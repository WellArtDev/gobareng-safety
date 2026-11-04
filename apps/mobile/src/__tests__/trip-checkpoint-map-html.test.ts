// TDD RED — peta checkpoint detail trip (pengganti daftar link
// "lat, lon ›"): gaya peta detail jalur PR #199 — marker berwarna
// per jenis, legenda, kontrol zoom Leaflet, toggle Standar/Satelit,
// dan ketuk marker mengirim pesan pilih ke React Native (bukan
// membuka Direction langsung). Panel nama + koordinat + tombol
// Direction dirender RN di bawah peta, bukan di HTML ini.
import { describe, expect, test } from "bun:test";

import {
  tripCheckpointKindFromName,
  tripCheckpointMapHtml,
  type TripCheckpointMapPoint,
} from "../utils/trip-checkpoint-map-html";

const labels = { post: "Pos", camp: "Titik kemah", peak: "Puncak" };
const points: TripCheckpointMapPoint[] = [
  { name: "Basecamp", lat: -6.9, lon: 106.9, kind: "post" },
  { name: "Puncak", lat: -6.8, lon: 106.8, kind: "peak" },
];

describe("tripCheckpointKindFromName", () => {
  test("Puncak -> peak, Kemah -> camp, sisanya post", () => {
    expect(tripCheckpointKindFromName("Puncak Pangrango")).toBe("peak");
    expect(tripCheckpointKindFromName("Titik Kemah")).toBe("camp");
    expect(tripCheckpointKindFromName("Pos 1")).toBe("post");
  });
});

describe("tripCheckpointMapHtml", () => {
  test("marker berwarna per jenis + legenda", () => {
    const html = tripCheckpointMapHtml({ points, labels });
    expect(html).toContain("#268c4a");
    expect(html).toContain("#f5c518");
    expect(html).toContain("Pos");
    expect(html).toContain("Puncak");
  });

  test("kontrol zoom Leaflet aktif (zoomControl tidak dimatikan)", () => {
    const html = tripCheckpointMapHtml({ points, labels });
    expect(html).not.toContain("zoomControl: false");
    expect(html).toContain("L.map");
  });

  test("ada layer satelit + pengalih Standar/Satelit", () => {
    const html = tripCheckpointMapHtml({ points, labels });
    expect(html).toContain("tile.openstreetmap.org");
    expect(html).toContain("World_Imagery");
    expect(html).toContain("setTileStyle");
  });

  test("ketuk marker mengirim pesan select ke React Native", () => {
    const html = tripCheckpointMapHtml({ points, labels });
    expect(html).toContain("ReactNativeWebView.postMessage");
    expect(html).toContain("select");
  });

  test("tidak ada teks koordinat bergaya link di HTML peta", () => {
    const html = tripCheckpointMapHtml({ points, labels });
    // Koordinat hanya ada sebagai data marker (angka di JSON),
    // bukan sebagai baris teks "lat, lon ›" yang bisa diketuk.
    expect(html).not.toContain("›");
  });
});
