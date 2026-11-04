// AI-G Glimmer — antrean offline (TDD). Aturan yang dikunci di sini:
// 1. Antrean bertahan: simpan -> instance baru atas storage yang sama
//    membaca kembali item yang sama (simulasi aplikasi ditutup/dibuka).
// 2. Kirim ulang tidak duplikat: enqueue id yang sama tidak menambah item.
// 3. Hapus dari antrean tertunda HANYA setelah 2xx: gagal = tetap
//    tertunda; sukses = tidak lagi tertunda (jawaban menempel di item).
// 4. SOS prioritas: flush mengirim item SOS lebih dulu, lalu createdAt;
//    SOS tidak pernah kedaluwarsa (prune tidak pernah menyentuhnya).
import { describe, expect, test } from "bun:test";

import {
  createGlimmerItem,
  enqueueItem,
  flushQueue,
  GlimmerQueueStore,
  pendingItems,
  pruneDelivered,
  sortForFlush,
  type GlimmerQueueItem,
  type GlimmerStorage,
} from "../utils/glimmer-queue";

function memoryStorage(): GlimmerStorage & { raw: string | null } {
  const box: { raw: string | null } = { raw: null };
  return {
    get raw() {
      return box.raw;
    },
    async load() {
      return box.raw;
    },
    async save(serialized: string) {
      box.raw = serialized;
    },
  };
}

function item(
  id: string,
  overrides: Partial<GlimmerQueueItem> = {},
): GlimmerQueueItem {
  return createGlimmerItem({
    id,
    message: `pesan ${id}`,
    queuedOffline: true,
    ...overrides,
  });
}

describe("glimmer queue", () => {
  test("antrean bertahan: simpan lalu dibaca instance baru", async () => {
    const storage = memoryStorage();
    const first = new GlimmerQueueStore(storage);
    await first.enqueue(item("a"));
    await first.enqueue(item("b", { priority: "sos" }));

    const reopened = new GlimmerQueueStore(storage);
    const items = await reopened.load();
    expect(items.map((i) => i.id).sort()).toEqual(["a", "b"]);
    expect(items.find((i) => i.id === "b")?.priority).toBe("sos");
    expect(items.find((i) => i.id === "a")?.status).toBe("queued");
  });

  test("enqueue id yang sama tidak menduplikasi", async () => {
    const storage = memoryStorage();
    const store = new GlimmerQueueStore(storage);
    await store.enqueue(item("a", { message: "pertama" }));
    await store.enqueue(item("a", { message: "kedua" }));
    const items = await store.load();
    expect(items).toHaveLength(1);
    expect(items[0]?.message).toBe("pertama");
  });

  test("flush mengirim SOS dulu lalu urutan tertua", async () => {
    const queue = [
      item("normal-baru", { createdAt: 3000 }),
      item("sos-lama", { priority: "sos", createdAt: 1000 }),
      item("normal-lama", { createdAt: 2000 }),
      item("sos-baru", { priority: "sos", createdAt: 4000 }),
    ];
    const order = sortForFlush(queue).map((i) => i.id);
    expect(order).toEqual([
      "sos-lama",
      "sos-baru",
      "normal-lama",
      "normal-baru",
    ]);

    const sent: string[] = [];
    const result = await flushQueue(queue, async (it) => {
      sent.push(it.id);
      return { answer: `jawaban ${it.id}`, model: "muse-spark-open" };
    });
    expect(sent).toEqual(order);
    expect(pendingItems(result.queue)).toHaveLength(0);
    const answered = result.queue.find((i) => i.id === "sos-lama");
    expect(answered?.status).toBe("sent");
    expect(answered?.answer).toBe("jawaban sos-lama");
    expect(answered?.model).toBe("muse-spark-open");
    expect(answered?.queuedOffline).toBe(true);
  });

  test("gagal kirim = tetap tertunda dan bisa dikirim ulang", async () => {
    const queue = [item("a"), item("b")];
    let attempts = 0;
    const failing = async () => {
      attempts += 1;
      throw new Error("network down");
    };
    const first = await flushQueue(queue, failing);
    expect(pendingItems(first.queue)).toHaveLength(2);
    expect(first.queue.every((i) => i.status === "failed")).toBe(true);
    expect(first.sent).toHaveLength(0);

    const second = await flushQueue(first.queue, async (it) => ({
      answer: `ok ${it.id}`,
      model: "muse-spark-open",
    }));
    expect(attempts).toBe(2);
    expect(pendingItems(second.queue)).toHaveLength(0);
    expect(second.sent).toHaveLength(2);
  });

  test("hanya item 2xx yang keluar dari antrean tertunda", async () => {
    const queue = [item("ok"), item("gagal")];
    const result = await flushQueue(queue, async (it) => {
      if (it.id === "gagal") throw new Error("500");
      return { answer: "ya", model: "muse-spark-open" };
    });
    expect(pendingItems(result.queue).map((i) => i.id)).toEqual(["gagal"]);
    expect(result.sent.map((i) => i.id)).toEqual(["ok"]);
  });

  test("enqueueItem murni: dedup + tidak mengubah antrean lama", () => {
    const base = [item("a")];
    const next = enqueueItem(base, item("a", { message: "duplikat" }));
    expect(next).toHaveLength(1);
    expect(next[0]?.message).toBe("pesan a");
    expect(base).toHaveLength(1);
  });

  test("prune tidak pernah menyentuh SOS dan item yang belum terkirim", () => {
    const old = Date.now() - 40 * 24 * 60 * 60 * 1000;
    const queue: GlimmerQueueItem[] = [
      { ...item("sos-terkirim", { priority: "sos" }), status: "sent", createdAt: old, answeredAt: old },
      { ...item("normal-terkirim"), status: "sent", createdAt: old, answeredAt: old },
      { ...item("normal-tertunda"), status: "queued", createdAt: old },
      { ...item("normal-gagal"), status: "failed", createdAt: old },
    ];
    const pruned = pruneDelivered(queue, Date.now());
    expect(pruned.map((i) => i.id).sort()).toEqual([
      "normal-gagal",
      "normal-tertunda",
      "sos-terkirim",
    ]);
  });
});
