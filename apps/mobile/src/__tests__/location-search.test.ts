// TDD RED — cari lokasi touring (Nominatim): parsing hasil, query kosong,
// dan HTML peta Leaflet.
import { afterEach, describe, expect, test } from "bun:test";

import {
  formatCoords,
  leafletMapHtml,
  parseLocationResults,
  resolvePickedName,
  searchLocations,
  searchLocationsDetailed,
} from "../utils/location-search";

const realFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("parseLocationResults", () => {
  test("hasil valid dipetakan ke nama + koordinat", () => {
    expect(
      parseLocationResults([
        {
          display_name: "Puncak, Bogor, Jawa Barat",
          lat: "-6.7",
          lon: "106.9",
        },
        { display_name: "Lembang, Bandung Barat", lat: -6.8, lon: 107.6 },
      ]),
    ).toEqual([
      { name: "Puncak, Bogor, Jawa Barat", lat: -6.7, lon: 106.9 },
      { name: "Lembang, Bandung Barat", lat: -6.8, lon: 107.6 },
    ]);
  });

  test("entri rusak dilewati, bukan crash", () => {
    expect(
      parseLocationResults([
        { display_name: "", lat: "-6.7", lon: "106.9" },
        { display_name: "Tanpa koordinat" },
        { display_name: "Koordinat aneh", lat: "xx", lon: "106.9" },
        null,
        "bukan-objek",
        { display_name: "Anyer, Banten", lat: "-6.0", lon: "105.9" },
      ]),
    ).toEqual([{ name: "Anyer, Banten", lat: -6.0, lon: 105.9 }]);
  });

  test("bukan array -> []", () => {
    expect(parseLocationResults(null)).toEqual([]);
    expect(parseLocationResults({})).toEqual([]);
    expect(parseLocationResults("teks")).toEqual([]);
  });
});

describe("searchLocations", () => {
  test("query kosong -> [] tanpa fetch", async () => {
    await expect(searchLocations("   ")).resolves.toEqual([]);
  });

  test("server tidak OK -> [] (perilaku lama dipertahankan)", async () => {
    mockFetch(429, { error: "rate limited" });
    await expect(searchLocations("Prau")).resolves.toEqual([]);
  });
});

describe("searchLocationsDetailed", () => {
  test("hasil OK -> failed false + hasil terparsing", async () => {
    mockFetch(200, [
      { display_name: "Prau, Wonosobo", lat: "-7.2", lon: "109.9" },
    ]);
    await expect(searchLocationsDetailed("Prau")).resolves.toEqual({
      results: [{ name: "Prau, Wonosobo", lat: -7.2, lon: 109.9 }],
      failed: false,
    });
  });

  test("hasil OK kosong -> failed false (bedakan dari gagal)", async () => {
    mockFetch(200, []);
    await expect(searchLocationsDetailed("Xyzqq")).resolves.toEqual({
      results: [],
      failed: false,
    });
  });

  test("server tidak OK -> failed true", async () => {
    mockFetch(429, { error: "rate limited" });
    await expect(searchLocationsDetailed("Prau")).resolves.toEqual({
      results: [],
      failed: true,
    });
  });

  test("fetch melempar -> failed true", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(searchLocationsDetailed("Prau")).resolves.toEqual({
      results: [],
      failed: true,
    });
  });

  test("query kosong -> failed false tanpa fetch", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("must not fetch");
    }) as typeof fetch;
    await expect(searchLocationsDetailed("   ")).resolves.toEqual({
      results: [],
      failed: false,
    });
    expect(called).toBe(false);
  });
});

describe("formatCoords / resolvePickedName", () => {
  test("formatCoords memakai 5 desimal", () => {
    expect(formatCoords(-6.334923, 106.782514)).toBe("-6.33492, 106.78251");
  });

  test("resolvePickedName memakai nama reverse-geocode bila ada", () => {
    expect(resolvePickedName("Warjok, Jakarta", -6.33, 106.78)).toBe(
      "Warjok, Jakarta",
    );
  });

  test("resolvePickedName fallback ke koordinat mentah bila null", () => {
    expect(resolvePickedName(null, -6.334923, 106.782514)).toBe(
      "-6.33492, 106.78251",
    );
  });
});

describe("leafletMapHtml", () => {
  test("memuat koordinat awal + handler setMapPin + postMessage", () => {
    const html = leafletMapHtml(-6.7, 106.9);
    expect(html).toContain("setView([-6.7, 106.9]");
    expect(html).toContain("window.setMapPin");
    expect(html).toContain("ReactNativeWebView.postMessage");
    expect(html).toContain("tile.openstreetmap.org");
  });

  test("zoom awal memakai parameter zoom yang diteruskan", () => {
    expect(leafletMapHtml(-6.7, 106.9, 12)).toContain(
      "setView([-6.7, 106.9], 12)",
    );
  });

  test("setMapPin TIDAK hardcode zoom: pindah pin tanpa menyentuh zoom aktif", () => {
    const html = leafletMapHtml(-6.7, 106.9, 12);
    // Dulu: map.setView([la, lo], 14) — tiap pilihan berubah, zoom jalan
    // yang sudah diatur pengguna dipaksa kembali ke 14.
    expect(html).not.toContain("setView([la, lo], 14)");
    expect(html).toContain("panTo([la, lo])");
    expect(html).toContain("marker.setLatLng([la, lo])");
  });
});
