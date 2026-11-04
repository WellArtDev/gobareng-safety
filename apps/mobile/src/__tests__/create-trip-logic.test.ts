// TDD RED — logika buat trip: validasi form, fee Pro 5%, format rupiah,
// kode trip.
import { describe, expect, test } from "bun:test";

import {
  calculatePaidSplit,
  formatRupiah,
  validateCreateTrip,
} from "../utils/create-trip-logic";

describe("validateCreateTrip", () => {
  const valid = {
    name: "Pendakian Gede — Sunrise",
    date: "2026-11-08",
    time: "05:30",
    meetingPoint: "Basecamp Cibodas",
    quota: 15,
  };

  test("input valid lolos", () => {
    expect(validateCreateTrip(valid)).toBeNull();
  });

  test("nama kosong ditolak", () => {
    expect(validateCreateTrip({ ...valid, name: " " })).toBe(
      "create.errors.nameRequired",
    );
  });

  test("tanggal/jam kosong ditolak", () => {
    expect(validateCreateTrip({ ...valid, date: "" })).toBe(
      "create.errors.dateRequired",
    );
    expect(validateCreateTrip({ ...valid, time: "" })).toBe(
      "create.errors.dateRequired",
    );
  });

  test("titik kumpul kosong ditolak", () => {
    expect(validateCreateTrip({ ...valid, meetingPoint: "" })).toBe(
      "create.errors.meetRequired",
    );
  });

  test("touring wajib punya tujuan", () => {
    expect(
      validateCreateTrip({ ...valid, tripType: "TOURING", destination: "" }),
    ).toBe("create.errors.destinationRequired");
    expect(
      validateCreateTrip({
        ...valid,
        tripType: "TOURING",
        destination: "Puncak, Bogor",
      }),
    ).toBeNull();
    // Hiking tanpa tujuan tetap lolos (tujuan hanya untuk touring).
    expect(validateCreateTrip({ ...valid, tripType: "HIKING" })).toBeNull();
  });

  test("kuota < 2 atau bukan bilangan bulat ditolak (kontrak §2)", () => {
    expect(validateCreateTrip({ ...valid, quota: 1 })).toBe(
      "create.errors.quotaInvalid",
    );
    expect(validateCreateTrip({ ...valid, quota: 2.5 })).toBe(
      "create.errors.quotaInvalid",
    );
    expect(validateCreateTrip({ ...valid, quota: 2 })).toBeNull();
  });
});

describe("calculatePaidSplit (fee platform 5%)", () => {
  test("Rp150.000 -> fee 7.500, terima 142.500", () => {
    expect(calculatePaidSplit(150000)).toEqual({
      price: 150000,
      fee: 7500,
      net: 142500,
    });
  });

  test("pembulatan fee ke rupiah", () => {
    const split = calculatePaidSplit(99999);
    expect(split.fee).toBe(5000); // 4999.95 dibulatkan
    expect(split.net).toBe(94999);
  });
});

describe("formatRupiah", () => {
  test("pemisah ribuan titik", () => {
    expect(formatRupiah(150000)).toBe("Rp150.000");
    expect(formatRupiah(7500)).toBe("Rp7.500");
    expect(formatRupiah(0)).toBe("Rp0");
  });
});
