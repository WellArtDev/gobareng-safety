// TDD — fallback foto gunung: foto hanya dipakai bila imageUrl
// benar-benar ada (string tak kosong). null / "" / spasi saja ->
// kotak huruf fallback, bukan Image rusak. Deskripsi kosong tidak
// pernah dirender (jangan mengarang deskripsi), dan jumlah jalur
// memakai routeCount server bila ada, kalau tidak panjang routes.
import { describe, expect, test } from "bun:test";

import {
  hasMountainDescription,
  hasMountainPhoto,
  mountainPhotoUri,
  mountainRouteCount,
} from "../utils/mountain-photo";

describe("hasMountainPhoto", () => {
  test("imageUrl berisi URL -> foto dipakai", () => {
    expect(hasMountainPhoto("https://example.com/gede.jpg")).toBe(true);
  });

  test("null -> fallback huruf", () => {
    expect(hasMountainPhoto(null)).toBe(false);
  });

  test("undefined -> fallback huruf", () => {
    expect(hasMountainPhoto(undefined)).toBe(false);
  });

  test("string kosong / spasi saja -> fallback huruf", () => {
    expect(hasMountainPhoto("")).toBe(false);
    expect(hasMountainPhoto("   ")).toBe(false);
  });
});

describe("mountainPhotoUri", () => {
  test("mengembalikan URL yang sudah di-trim", () => {
    expect(mountainPhotoUri("  https://example.com/gede.jpg  ")).toBe(
      "https://example.com/gede.jpg",
    );
  });

  test("null / kosong -> null (pemanggil render fallback)", () => {
    expect(mountainPhotoUri(null)).toBeNull();
    expect(mountainPhotoUri("")).toBeNull();
    expect(mountainPhotoUri(undefined)).toBeNull();
  });
});

describe("hasMountainDescription", () => {
  test("deskripsi berisi teks -> dirender", () => {
    expect(hasMountainDescription("Gunung api aktif.")).toBe(true);
  });

  test("null / kosong / spasi saja -> tidak dirender", () => {
    expect(hasMountainDescription(null)).toBe(false);
    expect(hasMountainDescription("")).toBe(false);
    expect(hasMountainDescription("   ")).toBe(false);
  });
});

describe("mountainRouteCount", () => {
  test("routeCount server dipakai bila angka", () => {
    expect(mountainRouteCount(3, [{}, {}])).toBe(3);
  });

  test("routeCount null/undefined -> panjang routes", () => {
    expect(mountainRouteCount(null, [{}, {}, {}])).toBe(3);
    expect(mountainRouteCount(undefined, [])).toBe(0);
  });
});
