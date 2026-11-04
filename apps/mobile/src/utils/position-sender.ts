// Pengirim posisi foreground — tracking screen saja, trip ACTIVE saja.
// Pasangannya untuk background ada di background-location.ts; layar
// tracking memilih satu pengirim lewat chooseActiveSender (tidak
// pernah dua-duanya). Gagal (GPS ditolak/offline/server error)
// ditelan diam-diam: tidak ada banner error, tidak ada retry storm —
// tick berikutnya 10 detik kemudian mencoba lagi. Tidak pernah kirim
// koordinat palsu: posisi null = skip, flag mocked diteruskan apa adanya
// (server menolaknya dengan MOCK_LOCATION_REJECTED).
//
// M7 — dedup + heartbeat + antrean offline:
// - Dedup: posisi dalam SAME_PLACE_RADIUS_M (25 m, guard terhadap drift
//   GPS) dari posisi TERKIRIM terakhir di-drop diam-diam — bukan gagal
//   kirim, jadi tidak masuk antrean.
// - Heartbeat: walau diam di tempat, kirim paksa tiap HEARTBEAT_MS
//   (5 menit) supaya last-seen server tetap segar. Ini yang menjaga
//   bedanya "diam tapi online" (timestamp segar, koordinat nyaris sama)
//   vs "diam-diam hilang" (tidak ada POST sama sekali -> signal loss).
// - Antrean: POST gagal (offline/server error) -> posisi masuk antrean
//   lewat queue port, bukan dibuang. Tick berikut flush antrean dulu
//   (SOS dulu, lalu tertua) sebelum posisi segar; item keluar antrean
//   hanya setelah 2xx (lihat position-queue.ts).
import type { LocationPayload } from "./locations-api";
import {
  createPositionQueueItem,
  type PositionQueuePort,
} from "./position-queue";
import type { TripStatus } from "./trips-api";

// Interval kirim: 10 detik — cukup rapat buat demo peta bergerak,
// cukup renggang buat baterai. Jangan pernah lebih cepat dari ini.
export const POSITION_SEND_MS = 10000;

// Radius "tempat yang sama": di bawah ini dianggap drift GPS, bukan
// gerakan — posisi di-drop (kecuali heartbeat, lihat HEARTBEAT_MS).
export const SAME_PLACE_RADIUS_M = 25;

// Heartbeat: paksa kirim walau stasioner, supaya last-seen server
// (Location.ts terbaru per member) tidak pernah basi lebih dari ini.
export const HEARTBEAT_MS = 300000;

export interface DetailedPosition {
  lat: number;
  lon: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  mocked?: boolean;
}

export interface PositionSenderDeps {
  getPosition: () => Promise<DetailedPosition | null>;
  post: (tripId: string, payload: LocationPayload) => Promise<void>;
  intervalMs?: number;
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (id: unknown) => void;
  /** Jam yang bisa di-inject tes (default Date.now). */
  nowMs?: () => number;
  /** Antrean offline (produksi: positionQueueStore). Tanpa ini, POST
   * gagal kembali ke perilaku lama: ditelan diam-diam tanpa antre. */
  queue?: PositionQueuePort;
}

export interface PositionSender {
  start(tripId: string): void;
  stop(): void;
  readonly running: boolean;
  tick(): Promise<void>;
}

// Gate tunggal: fokus layar + trip ACTIVE. PLANNED/CLOSED tidak kirim
// (server juga akan menolak, tapi jangan buang request sia-sia).
export function shouldSendPosition(
  isFocused: boolean,
  status: TripStatus | null | undefined,
): boolean {
  return isFocused === true && status === "ACTIVE";
}

/** Jarak great-circle dalam meter (haversine, R bumi 6.371 km). */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

export interface LastSentPosition {
  lat: number;
  lon: number;
  atMs: number;
}

/**
 * Keputusan dedup: kirim bila belum pernah kirim, bila bergerak di luar
 * SAME_PLACE_RADIUS_M dari posisi terkirim terakhir, ATAU bila sudah
 * HEARTBEAT_MS sejak kirim terakhir (heartbeat stasioner).
 */
export function shouldSendAfterDedup(
  lastSent: LastSentPosition | null,
  pos: { lat: number; lon: number },
  nowMs: number,
): boolean {
  if (lastSent === null) return true;
  if (
    haversineMeters(lastSent.lat, lastSent.lon, pos.lat, pos.lon) >=
    SAME_PLACE_RADIUS_M
  ) {
    return true;
  }
  return nowMs - lastSent.atMs >= HEARTBEAT_MS;
}

export function createPositionSender(deps: PositionSenderDeps): PositionSender {
  const intervalMs = deps.intervalMs ?? POSITION_SEND_MS;
  const setIntervalFn = deps.setIntervalFn ?? setInterval;
  // clearInterval bawaan minta number; handle timer disimpan opaque.
  const clearIntervalFn =
    deps.clearIntervalFn ??
    ((id: unknown) => {
      clearInterval(id as number);
    });
  let timer: unknown = null;
  let tripId: string | null = null;
  let posting = false;
  let running = false;
  // Posisi TERKIRIM terakhir (sudah 2xx, termasuk via flush antrean) —
  // patokan dedup + jam heartbeat. Reset tiap stop/ganti trip.
  let lastSent: LastSentPosition | null = null;
  const nowMs = deps.nowMs ?? Date.now;

  async function tick(): Promise<void> {
    if (!running || tripId === null || posting) return;
    posting = true;
    try {
      // 1. Flush antrean dulu (SOS dulu, lalu tertua): posisi lama yang
      //    sempat offline mendahului posisi segar. Gagal flush = diam,
      //    item tetap antre untuk tick berikutnya.
      if (deps.queue) {
        try {
          // Prune retensi sebelum flush: buang posisi normal kedaluwarsa
          // (SOS tak pernah di-prune), supaya antrean tak tumbuh tanpa
          // batas selama offline berhari-hari.
          if (deps.queue.prune) {
            try {
              await deps.queue.prune(nowMs());
            } catch {
              // Best-effort: lanjut flush walau prune gagal.
            }
          }
          const flushed = await deps.queue.flush(async (item) => {
            await deps.post(item.tripId, item.payload);
          });
          const last = flushed.sent[flushed.sent.length - 1];
          if (last) {
            lastSent = {
              lat: last.payload.lat,
              lon: last.payload.lon,
              atMs: nowMs(),
            };
          }
        } catch {
          // Fail-soft: antrean tetap utuh di store (flush hanya
          // menghapus item yang 2xx); lanjut ke posisi segar.
        }
      }
      const pos = await deps.getPosition();
      if (pos === null) return;
      const payload: LocationPayload = {
        lat: pos.lat,
        lon: pos.lon,
        accuracy: pos.accuracy ?? undefined,
        speed: pos.speed ?? undefined,
        heading: pos.heading ?? undefined,
        altitude: pos.altitude ?? undefined,
        timestamp: new Date().toISOString(),
        isMock: pos.mocked,
      };
      // 2. Dedup: dalam radius + belum heartbeat -> drop diam-diam
      //    (bukan gagal kirim, jadi tidak masuk antrean).
      if (!shouldSendAfterDedup(lastSent, pos, nowMs())) return;
      try {
        await deps.post(tripId, payload);
        lastSent = { lat: pos.lat, lon: pos.lon, atMs: nowMs() };
      } catch {
        // 3. POST gagal -> antre, jangan buang. Tanpa queue, perilaku
        //    lama berlaku: ditelan diam-diam, tick berikut mencoba lagi.
        if (deps.queue) {
          try {
            await deps.queue.enqueue(
              createPositionQueueItem({ tripId, payload }),
            );
          } catch {
            // Persist antrean best-effort; posisi hilang hanya bila
            // storage ikut gagal — sama seperti pola glimmer-store.
          }
        }
      }
    } catch {
      // Fail-soft diam-diam: GPS gagal / flush tak terduga — tidak ada
      // banner, tidak ada retry storm; tick interval berikut mencoba lagi.
    } finally {
      posting = false;
    }
  }

  function stop(): void {
    if (timer !== null) {
      clearIntervalFn(timer);
      timer = null;
    }
    tripId = null;
    running = false;
    lastSent = null;
  }

  function start(nextTripId: string): void {
    // Idempotent + ganti trip: interval lama selalu dibersihkan dulu
    // supaya tidak pernah ada dua timer jalan bersamaan.
    stop();
    tripId = nextTripId;
    running = true;
    timer = setIntervalFn(() => {
      void tick();
    }, intervalMs);
    void tick();
  }

  return {
    start,
    stop,
    tick,
    get running() {
      return running;
    },
  };
}
