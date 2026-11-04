// TDD RED — HTML peta Leaflet untuk layar detail jalur: polyline
// track (koordinat [lon, lat] server -> [lat, lon] Leaflet), fallback
// garis lewat checkpoint berurutan bila tidak ada track, marker
// checkpoint berwarna per jenis, dan legenda tiga jenis di dalam peta.
// Struktur mengikuti leafletMapHtml (location-search.ts): tile OSM yang
// sama, tanpa sumber tile baru.
import { describe, expect, test } from "bun:test";

import {
  routeDetailMapHtml,
  type RouteDetailMapCheckpoint,
} from "../utils/route-detail-map-html";

const labels = { post: "Pos", camp: "Titik kemah", peak: "Puncak" };

const checkpoints: RouteDetailMapCheckpoint[] = [
  {
    name: "Basecamp",
    order: 0,
    lat: -7.9,
    lon: 110.1,
    tags: [],
    isTarget: false,
  },
  {
    name: "Puncak",
    order: 1,
    lat: -7.8,
    lon: 110.2,
    tags: ["Peak"],
    isTarget: true,
  },
];

describe("routeDetailMapHtml", () => {
  test("memakai tile OSM yang sama dengan peta lain", () => {
    const html = routeDetailMapHtml({ track: null, checkpoints, labels });
    expect(html).toContain("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(html).toContain("leaflet");
  });

  test("track digambar sebagai polyline (lon/lat dibalik ke lat/lon)", () => {
    const html = routeDetailMapHtml({
      track: [
        [
          [110.1, -7.9],
          [110.2, -7.8],
        ],
      ],
      checkpoints,
      labels,
    });
    expect(html).toContain("L.polyline");
    expect(html).toContain("[-7.9,110.1]");
    expect(html).toContain("[-7.8,110.2]");
  });

  test("tanpa track: garis fallback lewat checkpoint berurutan", () => {
    const html = routeDetailMapHtml({ track: null, checkpoints, labels });
    expect(html).toContain("L.polyline");
    expect(html).toContain("[-7.9,110.1]");
    expect(html).toContain("[-7.8,110.2]");
  });

  test("marker checkpoint memakai warna jenisnya + nama di popup", () => {
    const html = routeDetailMapHtml({ track: null, checkpoints, labels });
    expect(html).toContain("#268c4a");
    expect(html).toContain("#f5c518");
    expect(html).toContain("Basecamp");
    expect(html).toContain("Puncak");
    expect(html).toContain("L.marker");
  });

  test("legenda tiga jenis ada di dalam HTML peta", () => {
    const html = routeDetailMapHtml({ track: null, checkpoints, labels });
    expect(html).toContain("Pos");
    expect(html).toContain("Titik kemah");
    expect(html).toContain("Puncak");
    expect(html).toContain("#f78308");
  });

  test("satu checkpoint saja: tidak ada polyline, marker tetap ada", () => {
    const html = routeDetailMapHtml({
      track: null,
      checkpoints: [checkpoints[0]],
      labels,
    });
    expect(html).toContain("var polylines = []");
    expect(html).toContain("L.marker");
  });

  test("nama checkpoint di-escape (tidak merusak HTML/JS)", () => {
    const html = routeDetailMapHtml({
      track: null,
      checkpoints: [
        { ...checkpoints[0], name: 'Pos "A" <script>' },
      ],
      labels,
    });
    // Nama mentah tidak boleh muncul verbatim di dalam JSON marker.
    expect(html).not.toContain('Pos "A" <script>');
    expect(html).toContain("\\u003cscript\\u003e");
  });
});
