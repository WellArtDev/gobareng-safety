// TDD RED — pengirim posisi foreground (tracking screen, trip ACTIVE).
// Controller murni + gating: tanpa React, tanpa GPS beneran — semua
// dependensi di-inject supaya bisa dites dengan timer/payload palsu.
import { describe, expect, test } from "bun:test";

import {
  POSITION_SEND_MS,
  createPositionSender,
  shouldSendPosition,
  type DetailedPosition,
} from "../utils/position-sender";

const POS: DetailedPosition = {
  lat: -7.19,
  lon: 109.92,
  accuracy: 8,
  speed: 1.2,
  heading: 90,
  altitude: 2200,
  mocked: false,
};

interface TimerHarness {
  callbacks: Array<() => void>;
  cleared: unknown[];
  setIntervalFn: (fn: () => void, ms: number) => unknown;
  clearIntervalFn: (id: unknown) => void;
}

function makeTimers(): TimerHarness {
  const h: TimerHarness = {
    callbacks: [],
    cleared: [],
    setIntervalFn: (fn: () => void) => {
      h.callbacks.push(fn);
      return h.callbacks.length - 1;
    },
    clearIntervalFn: (id: unknown) => {
      h.cleared.push(id);
    },
  };
  return h;
}

describe("shouldSendPosition", () => {
  test("hanya fokus + ACTIVE yang boleh kirim", () => {
    expect(shouldSendPosition(true, "ACTIVE")).toBe(true);
    expect(shouldSendPosition(true, "PLANNED")).toBe(false);
    expect(shouldSendPosition(true, "CLOSED")).toBe(false);
    expect(shouldSendPosition(true, null)).toBe(false);
    expect(shouldSendPosition(true, undefined)).toBe(false);
    expect(shouldSendPosition(false, "ACTIVE")).toBe(false);
  });
});

describe("createPositionSender", () => {
  test("start langsung kirim sekali + pasang interval 10 detik", async () => {
    const timers = makeTimers();
    const posted: Array<{ tripId: string; payload: unknown }> = [];
    const sender = createPositionSender({
      getPosition: async () => POS,
      post: async (tripId, payload) => {
        posted.push({ tripId, payload });
      },
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    expect(sender.running).toBe(false);
    sender.start("t1");
    expect(sender.running).toBe(true);
    // Tunggu tick langsung selesai (microtask + janji getPosition/post).
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(posted).toHaveLength(1);
    expect(posted[0].tripId).toBe("t1");
    expect(timers.callbacks).toHaveLength(1);
    sender.stop();
    expect(sender.running).toBe(false);
    expect(timers.cleared).toHaveLength(1);
  });

  test("interval default = 10 detik, tidak pernah lebih cepat", () => {
    expect(POSITION_SEND_MS).toBe(10000);
    let seenMs = -1;
    const sender = createPositionSender({
      getPosition: async () => POS,
      post: async () => {},
      setIntervalFn: (_fn, ms) => {
        seenMs = ms;
        return 0;
      },
      clearIntervalFn: () => {},
    });
    sender.start("t1");
    expect(seenMs).toBe(10000);
    sender.stop();
  });

  test("callback interval kirim lagi dengan posisi terbaru", async () => {
    const timers = makeTimers();
    let lat = -7.19;
    const posted: number[] = [];
    const sender = createPositionSender({
      getPosition: async () => ({ ...POS, lat }),
      post: async (_tripId, payload) => {
        posted.push((payload as { lat: number }).lat);
      },
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    sender.start("t1");
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    lat = -7.2;
    timers.callbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(posted).toEqual([-7.19, -7.2]);
    sender.stop();
  });

  test("stop menghentikan kiriman interval berikutnya", async () => {
    const timers = makeTimers();
    let count = 0;
    const sender = createPositionSender({
      getPosition: async () => POS,
      post: async () => {
        count += 1;
      },
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    sender.start("t1");
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    sender.stop();
    timers.callbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    expect(count).toBe(1);
  });

  test("start kedua menggantikan interval lama (tidak ada timer ganda)", () => {
    const timers = makeTimers();
    const sender = createPositionSender({
      getPosition: async () => POS,
      post: async () => {},
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    sender.start("t1");
    sender.start("t2");
    expect(timers.callbacks).toHaveLength(2);
    expect(timers.cleared).toHaveLength(1);
    sender.stop();
  });

  test("posisi null -> tidak kirim, sender tetap jalan", async () => {
    const timers = makeTimers();
    let count = 0;
    const sender = createPositionSender({
      getPosition: async () => null,
      post: async () => {
        count += 1;
      },
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    sender.start("t1");
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(count).toBe(0);
    expect(sender.running).toBe(true);
    sender.stop();
  });

  test("GPS gagal / POST gagal -> ditelan diam-diam, tick berikut tetap jalan", async () => {
    const timers = makeTimers();
    let calls = 0;
    let posts = 0;
    const sender = createPositionSender({
      getPosition: async () => {
        calls += 1;
        if (calls === 1) throw new Error("gps off");
        return POS;
      },
      post: async () => {
        posts += 1;
        if (posts === 1) throw new Error("offline");
      },
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    sender.start("t1");
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(sender.running).toBe(true);
    timers.callbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toBe(1);
    timers.callbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toBe(2);
    sender.stop();
  });

  test("tick yang masih jalan tidak ditumpuk tick berikutnya", async () => {
    const timers = makeTimers();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let posts = 0;
    // M7: posisi kedua harus BERGERAK (>25 m) supaya lolos dedup —
    // inti tes ini adalah tick tak ditumpuk, bukan kirim posisi sama.
    let lat = POS.lat;
    const sender = createPositionSender({
      getPosition: async () => ({ ...POS, lat }),
      post: async () => {
        posts += 1;
        await gate;
      },
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    sender.start("t1");
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    timers.callbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toBe(1);
    release();
    await new Promise((r) => setTimeout(r, 0));
    lat = -7.2;
    timers.callbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toBe(2);
    sender.stop();
  });

  test("payload memakai kontrak LocationPayload + timestamp ISO", async () => {
    const timers = makeTimers();
    let payload: unknown = null;
    const sender = createPositionSender({
      getPosition: async () => POS,
      post: async (_tripId, p) => {
        payload = p;
      },
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    sender.start("t1");
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const p = payload as Record<string, unknown>;
    expect(p.lat).toBe(-7.19);
    expect(p.lon).toBe(109.92);
    expect(p.accuracy).toBe(8);
    expect(p.altitude).toBe(2200);
    expect(typeof p.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(p.timestamp as string))).toBe(false);
    sender.stop();
  });
});
