// Sumber tile OSM bersama (dipakai LiveMap + kartu trip).
//
// Alasan modul ini ada: OSM menolak permintaan tile tanpa User-Agent
// pengenal aplikasi dengan tile "Access blocked" 403 — persis yang
// tampil di HP nyata pada peta live 3 Nov 2026. LiveMap lama memakai
// RN Image tanpa header; kartu trip sudah diperbaiki di PR #164.
// Modul ini menyatukan keduanya: satu nilai User-Agent + satu cara
// membangun source expo-image, supaya tidak ada lagi jalur tile OSM
// tanpa header di aplikasi ini.
import { describe, expect, test } from "bun:test";

import {
  OSM_TILE_CACHE_VERSION,
  OSM_TILE_USER_AGENT,
  osmTileCacheKey,
  osmTileSource,
  osmTileUrl,
} from "../utils/osm-tiles";

describe("osmTileUrl", () => {
  test("format URL tile OSM z/x/y", () => {
    expect(osmTileUrl(15, 12345, 6789)).toBe(
      "https://tile.openstreetmap.org/15/12345/6789.png",
    );
  });
});

describe("osmTileSource", () => {
  test("mengirim header User-Agent pengenal GoBareng", () => {
    const source = osmTileSource(15, 12345, 6789);
    expect(source.uri).toBe("https://tile.openstreetmap.org/15/12345/6789.png");
    expect(source.headers["User-Agent"]).toBe(OSM_TILE_USER_AGENT);
    expect(source.headers["User-Agent"]).toContain("GoBareng");
    expect(source.headers["User-Agent"]).toContain("https://gobareng.app");
  });

  test("cacheKey menyertakan penanda versi sehingga tile blokir lama tidak terpakai lagi", () => {
    const source = osmTileSource(15, 12345, 6789);
    // Kunci lama (default expo-image) adalah URI polos; kunci baru
    // WAJIB berbeda dari URI supaya entri cache tile "Access blocked"
    // yang lama tidak pernah dibaca lagi.
    expect(source.cacheKey).not.toBe(source.uri);
    expect(source.cacheKey).toContain(OSM_TILE_CACHE_VERSION);
  });

  test("cacheKey berbeda antar tile", () => {
    expect(osmTileSource(15, 1, 2).cacheKey).not.toBe(
      osmTileSource(15, 1, 3).cacheKey,
    );
    expect(osmTileSource(15, 1, 2).cacheKey).not.toBe(
      osmTileSource(14, 1, 2).cacheKey,
    );
  });

  test("cacheKey stabil untuk tile yang sama", () => {
    expect(osmTileSource(15, 1, 2).cacheKey).toBe(
      osmTileSource(15, 1, 2).cacheKey,
    );
  });
});

describe("osmTileCacheKey", () => {
  test("satu tile satu kunci, diturunkan dari URI-nya", () => {
    const url = osmTileUrl(15, 10, 20);
    expect(osmTileCacheKey(url)).toBe(osmTileSource(15, 10, 20).cacheKey);
    expect(osmTileCacheKey(url)).not.toBe(url);
  });
});
