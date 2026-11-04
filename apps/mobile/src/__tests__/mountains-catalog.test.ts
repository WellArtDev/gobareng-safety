// TDD — adaptor katalog API -> wizard (Tugas 4c): katalog statis
// diganti sumber API, fallback statis hanya bila API gagal.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  apiMountainListToCatalog,
  apiMountainToCatalog,
  formatDistance,
  formatDuration,
  formatElevation,
  formatGain,
} from "../utils/mountains-catalog";

describe("format katalog API", () => {
  test("elevasi/jarak/gain/durasi gaya Indonesia, null jadi —", () => {
    expect(formatElevation(2565)).toBe("2.565 mdpl");
    expect(formatDistance(9.44)).toBe("9,44 km");
    expect(formatDistance(null)).toBe("—");
    expect(formatGain(1262)).toBe("+1.262 m");
    expect(formatGain(null)).toBe("—");
    expect(formatDuration(4.7)).toBe("4,7 jam");
    expect(formatDuration(48)).toBe("2 hari");
    expect(formatDuration(null)).toBe("—");
  });

  test("detail API MDPL -> bentuk wizard (nama + jalur + meetingPoint)", () => {
    const m = apiMountainToCatalog({
      id: "gunung-prau",
      name: "Gunung Prau",
      elevationM: 2565,
      location: "Jawa Tengah",
      difficultyKey: "",
      routes: [
        {
          id: "mdpl-1xKXuGAdzQiBneyWbpHH",
          mountainId: "gunung-prau",
          name: "Jalur Campurejo",
          meetingPoint: "Jalur Campurejo",
          distanceKm: 9.44,
          gainM: 1262,
          estHours: 4.7,
          recommended: false,
        },
      ],
    });
    expect(m.name).toBe("Gunung Prau");
    expect(m.elevation).toBe("2.565 mdpl");
    expect(m.routes).toHaveLength(1);
    expect(m.routes[0].distance).toBe("9,44 km");
    expect(m.routes[0].meetingPoint).toBe("Jalur Campurejo");
  });

  test("daftar API -> katalog wizard1 (tanpa jalur, diisi di wizard2)", () => {
    const m = apiMountainListToCatalog({
      id: "gunung-prau",
      name: "Gunung Prau",
      elevationM: 2565,
      location: "Jawa Tengah",
      difficultyKey: "",
      imageUrl: null,
    });
    expect(m.id).toBe("gunung-prau");
    expect(m.routes).toEqual([]);
  });

  test("daftar API -> katalog wizard1 meneruskan imageUrl", () => {
    const withPhoto = apiMountainListToCatalog({
      id: "gunung-prau",
      name: "Gunung Prau",
      elevationM: 2565,
      location: "Jawa Tengah",
      difficultyKey: "",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/prau.jpg",
    });
    expect(withPhoto.imageUrl).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/prau.jpg",
    );
    const withoutPhoto = apiMountainListToCatalog({
      id: "gunung-prau",
      name: "Gunung Prau",
      elevationM: 2565,
      location: "Jawa Tengah",
      difficultyKey: "",
      imageUrl: null,
    });
    expect(withoutPhoto.imageUrl).toBeNull();
  });

  test("detail API -> katalog meneruskan imageUrl", () => {
    const m = apiMountainToCatalog({
      id: "gunung-prau",
      name: "Gunung Prau",
      elevationM: 2565,
      location: "Jawa Tengah",
      difficultyKey: "",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/prau.jpg",
      lat: null,
      lon: null,
      routes: [],
    });
    expect(m.imageUrl).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/prau.jpg",
    );
  });
});

describe("wizard + komunitas memakai API tanpa fallback statis", () => {
  function src(rel: string): string {
    return readFileSync(new URL(rel, import.meta.url), "utf8");
  }

  test("wizard1 mengambil fetchMountains, tanpa MOUNTAINS", () => {
    const w1 = src("../screens/create/wizard1.tsx");
    expect(w1).toContain("fetchMountains");
    expect(w1).not.toContain("MOUNTAINS");
  });

  test("wizard1 menampilkan foto bila ada imageUrl, fallback kotak warna bila tidak", () => {
    const w1 = src("../screens/create/wizard1.tsx");
    expect(w1).toContain("expo-image");
    expect(w1).toContain("m.imageUrl");
    expect(w1).toContain("mtnPhoto");
  });

  test("wizard2 + form mengambil fetchMountain, tanpa mountainById", () => {
    const w2 = src("../screens/create/wizard2.tsx");
    expect(w2).toContain("fetchMountain");
    expect(w2).not.toContain("mountainById");
    const form = src("../screens/create/create-form.tsx");
    expect(form).toContain("fetchMountain");
    expect(form).not.toContain("mountainById");
  });

  test("ringkasan memakai nama dari form, tanpa mountainById", () => {
    const summary = src("../screens/create/create-summary.tsx");
    expect(summary).toContain("mountainName");
    expect(summary).not.toContain("mountainById");
  });

  test("layar komunitas memakai API, tanpa clubs-data", () => {
    const list = src("../screens/clubs/clubs.tsx");
    expect(list).toContain("fetchCommunities");
    expect(list).not.toContain("clubs-data");
    const detail = src("../screens/clubs/club-detail.tsx");
    expect(detail).toContain("fetchCommunity");
    expect(detail).not.toContain("clubs-data");
  });
});
