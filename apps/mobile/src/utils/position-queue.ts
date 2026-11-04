// M7 — antrean posisi offline, logika murni (tanpa import native)
// supaya bisa dites dengan bun test. Persistensi dipegang
// PositionQueueStore lewat storage adapter (produksi: SecureStore,
// lihat position-queue-store.ts) — pola yang sama dengan glimmer-queue.
//
// Aturan antrean (kontrak M7):
// - Item keluar dari antrean HANYA setelah send resolve (server 2xx).
//   Gagal apa pun -> item tetap di antrean, attempts +1.
// - Flush sekuensial, bukan paralel: SOS dulu, lalu createdAt tertua.
//   Flush BERHENTI di kegagalan pertama supaya urutan tertua terjaga;
//   item yang belum dicoba tidak bertambah attempts-nya.
// - SOS tidak pernah kedaluwarsa: pruneExpiredPositions tidak pernah
//   menghapus item SOS. Prune hanya dipakai sebagai pembersih retensi
//   eksplisit — jalur kirim/flush sendiri TIDAK pernah membuang item
//   selain lewat 2xx.
// - Item yang sudah diantrekan tidak melewati dedup lagi: saat dibuat
//   ia sudah lolos dedup di sender, jadi flush mengirim apa adanya.
import type { LocationPayload } from "./locations-api";

export type PositionQueuePriority = "sos" | "normal";

export interface PositionQueueItem {
  id: string;
  tripId: string;
  payload: LocationPayload;
  priority: PositionQueuePriority;
  createdAt: number;
  attempts: number;
}

export interface PositionQueueStorage {
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
}

/** Retensi antrean normal: 24 jam. SOS dikecualikan (tak pernah prune). */
export const POSITION_QUEUE_TTL_MS = 24 * 60 * 60_000;

/** Batas item antrean: cegah bloat storage bila offline berhari-hari. */
export const POSITION_QUEUE_MAX_ITEMS = 500;

/** Potong antrean terpanjang: SOS dipertahankan, normal terbaru dipertahankan. */
export function capPositionQueue(
  queue: PositionQueueItem[],
  maxItems: number = POSITION_QUEUE_MAX_ITEMS,
): PositionQueueItem[] {
  if (queue.length <= maxItems) return queue;
  const sos = queue.filter((i) => i.priority === "sos");
  const normal = queue
    .filter((i) => i.priority !== "sos")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(0, maxItems - sos.length));
  const keep = new Set([...sos, ...normal].map((i) => i.id));
  return queue.filter((i) => keep.has(i.id));
}

let idCounter = 0;

export function createPositionQueueItem(input: {
  tripId: string;
  payload: LocationPayload;
  priority?: PositionQueuePriority;
  createdAt?: number;
  id?: string;
}): PositionQueueItem {
  idCounter += 1;
  return {
    id: input.id ?? `pos-${Date.now()}-${idCounter}`,
    tripId: input.tripId,
    payload: input.payload,
    priority: input.priority ?? "normal",
    createdAt: input.createdAt ?? Date.now(),
    attempts: 0,
  };
}

/** Dedup sisi klien: id sudah ada -> antrean tidak berubah. */
export function enqueuePosition(
  queue: PositionQueueItem[],
  item: PositionQueueItem,
): PositionQueueItem[] {
  if (queue.some((i) => i.id === item.id)) return queue;
  return [...queue, item];
}

/** Urutan flush: SOS dulu, lalu createdAt tertua. */
export function sortForFlush(queue: PositionQueueItem[]): PositionQueueItem[] {
  return [...queue].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "sos" ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
}

export async function flushPositionQueue(
  queue: PositionQueueItem[],
  send: (item: PositionQueueItem) => Promise<void>,
): Promise<{
  queue: PositionQueueItem[];
  sent: PositionQueueItem[];
  failed: PositionQueueItem[];
}> {
  const sent: PositionQueueItem[] = [];
  const failed: PositionQueueItem[] = [];
  const remaining = new Map(queue.map((i) => [i.id, i]));
  for (const item of sortForFlush(queue)) {
    const attempted: PositionQueueItem = {
      ...item,
      attempts: item.attempts + 1,
    };
    try {
      await send(attempted);
      remaining.delete(item.id);
      sent.push(attempted);
    } catch {
      remaining.set(item.id, attempted);
      failed.push(attempted);
      // Berhenti di kegagalan pertama: urutan tertua terjaga, item
      // berikutnya tidak dicoba sampai flush berikutnya.
      break;
    }
  }
  return {
    queue: queue
      .map((i) => remaining.get(i.id))
      .filter((i): i is PositionQueueItem => i !== undefined),
    sent,
    failed,
  };
}

/**
 * Prune retensi eksplisit: hanya item normal yang createdAt-nya lebih
 * tua dari TTL. SOS tidak pernah di-prune; item tepat di batas TTL
 * masih dipertahankan (baru "lebih tua" yang dibuang).
 */
export function pruneExpiredPositions(
  queue: PositionQueueItem[],
  now: number,
  ttlMs: number = POSITION_QUEUE_TTL_MS,
): PositionQueueItem[] {
  return queue.filter((i) => {
    if (i.priority === "sos") return true;
    return now - i.createdAt <= ttlMs;
  });
}

export function serializePositionQueue(queue: PositionQueueItem[]): string {
  return JSON.stringify(queue);
}

export function parsePositionQueue(
  serialized: string | null,
): PositionQueueItem[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is PositionQueueItem =>
        typeof i === "object" &&
        i !== null &&
        typeof (i as { id?: unknown }).id === "string" &&
        typeof (i as { tripId?: unknown }).tripId === "string" &&
        typeof (i as { payload?: unknown }).payload === "object" &&
        (i as { payload?: unknown }).payload !== null &&
        typeof (i as { payload: { lat?: unknown } }).payload.lat === "number" &&
        typeof (i as { payload: { lon?: unknown } }).payload.lon === "number",
    );
  } catch {
    return [];
  }
}

/** Port minimal yang dipakai sender — store maupun stub tes memenuhinya. */
export interface PositionQueuePort {
  enqueue(item: PositionQueueItem): Promise<PositionQueueItem[]>;
  flush(
    send: (item: PositionQueueItem) => Promise<void>,
  ): Promise<{
    queue: PositionQueueItem[];
    sent: PositionQueueItem[];
    failed: PositionQueueItem[];
  }>;
  prune?(now: number, ttlMs?: number): Promise<PositionQueueItem[]>;
}

/** Store antrean: memori + persist best-effort lewat adapter. */
export class PositionQueueStore implements PositionQueuePort {
  private items: PositionQueueItem[] | null = null;

  constructor(private readonly storage: PositionQueueStorage) {}

  async load(): Promise<PositionQueueItem[]> {
    if (this.items) return this.items;
    this.items = parsePositionQueue(await this.storage.load());
    return this.items;
  }

  private async persist(): Promise<void> {
    try {
      await this.storage.save(serializePositionQueue(this.items ?? []));
    } catch {
      // Persist best-effort (pola glimmer-store): antrean memori jalan.
    }
  }

  async enqueue(item: PositionQueueItem): Promise<PositionQueueItem[]> {
    const current = await this.load();
    this.items = capPositionQueue(enqueuePosition(current, item));
    await this.persist();
    return this.items;
  }

  async flush(
    send: (item: PositionQueueItem) => Promise<void>,
  ): Promise<{
    queue: PositionQueueItem[];
    sent: PositionQueueItem[];
    failed: PositionQueueItem[];
  }> {
    const current = await this.load();
    const result = await flushPositionQueue(current, send);
    this.items = result.queue;
    await this.persist();
    return result;
  }

  async remove(id: string): Promise<PositionQueueItem[]> {
    const current = await this.load();
    this.items = current.filter((i) => i.id !== id);
    await this.persist();
    return this.items;
  }

  /** Pembersih retensi eksplisit (bukan jalur kirim). */
  async prune(
    now: number,
    ttlMs: number = POSITION_QUEUE_TTL_MS,
  ): Promise<PositionQueueItem[]> {
    const current = await this.load();
    this.items = pruneExpiredPositions(current, now, ttlMs);
    await this.persist();
    return this.items;
  }
}
