import { describe, expect, test } from "bun:test";

import { formatTripDate } from "@/utils/format-date";

describe("formatTripDate", () => {
  test("tanggal ISO menjadi format Indonesia", () => {
    expect(formatTripDate("2026-10-28")).toBe("28 Okt 2026");
    expect(formatTripDate("2026-01-05")).toBe("5 Jan 2026");
    expect(formatTripDate("2026-05-17")).toBe("17 Mei 2026");
    expect(formatTripDate("2026-08-20")).toBe("20 Agu 2026");
  });

  test("nilai bukan tanggal dilewatkan apa adanya", () => {
    expect(formatTripDate("")).toBe("");
    expect(formatTripDate("besok")).toBe("besok");
    expect(formatTripDate("2026-13-40")).toBe("2026-13-40");
  });
});
