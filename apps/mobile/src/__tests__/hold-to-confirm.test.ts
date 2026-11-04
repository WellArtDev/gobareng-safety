// TDD — Tekan-tahan 3 detik untuk SOS umum (keputusan Wella 3 Nov 2026):
// menggantikan double-confirm (2x tekan dalam 10 detik). Lepas sebelum
// 3 detik = batal, tidak terkirim. Hanya dipakai layar SOS umum.
import { describe, expect, test } from "bun:test";

import {
  HOLD_TO_CONFIRM_MS,
  createHoldToConfirm,
  holdProgress,
} from "../utils/hold-to-confirm";

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("tekan-tahan konfirmasi", () => {
  test("durasi tahan default tepat 3 detik", () => {
    expect(HOLD_TO_CONFIRM_MS).toBe(3000);
  });

  test("progres 0 di awal, 1 saat durasi tercapai, dijepit 0..1", () => {
    expect(holdProgress(0)).toBe(0);
    expect(holdProgress(1500)).toBe(0.5);
    expect(holdProgress(3000)).toBe(1);
    expect(holdProgress(9000)).toBe(1);
    expect(holdProgress(-100)).toBe(0);
  });

  test("lepas sebelum durasi = batal, tidak terkirim", async () => {
    let fired = 0;
    const hold = createHoldToConfirm(60);
    hold.press(() => {
      fired += 1;
    });
    expect(hold.isHolding()).toBe(true);
    await sleep(20);
    hold.release();
    expect(hold.isHolding()).toBe(false);
    await sleep(80);
    expect(fired).toBe(0);
  });

  test("tahan sampai durasi = terkirim tepat sekali", async () => {
    let fired = 0;
    const hold = createHoldToConfirm(50);
    hold.press(() => {
      fired += 1;
    });
    await sleep(90);
    expect(fired).toBe(1);
    expect(hold.isHolding()).toBe(false);
    await sleep(60);
    expect(fired).toBe(1);
  });

  test("lepas setelah terkirim tidak memicu kirim kedua", async () => {
    let fired = 0;
    const hold = createHoldToConfirm(40);
    hold.press(() => {
      fired += 1;
    });
    await sleep(80);
    hold.release();
    await sleep(60);
    expect(fired).toBe(1);
  });

  test("tekan kedua saat masih menahan tidak me-restart timer", async () => {
    let fired = 0;
    const hold = createHoldToConfirm(60);
    hold.press(() => {
      fired += 1;
    });
    await sleep(30);
    hold.press(() => {
      fired += 10;
    });
    await sleep(60);
    expect(fired).toBe(1);
  });

  test("cancel sebelum durasi = batal, dan reset memungkinkan tahan baru", async () => {
    let fired = 0;
    const hold = createHoldToConfirm(50);
    hold.press(() => {
      fired += 1;
    });
    hold.cancel();
    await sleep(80);
    expect(fired).toBe(0);
    hold.reset();
    hold.press(() => {
      fired += 1;
    });
    await sleep(80);
    expect(fired).toBe(1);
  });
});
