// TDD RED — M7: dedup posisi + heartbeat + antrean offline di sender.
// - Posisi dalam 25 m dari posisi TERKIRIM terakhir di-drop (GPS drift).
// - Heartbeat: walau diam di tempat, kirim paksa tiap 5 menit supaya
//   last-seen server tetap segar (tidak dikira signal loss).
// - POST gagal -> posisi masuk antrean (bukan dibuang); tick berikut
//   flush antrean dulu; item keluar antrean hanya setelah 2xx.
import { describe, expect, test } from "bun:test";

import {
  HEARTBEAT_MS,
  SAME_PLACE_RADIUS_M,
  createPositionSender,
  haversineMeters,
  shouldSendAfterDedup,
  type DetailedPosition,
} from "../utils/position-sender";
import {
  createPositionQueueItem,
  flushPositionQueue,
  type PositionQueueItem,
  type PositionQueuePort,
} from "../utils/position-queue";

const BASE: DetailedPosition = {
  lat: -7.19,
  lon: 109.92,
  mocked: false,
};

// ~11 m ke utara dari BASE (0.0001° lat ≈ 11,1 m) — di dalam radius.
// ~111 m ke utara (0.001° lat) — di luar radius.
const NEAR: DetailedPosition = { ...BASE, lat: -7.19 + 0.0001 };
const FAR: DetailedPosition = { ...BASE, lat: -7.19 + 0.001 };

/** Queue port in-memory untuk tes sender (tanpa SecureStore). */
function makeMemoryQueue(): {
  port: PositionQueuePort;
  items: () => PositionQueueItem[];
} {
  let queue: PositionQueueItem[] = [];
  return {
    port: {
      async enqueue(next: PositionQueueItem) {
        queue = queue.some((i) => i.id === next.id)
          ? queue
          : [...queue, next];
        return queue;
      },
      async flush(send: (i: PositionQueueItem) => Promise<void>) {
        const result = await flushPositionQueue(queue, send);
        queue = result.queue;
        return result;
      },
    },
    items: () => queue,
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("konstanta dedup", () => {
  test("radius 25 m, heartbeat 5 menit — terdokumentasi di modul", () => {
    expect(SAME_PLACE_RADIUS_M).toBe(25);
    expect(HEARTBEAT_MS).toBe(300000);
  });
});

describe("haversineMeters", () => {
  test("titik sama = 0; 0.0001° lat ≈ 11 m; 0.001° lat ≈ 111 m", () => {
    expect(haversineMeters(-7.19, 109.92, -7.19, 109.92)).toBe(0);
    const near = haversineMeters(-7.19, 109.92, NEAR.lat, NEAR.lon);
    expect(near).toBeGreaterThan(5);
    expect(near).toBeLessThan(25);
    const far = haversineMeters(-7.19, 109.92, FAR.lat, FAR.lon);
    expect(far).toBeGreaterThan(25);
  });
});

describe("shouldSendAfterDedup", () => {
  test("belum pernah kirim -> kirim", () => {
    expect(shouldSendAfterDedup(null, BASE, 1000)).toBe(true);
  });

  test("diam dalam 25 m sebelum heartbeat -> drop", () => {
    const last = { lat: BASE.lat, lon: BASE.lon, atMs: 1000 };
    expect(shouldSendAfterDedup(last, NEAR, 1000 + HEARTBEAT_MS - 1)).toBe(
      false,
    );
  });

  test("diam dalam 25 m tepat di heartbeat 5 menit -> kirim paksa", () => {
    const last = { lat: BASE.lat, lon: BASE.lon, atMs: 1000 };
    expect(shouldSendAfterDedup(last, NEAR, 1000 + HEARTBEAT_MS)).toBe(true);
  });

  test("bergerak >25 m -> kirim walau belum heartbeat", () => {
    const last = { lat: BASE.lat, lon: BASE.lon, atMs: 1000 };
    expect(shouldSendAfterDedup(last, FAR, 2000)).toBe(true);
  });
});

describe("createPositionSender + dedup + heartbeat", () => {
  test("posisi stasioner dalam 25 m di-drop, heartbeat 5 menit tetap kirim", async () => {
    let nowMs = 1_000_000;
    let current: DetailedPosition = BASE;
    let posts = 0;
    const sender = createPositionSender({
      getPosition: async () => current,
      post: async () => {
        posts += 1;
      },
      nowMs: () => nowMs,
      setIntervalFn: () => 0,
      clearIntervalFn: () => {},
    });
    sender.start("t1");
    await flushMicrotasks();
    expect(posts).toBe(1);
    // Tick kedua: diam di tempat, belum 5 menit -> drop.
    current = NEAR;
    await sender.tick();
    expect(posts).toBe(1);
    // Tick ketiga: diam di tempat, sudah 5 menit sejak kirim -> heartbeat.
    nowMs += HEARTBEAT_MS;
    await sender.tick();
    expect(posts).toBe(2);
    // Tick keempat: diam lagi, jam heartbeat di-reset -> drop.
    await sender.tick();
    expect(posts).toBe(2);
    sender.stop();
  });

  test("bergerak >25 m kirim lagi walau belum heartbeat", async () => {
    let current: DetailedPosition = BASE;
    let posts = 0;
    const sender = createPositionSender({
      getPosition: async () => current,
      post: async () => {
        posts += 1;
      },
      setIntervalFn: () => 0,
      clearIntervalFn: () => {},
    });
    sender.start("t1");
    await flushMicrotasks();
    current = FAR;
    await sender.tick();
    expect(posts).toBe(2);
    sender.stop();
  });
});

describe("createPositionSender + antrean offline", () => {
  test("POST gagal -> masuk antrean, bukan dibuang; tick berikut flush dan kosong", async () => {
    const mem = makeMemoryQueue();
    let online = false;
    let posts = 0;
    const sender = createPositionSender({
      getPosition: async () => BASE,
      post: async () => {
        if (!online) throw new Error("offline");
        posts += 1;
      },
      queue: mem.port,
      setIntervalFn: () => 0,
      clearIntervalFn: () => {},
    });
    sender.start("t1");
    await flushMicrotasks();
    expect(posts).toBe(0);
    expect(mem.items()).toHaveLength(1);
    // Konek kembali: tick flush antrean dulu (posisi antre terkirim),
    // lalu posisi segar di-drop dedup (titik sama, belum heartbeat).
    online = true;
    await sender.tick();
    expect(posts).toBe(1);
    expect(mem.items()).toHaveLength(0);
    sender.stop();
  });

  test("flush gagal -> item tetap antre; SOS menyalip normal saat flush", async () => {
    const mem = makeMemoryQueue();
    // Antrean awal: 1 normal + 1 SOS (SOS dibuat belakangan).
    await mem.port.enqueue(
      createPositionQueueItem({
        id: "n1",
        tripId: "t1",
        payload: { lat: 0, lon: 0, timestamp: "2026-11-03T02:00:00.000Z" },
        priority: "normal",
        createdAt: 1000,
      }),
    );
    await mem.port.enqueue(
      createPositionQueueItem({
        id: "s1",
        tripId: "t1",
        payload: { lat: 1, lon: 1, timestamp: "2026-11-03T02:00:00.000Z" },
        priority: "sos",
        createdAt: 2000,
      }),
    );
    const order: string[] = [];
    let online = false;
    const sender = createPositionSender({
      getPosition: async () => BASE,
      post: async (_tripId, payload) => {
        if (!online) throw new Error("offline");
        order.push(`${payload.lat},${payload.lon}`);
      },
      queue: mem.port,
      setIntervalFn: () => 0,
      clearIntervalFn: () => {},
    });
    sender.start("t1");
    await flushMicrotasks();
    // Offline: flush gagal di item pertama (SOS), antrean utuh + posisi
    // segar ikut antre -> 3 item.
    expect(mem.items()).toHaveLength(3);
    expect(order).toHaveLength(0);
    // Online: flush SOS dulu, lalu normal, lalu posisi segar.
    online = true;
    await sender.tick();
    expect(order).toEqual(["1,1", "0,0", "-7.19,109.92"]);
    expect(mem.items()).toHaveLength(0);
    sender.stop();
  });
});
