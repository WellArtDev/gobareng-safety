// TDD — SOS umum minta lokasi: akuisisi posisi eksplisit + bisa diulang.
// Kontrak: izin diberikan -> posisi dilampirkan; izin ditolak/gagal ->
// "unavailable" yang jujur, tanpa koordinat karangan, tanpa blokir layar.
import { describe, expect, test } from "bun:test";

import {
  acquireSosPosition,
  type SosPositionFetcher,
} from "../utils/sos-location";

function fetcher(point: { lat: number; lon: number } | null): SosPositionFetcher {
  return async () => point;
}

describe("acquireSosPosition", () => {
  test("izin diberikan -> ready dengan koordinat", async () => {
    const out = await acquireSosPosition(fetcher({ lat: -6.33, lon: 106.77 }));
    expect(out.status).toBe("ready");
    expect(out.position).toEqual({ lat: -6.33, lon: 106.77 });
  });

  test("izin ditolak (null) -> unavailable tanpa koordinat", async () => {
    const out = await acquireSosPosition(fetcher(null));
    expect(out.status).toBe("unavailable");
    expect(out.position).toBeNull();
  });

  test("fetcher melempar -> unavailable, bukan crash", async () => {
    const out = await acquireSosPosition(async () => {
      throw new Error("gps-gagal");
    });
    expect(out.status).toBe("unavailable");
    expect(out.position).toBeNull();
  });
});
