import { describe, expect, test } from "bun:test";

import {
  formatPickerDate,
  formatPickerTime,
  initialPickerValue,
  parsePickerDate,
  parsePickerTime,
} from "@/utils/datetime-pick";

describe("formatPickerDate", () => {
  test("tanggal lokal tanpa geser zona waktu", () => {
    expect(formatPickerDate(new Date(2026, 10, 8))).toBe("2026-11-08");
    expect(formatPickerDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("formatPickerTime", () => {
  test("jam 24 jam berpadding nol", () => {
    expect(formatPickerTime(new Date(2026, 10, 8, 5, 30))).toBe("05:30");
    expect(formatPickerTime(new Date(2026, 10, 8, 0, 5))).toBe("00:05");
    expect(formatPickerTime(new Date(2026, 10, 8, 23, 59))).toBe("23:59");
  });
});

describe("parsePickerDate", () => {
  test("nilai valid menjadi tanggal lokal yang sama", () => {
    const d = parsePickerDate("2026-11-08");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(10);
    expect(d?.getDate()).toBe(8);
    expect(d ? formatPickerDate(d) : null).toBe("2026-11-08");
  });

  test("tanggal kabisat valid, tanggal mustahil ditolak", () => {
    expect(parsePickerDate("2024-02-29")).not.toBeNull();
    expect(parsePickerDate("2026-02-29")).toBeNull();
    expect(parsePickerDate("2026-13-01")).toBeNull();
    expect(parsePickerDate("2026-11-31")).toBeNull();
  });

  test("format salah dan kosong ditolak", () => {
    expect(parsePickerDate("")).toBeNull();
    expect(parsePickerDate("08-11-2026")).toBeNull();
    expect(parsePickerDate("2026/11/08")).toBeNull();
    expect(parsePickerDate("besok")).toBeNull();
  });
});

describe("parsePickerTime", () => {
  test("nilai valid round-trip ke format yang sama", () => {
    const d = parsePickerTime("05:30");
    expect(d ? formatPickerTime(d) : null).toBe("05:30");
    expect(parsePickerTime("23:59")).not.toBeNull();
    expect(parsePickerTime("00:00")).not.toBeNull();
  });

  test("jam di luar rentang dan format salah ditolak", () => {
    expect(parsePickerTime("24:00")).toBeNull();
    expect(parsePickerTime("05:60")).toBeNull();
    expect(parsePickerTime("5:30")).toBeNull();
    expect(parsePickerTime("")).toBeNull();
    expect(parsePickerTime("05.30")).toBeNull();
  });
});

describe("initialPickerValue", () => {
  test("nilai lama yang valid dipakai sebagai awal picker", () => {
    expect(formatPickerDate(initialPickerValue("date", "2026-11-08", "", new Date(2026, 0, 1)))).toBe("2026-11-08");
    expect(formatPickerTime(initialPickerValue("time", "", "05:30", new Date(2026, 0, 1)))).toBe("05:30");
  });

  test("nilai kosong atau tak valid jatuh ke fallback", () => {
    const fallback = new Date(2026, 0, 1, 9, 15);
    expect(formatPickerDate(initialPickerValue("date", "", "", fallback))).toBe("2026-01-01");
    expect(formatPickerDate(initialPickerValue("date", "tanggal-ngawur", "", fallback))).toBe("2026-01-01");
    expect(formatPickerTime(initialPickerValue("time", "", "", fallback))).toBe("09:15");
    expect(formatPickerTime(initialPickerValue("time", "", "99:99", fallback))).toBe("09:15");
  });
});
