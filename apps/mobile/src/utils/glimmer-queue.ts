// AI-G Glimmer — antrean offline asisten, logika murni (tanpa import
// native) supaya bisa dites dengan bun test.
//
// Aturan (mengikuti pola store-and-forward M7):
// - Pesan ditulis ke antrean lokal dulu; status awal "queued". Aplikasi
//   ditutup tidak menghilangkan antrean — persistensi dipegang
//   GlimmerQueueStore lewat storage adapter (produksi: SecureStore,
//   lihat glimmer-store.ts).
// - Flush mengirim berurutan: item SOS dulu, lalu createdAt tertua.
//   Urutan terjaga karena pengiriman sekuensial, bukan paralel.
// - Item keluar dari antrean TERTUNDA hanya setelah pengiriman 2xx
//   (send() resolve). Gagal apa pun -> status "failed", tetap di
//   antrean, bisa dikirim ulang. Dedup server (clientMessageId per
//   pengguna) membuat kirim ulang aman.
// - SOS tidak pernah kedaluwarsa: pruneDelivered tidak pernah menghapus
//   item SOS, dan tidak pernah menghapus item yang belum terkirim
//   (queued/failed). Yang boleh di-prune hanya riwayat "sent" normal
//   yang sudah lewat retensi (salinan server tetap ada via GET).
// - Glimmer = antre + sinkron, BUKAN AI lokal: tidak ada model di HP,
//   jawaban selalu dari server setelah koneksi kembali.
export type GlimmerPriority = "sos" | "normal";
export type GlimmerStatus = "queued" | "sent" | "failed";

export interface GlimmerQueueItem {
  /** clientMessageId — kunci idempotensi di server. */
  id: string;
  message: string;
  priority: GlimmerPriority;
  status: GlimmerStatus;
  /** true bila item masuk antrean saat offline (bukan kirim langsung). */
  queuedOffline: boolean;
  createdAt: number;
  answer?: string;
  model?: string;
  answeredAt?: number;
  attempts: number;
}

export interface GlimmerStorage {
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
}

export const GLIMMER_DELIVERED_RETENTION_MS = 30 * 24 * 60 * 60_000;

export function createGlimmerItem(input: {
  id: string;
  message: string;
  priority?: GlimmerPriority;
  queuedOffline: boolean;
  createdAt?: number;
}): GlimmerQueueItem {
  return {
    id: input.id,
    message: input.message,
    priority: input.priority ?? "normal",
    status: "queued",
    queuedOffline: input.queuedOffline,
    createdAt: input.createdAt ?? Date.now(),
    attempts: 0,
  };
}

/** Dedup sisi klien: id sudah ada -> antrean tidak berubah. */
export function enqueueItem(
  queue: GlimmerQueueItem[],
  item: GlimmerQueueItem,
): GlimmerQueueItem[] {
  if (queue.some((i) => i.id === item.id)) return queue;
  return [...queue, item];
}

/** Item yang masih harus terkirim (termasuk yang sempat gagal). */
export function pendingItems(queue: GlimmerQueueItem[]): GlimmerQueueItem[] {
  return queue.filter((i) => i.status === "queued" || i.status === "failed");
}

/** Urutan flush: SOS dulu, lalu createdAt tertua. */
export function sortForFlush(queue: GlimmerQueueItem[]): GlimmerQueueItem[] {
  return [...queue].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "sos" ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
}

export async function flushQueue(
  queue: GlimmerQueueItem[],
  send: (item: GlimmerQueueItem) => Promise<{ answer: string; model: string }>,
): Promise<{
  queue: GlimmerQueueItem[];
  sent: GlimmerQueueItem[];
  failed: GlimmerQueueItem[];
}> {
  const sent: GlimmerQueueItem[] = [];
  const failed: GlimmerQueueItem[] = [];
  const byId = new Map(queue.map((i) => [i.id, i]));
  for (const item of sortForFlush(pendingItems(queue))) {
    const attempted: GlimmerQueueItem = {
      ...item,
      attempts: item.attempts + 1,
    };
    try {
      const { answer, model } = await send(attempted);
      const done: GlimmerQueueItem = {
        ...attempted,
        status: "sent",
        answer,
        model,
        answeredAt: Date.now(),
      };
      byId.set(done.id, done);
      sent.push(done);
    } catch {
      const kept: GlimmerQueueItem = { ...attempted, status: "failed" };
      byId.set(kept.id, kept);
      failed.push(kept);
    }
  }
  return { queue: queue.map((i) => byId.get(i.id) ?? i), sent, failed };
}

export function removeItem(
  queue: GlimmerQueueItem[],
  id: string,
): GlimmerQueueItem[] {
  return queue.filter((i) => i.id !== id);
}

export function retryItem(
  queue: GlimmerQueueItem[],
  id: string,
): GlimmerQueueItem[] {
  return queue.map((i) =>
    i.id === id && i.status === "failed" ? { ...i, status: "queued" } : i,
  );
}

/**
 * Prune riwayat terkirim: hanya item "sent" normal yang answeredAt-nya
 * lebih tua dari retensi. SOS tidak pernah di-prune; item yang belum
 * terkirim tidak pernah di-prune.
 */
export function pruneDelivered(
  queue: GlimmerQueueItem[],
  now: number,
  retentionMs: number = GLIMMER_DELIVERED_RETENTION_MS,
): GlimmerQueueItem[] {
  return queue.filter((i) => {
    if (i.status !== "sent") return true;
    if (i.priority === "sos") return true;
    const answeredAt = i.answeredAt ?? i.createdAt;
    return now - answeredAt < retentionMs;
  });
}

export function serializeQueue(queue: GlimmerQueueItem[]): string {
  return JSON.stringify(queue);
}

export function parseQueue(serialized: string | null): GlimmerQueueItem[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is GlimmerQueueItem =>
        typeof i === "object" &&
        i !== null &&
        typeof (i as { id?: unknown }).id === "string" &&
        typeof (i as { message?: unknown }).message === "string",
    );
  } catch {
    return [];
  }
}

/** Store antrean: memori + persist best-effort lewat adapter. */
export class GlimmerQueueStore {
  private items: GlimmerQueueItem[] | null = null;

  constructor(private readonly storage: GlimmerStorage) {}

  async load(): Promise<GlimmerQueueItem[]> {
    if (this.items) return this.items;
    this.items = parseQueue(await this.storage.load());
    return this.items;
  }

  private async persist(): Promise<void> {
    try {
      await this.storage.save(serializeQueue(this.items ?? []));
    } catch {
      // Persist best-effort (pola auth-store): antrean memori tetap jalan.
    }
  }

  async enqueue(item: GlimmerQueueItem): Promise<GlimmerQueueItem[]> {
    const current = await this.load();
    this.items = enqueueItem(current, item);
    await this.persist();
    return this.items;
  }

  async flush(
    send: (item: GlimmerQueueItem) => Promise<{ answer: string; model: string }>,
  ): Promise<{ queue: GlimmerQueueItem[]; sent: GlimmerQueueItem[]; failed: GlimmerQueueItem[] }> {
    const current = await this.load();
    const result = await flushQueue(current, send);
    this.items = result.queue;
    await this.persist();
    return result;
  }

  async remove(id: string): Promise<GlimmerQueueItem[]> {
    const current = await this.load();
    this.items = removeItem(current, id);
    await this.persist();
    return this.items;
  }

  async retry(id: string): Promise<GlimmerQueueItem[]> {
    const current = await this.load();
    this.items = retryItem(current, id);
    await this.persist();
    return this.items;
  }
}
