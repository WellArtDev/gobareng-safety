// TDD RED — helper batas waktu generik: dipakai GPS Direction
// (getCurrentPosition) dan asisten leader, supaya panggilan yang
// menggantung tidak memblokir layar selamanya. Menolak (bukan
// menggantung) saat batas tercapai; janji yang menang tetap dipakai.
import { describe, expect, test } from "bun:test";

import { withTimeout, TimeoutError } from "../utils/timeout";

const never = () => new Promise<string>(() => {});
const delayed = (ms: number, value: string) =>
  new Promise<string>((resolve) => setTimeout(() => resolve(value), ms));

describe("withTimeout", () => {
  test("janji cepat menang sebelum batas", async () => {
    expect(await withTimeout(delayed(5, "ok"), 1000)).toBe("ok");
  });

  test("janji menggantung ditolak TimeoutError setelah batas", async () => {
    let caught: unknown = null;
    try {
      await withTimeout(never(), 10);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TimeoutError);
  });
});
