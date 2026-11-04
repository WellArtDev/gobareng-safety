// TDD RED — M7: antrean posisi offline (modul murni, tanpa SecureStore).
// Aturan yang dibuktikan di sini:
// - Flush sekuensial: SOS dulu, lalu createdAt tertua; item keluar dari
//   antrean HANYA setelah send resolve (2xx).
// - Flush berhenti di kegagalan pertama (urutan tertua terjaga); item
//   gagal tetap di antrean dengan attempts +1, sisanya tak tersentuh.
// - SOS tidak pernah kedaluwarsa; posisi normal lama di-prune retensi.
// - POST gagal -> enqueue, bukan buang (dibuktikan di sisi sender di
//   position-sender-dedup.test.ts; di sini modul antreannya).
import { describe, expect, test } from "bun:test";

import {
  POSITION_QUEUE_TTL_MS,
  createPositionQueueItem,
  enqueuePosition,
  flushPositionQueue,
  parsePositionQueue,
  pruneExpiredPositions,
  serializePositionQueue,
  sortForFlush,
  type PositionQueueItem,
} from "../utils/position-queue";
import type { LocationPayload } from "../utils/locations-api";

const PAYLOAD: LocationPayload = {
  lat: -7.19,
  lon: 109.92,
  timestamp: "2026-11-03T02:00:00.000Z",
};

function item(
  id: string,
  createdAt: number,
  priority: "sos" | "normal" = "normal",
): PositionQueueItem {
  return createPositionQueueItem({
    id,
    tripId: "t1",
    payload: PAYLOAD,
    priority,
    createdAt,
  });
}

describe("sortForFlush", () => {
  test("SOS menyalip posisi normal walau dibuat belakangan", () => {
    const queue = [item("n1", 1000), item("s1", 2000, "sos"), item("n2", 1500)];
    expect(sortForFlush(queue).map((i) => i.id)).toEqual(["s1", "n1", "n2"]);
  });

  test("posisi normal terurut createdAt tertua dulu", () => {
    const queue = [item("n3", 3000), item("n1", 1000), item("n2", 2000)];
    expect(sortForFlush(queue).map((i) => i.id)).toEqual(["n1", "n2", "n3"]);
  });
});

describe("enqueuePosition", () => {
  test("id sama tidak diduplikasi", () => {
    const queue = enqueuePosition([], item("a", 1000));
    expect(enqueuePosition(queue, item("a", 2000))).toHaveLength(1);
  });
});

describe("flushPositionQueue", () => {
  test("kirim berurutan, item keluar antrean hanya setelah 2xx", async () => {
    const queue = [item("n1", 1000), item("n2", 2000)];
    const sentOrder: string[] = [];
    const result = await flushPositionQueue(queue, async (i) => {
      sentOrder.push(i.id);
    });
    expect(sentOrder).toEqual(["n1", "n2"]);
    expect(result.queue).toHaveLength(0);
    expect(result.sent.map((i) => i.id)).toEqual(["n1", "n2"]);
    expect(result.failed).toHaveLength(0);
  });

  test("SOS terkirim dulu, lalu normal tertua", async () => {
    const queue = [item("n1", 1000), item("s1", 2000, "sos")];
    const sentOrder: string[] = [];
    const result = await flushPositionQueue(queue, async (i) => {
      sentOrder.push(i.id);
    });
    expect(sentOrder).toEqual(["s1", "n1"]);
    expect(result.queue).toHaveLength(0);
  });

  test("gagal flush: item tetap antre (attempts +1), antrean berikutnya tak tersentuh", async () => {
    const queue = [item("n1", 1000), item("n2", 2000)];
    const attempted: string[] = [];
    const result = await flushPositionQueue(queue, async (i) => {
      attempted.push(i.id);
      throw new Error("offline");
    });
    // Berhenti di kegagalan pertama: n2 belum pernah dicoba.
    expect(attempted).toEqual(["n1"]);
    expect(result.queue).toHaveLength(2);
    expect(result.queue[0].id).toBe("n1");
    expect(result.queue[0].attempts).toBe(1);
    expect(result.queue[1].attempts).toBe(0);
    expect(result.failed.map((i) => i.id)).toEqual(["n1"]);
    expect(result.sent).toHaveLength(0);
  });

  test("gagal di tengah: yang sudah terkirim keluar, yang gagal + sisanya tetap", async () => {
    const queue = [item("n1", 1000), item("n2", 2000), item("n3", 3000)];
    const result = await flushPositionQueue(queue, async (i) => {
      if (i.id === "n2") throw new Error("500");
    });
    expect(result.sent.map((i) => i.id)).toEqual(["n1"]);
    expect(result.queue.map((i) => i.id)).toEqual(["n2", "n3"]);
    expect(result.queue[0].attempts).toBe(1);
    expect(result.queue[1].attempts).toBe(0);
  });
});

describe("pruneExpiredPositions", () => {
  test("SOS tidak pernah kedaluwarsa, normal lama di-prune", () => {
    const now = 10_000_000;
    const old = now - POSITION_QUEUE_TTL_MS - 1000;
    const queue = [
      item("n-old", old),
      item("s-old", old, "sos"),
      item("n-fresh", now),
    ];
    expect(pruneExpiredPositions(queue, now).map((i) => i.id)).toEqual([
      "s-old",
      "n-fresh",
    ]);
  });

  test("normal tepat di batas TTL masih dipertahankan", () => {
    const now = 10_000_000;
    const queue = [item("n-edge", now - POSITION_QUEUE_TTL_MS)];
    expect(pruneExpiredPositions(queue, now)).toHaveLength(1);
  });
});

describe("serialize/parse", () => {
  test("round-trip + string korup kembali ke antrean kosong", () => {
    const queue = [item("n1", 1000), item("s1", 2000, "sos")];
    expect(parsePositionQueue(serializePositionQueue(queue))).toEqual(queue);
    expect(parsePositionQueue("bukan-json")).toEqual([]);
    expect(parsePositionQueue(null)).toEqual([]);
  });
});
