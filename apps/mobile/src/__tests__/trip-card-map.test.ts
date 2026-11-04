// TDD RED — peta tujuan di header kartu trip: pusat peta dipilih dari
// data kartu yang sudah ada (tujuan touring dulu, lalu titik kumpul);
// tanpa koordinat valid -> null (kartu tetap warna kategori).
// Tile OSM dihitung dari pusat (Web Mercator) supaya header memakai
// satu gambar tile biasa, tanpa WebView per kartu dan tanpa layanan
// peta statis eksternal (staticmap.openstreetmap.de sudah discontinue).
// Tile dikirim bersama User-Agent pengenal (kebijakan tile usage OSM);
// CARTO ditinggalkan karena sejak 3 Nov 2026 mengembalikan watermark
// "API KEY REQUIRED" untuk pola URL gratisnya.
import { describe, expect, test } from "bun:test";

import {
  TRIP_CARD_MAP_ATTRIBUTION,
  TRIP_CARD_TILE_USER_AGENT,
  resolveTripCardHeader,
  tripCardMapCenter,
  tripCardTile,
  tripCardTileSource,
} from "../utils/trip-card-map";
import type { Trip } from "../utils/trips-api";

function trip(partial: Partial<Trip>): Trip {
  return {
    id: "trip-1",
    name: "ke warjok",
    type: "TOURING",
    date: "2026-11-03",
    meetingPoint: "Titik kumpul",
    meetingLat: null,
    meetingLon: null,
    quota: 10,
    isOpenTrip: false,
    price: null,
    status: "PLANNED",
    leaderId: "user-1",
    createdAt: "2026-11-02",
    ...partial,
  };
}

describe("tripCardMapCenter", () => {
  test("touring: tujuan menang atas titik kumpul", () => {
    expect(
      tripCardMapCenter(
        trip({
          destinationLat: -6.33492,
          destinationLon: 106.78251,
          meetingLat: -6.2,
          meetingLon: 106.8,
        }),
      ),
    ).toEqual({ lat: -6.33492, lon: 106.78251, source: "destination" });
  });

  test("touring tanpa tujuan valid -> titik kumpul", () => {
    expect(
      tripCardMapCenter(
        trip({
          destinationLat: null,
          destinationLon: null,
          meetingLat: -6.33492,
          meetingLon: 106.78251,
        }),
      ),
    ).toEqual({ lat: -6.33492, lon: 106.78251, source: "meeting" });
  });

  test("tujuan 0,0 dianggap tidak ada -> titik kumpul", () => {
    expect(
      tripCardMapCenter(
        trip({
          destinationLat: 0,
          destinationLon: 0,
          meetingLat: -6.33492,
          meetingLon: 106.78251,
        }),
      ),
    ).toEqual({ lat: -6.33492, lon: 106.78251, source: "meeting" });
  });

  test("hiking: pakai titik kumpul", () => {
    expect(
      tripCardMapCenter(
        trip({ type: "HIKING", meetingLat: -7.2, meetingLon: 109.9 }),
      ),
    ).toEqual({ lat: -7.2, lon: 109.9, source: "meeting" });
  });

  test("tanpa koordinat sama sekali -> null", () => {
    expect(tripCardMapCenter(trip({}))).toBeNull();
  });

  test("koordinat di luar rentang -> null", () => {
    expect(
      tripCardMapCenter(
        trip({ destinationLat: 91, destinationLon: 106, meetingLat: -6, meetingLon: 181 }),
      ),
    ).toBeNull();
  });

  test("titik kumpul 0,0 tanpa tujuan -> null", () => {
    expect(
      tripCardMapCenter(trip({ meetingLat: 0, meetingLon: 0 })),
    ).toBeNull();
  });
});

describe("tripCardTile", () => {
  test("titik nol zoom 1 -> tile 1/1, fraksi 0", () => {
    expect(tripCardTile({ lat: 0, lon: 0 }, 1)).toEqual({
      url: "https://tile.openstreetmap.org/1/1/1.png",
      fracX: 0,
      fracY: 0,
    });
  });

  test("titik nol zoom 14 -> tile 8192/8192", () => {
    expect(tripCardTile({ lat: 0, lon: 0 }, 14)).toEqual({
      url: "https://tile.openstreetmap.org/14/8192/8192.png",
      fracX: 0,
      fracY: 0,
    });
  });

  test("koordinat Warjok zoom 14 -> tile 13051/8480 + fraksi", () => {
    const tile = tripCardTile({ lat: -6.33492, lon: 106.78251 }, 14);
    expect(tile?.url).toBe(
      "https://tile.openstreetmap.org/14/13051/8480.png",
    );
    expect(tile?.fracX).toBeCloseTo(0.7907, 4);
    expect(tile?.fracY).toBeCloseTo(0.8985, 4);
  });

  test("fraksi selalu dalam [0, 1)", () => {
    const tile = tripCardTile({ lat: -7.2021881, lon: 109.9354561 }, 14);
    expect(tile?.url).toBe(
      "https://tile.openstreetmap.org/14/13195/8520.png",
    );
    expect(tile!.fracX).toBeGreaterThanOrEqual(0);
    expect(tile!.fracX).toBeLessThan(1);
    expect(tile!.fracY).toBeGreaterThanOrEqual(0);
    expect(tile!.fracY).toBeLessThan(1);
  });
});

describe("resolveTripCardHeader", () => {
  const withCenter = trip({
    destinationLat: -6.33492,
    destinationLon: 106.78251,
  });

  test("foto menang atas peta", () => {
    const header = resolveTripCardHeader({
      trip: withCenter,
      photoUri: "https://example.com/foto.jpg",
      expired: false,
      mapFailed: false,
    });
    expect(header.kind).toBe("photo");
    expect(header.tile).toBeNull();
  });

  test("ada pusat + tidak expired + tidak gagal -> peta + tile", () => {
    const header = resolveTripCardHeader({
      trip: withCenter,
      expired: false,
      mapFailed: false,
    });
    expect(header.kind).toBe("map");
    expect(header.tile?.url).toBe(
      "https://tile.openstreetmap.org/14/13051/8480.png",
    );
  });

  test("expired -> logo, bukan peta", () => {
    const header = resolveTripCardHeader({
      trip: withCenter,
      expired: true,
      mapFailed: false,
    });
    expect(header.kind).toBe("logo");
    expect(header.tile).toBeNull();
  });

  test("tile gagal dimuat -> logo", () => {
    const header = resolveTripCardHeader({
      trip: withCenter,
      expired: false,
      mapFailed: true,
    });
    expect(header.kind).toBe("logo");
    expect(header.tile).toBeNull();
  });

  test("tanpa pusat -> logo", () => {
    const header = resolveTripCardHeader({
      trip: trip({}),
      expired: false,
      mapFailed: false,
    });
    expect(header.kind).toBe("logo");
    expect(header.tile).toBeNull();
  });
});

describe("tripCardTile source", () => {
  test("tile berasal dari tile.openstreetmap.org, bukan CARTO", () => {
    const tile = tripCardTile({ lat: -6.33492, lon: 106.78251 }, 14);
    expect(tile?.url).toMatch(/^https:\/\/tile\.openstreetmap\.org\//);
    expect(tile?.url).not.toContain("cartocdn");
  });

  test("source tile membawa User-Agent pengenal GoBareng", () => {
    const tile = tripCardTile({ lat: -6.33492, lon: 106.78251 }, 14);
    expect(tile).not.toBeNull();
    const source = tripCardTileSource(tile!);
    expect(source.uri).toBe(tile!.url);
    expect(source.headers["User-Agent"]).toBe(TRIP_CARD_TILE_USER_AGENT);
    expect(source.headers["User-Agent"]).toContain("GoBareng");
    // Delegasi ke ./osm-tiles: cacheKey eksplisit berpenanda versi,
    // berbeda dari URI polos (kunci default lama) supaya tile blokir
    // yang ter-cache tidak dipakai lagi.
    expect(source.cacheKey).not.toBe(tile!.url);
    expect(source.cacheKey).toContain("osm-tile-");
  });

  test("kredit hanya menyebut OpenStreetMap, tanpa CARTO", () => {
    expect(TRIP_CARD_MAP_ATTRIBUTION).toBe("© OpenStreetMap contributors");
    expect(TRIP_CARD_MAP_ATTRIBUTION).not.toContain("CARTO");
  });
});
