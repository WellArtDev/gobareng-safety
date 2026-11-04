// TDD — pilih titik kumpul lewat peta saat buat trip (hiking + touring):
// kembali dari layar peta harus membawa SEMUA field form (termasuk
// mountainId/routeId hiking) dan mengisi nama + koordinat titik yang
// dipilih; pusat peta mengutamakan pilihan, lalu gunung, lalu GPS.
import { describe, expect, test } from "bun:test";

import {
  applyPickedLocation,
  resolveMapPickerCenter,
  type CreateFormLocationParams,
  type PickedLocation,
} from "../utils/create-trip-location";

const FORM: CreateFormLocationParams = {
  tripType: "HIKING",
  mountainId: "gunung-1",
  routeId: "jalur-1",
  name: "Pendakian Gede",
  date: "2026-11-04",
  time: "05:30",
  meet: "meeting on basecamp1",
  tujuan: "",
  tujuanLat: "",
  tujuanLon: "",
  tikumLat: "",
  tikumLon: "",
  desc: "",
  quota: "10",
};

const PICKED: PickedLocation = { name: "Basecamp Selabintana", lat: -6.78, lon: 106.93 };

describe("applyPickedLocation", () => {
  test("tikum: nama + koordinat titik kumpul terisi, field lain utuh", () => {
    const next = applyPickedLocation(FORM, "tikum", PICKED);
    expect(next.meet).toBe("Basecamp Selabintana");
    expect(next.tikumLat).toBe("-6.78");
    expect(next.tikumLon).toBe("106.93");
    expect(next.mountainId).toBe("gunung-1");
    expect(next.routeId).toBe("jalur-1");
    expect(next.name).toBe("Pendakian Gede");
    expect(next.date).toBe("2026-11-04");
    expect(next.tujuan).toBe("");
  });

  test("tujuan: tujuan + koordinat terisi, titik kumpul tak berubah", () => {
    const next = applyPickedLocation(FORM, "tujuan", PICKED);
    expect(next.tujuan).toBe("Basecamp Selabintana");
    expect(next.tujuanLat).toBe("-6.78");
    expect(next.tujuanLon).toBe("106.93");
    expect(next.meet).toBe("meeting on basecamp1");
    expect(next.tikumLat).toBe("");
    expect(next.mountainId).toBe("gunung-1");
  });
});

describe("resolveMapPickerCenter", () => {
  const fallback = { lat: -6.2088, lon: 106.8456 };
  const mountain = { lat: -6.78, lon: 106.93 };
  const device = { lat: -6.33, lon: 106.77 };

  test("pilihan mengalahkan gunung dan GPS", () => {
    expect(
      resolveMapPickerCenter({ selected: PICKED, mountain, device, fallback }),
    ).toEqual({ lat: -6.78, lon: 106.93 });
  });

  test("tanpa pilihan: gunung mengalahkan GPS perangkat", () => {
    expect(
      resolveMapPickerCenter({ selected: null, mountain, device, fallback }),
    ).toEqual({ lat: -6.78, lon: 106.93 });
  });

  test("tanpa pilihan dan gunung: GPS perangkat", () => {
    expect(
      resolveMapPickerCenter({ selected: null, mountain: null, device, fallback }),
    ).toEqual({ lat: -6.33, lon: 106.77 });
  });

  test("tanpa semua: fallback Jakarta", () => {
    expect(
      resolveMapPickerCenter({ selected: null, mountain: null, device: null, fallback }),
    ).toEqual(fallback);
  });
});
