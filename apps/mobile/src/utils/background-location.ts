// Wiring Expo background tracking M5/W-5 — tipis saja, logika di
// background-location-logic.ts (yang dites unit). File ini HARUS
// di-import sekali di root layout (side-effect): defineTask di sini
// membuat OS bisa mengantarkan update lokasi ke handler ini bahkan
// setelah proses app di-restart — tanpa import itu, task tidak jalan.
//
// Batasan yang disengaja (bukan bug yang terlewat):
// - Task hanya jalan selama sesi tracking: layar tracking yang
//   me-start/stop-nya. Sejak perbaikan 4 Nov 2026, unmount tracking
//   TIDAK lagi menghentikan task untuk trip ACTIVE (tombol back ke
//   detail trip harus menjaga pengiriman); yang menghentikan task
//   adalah Akhiri Trip (eksplisit, sebelum replace) atau status trip
//   yang bukan lagi ACTIVE.
// - Trip yang diakhiri dari perangkat lain tidak terdeteksi task ini:
//   handler tidak memanggil API status trip tiap fix (hemat baterai).
//   Pengguna yang kembali ke layar tracking akan menghentikan task
//   karena status trip bukan lagi ACTIVE.
// - Gagal kirim (offline/server error) masuk antrean offline lewat
//   PositionQueueStore (M7) — tick flush berikutnya mengirimnya, bukan
//   dibuang diam-diam.
// - Koordinat mock TIDAK PERNAH dikirim: di-skip lokal, bukan
//   diteruskan ke server seperti pengirim foreground.
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

import {
  BACKGROUND_LOCATION_TASK,
  getBackgroundIntervalMs,
  shouldSendBackgroundPosition,
} from "./background-location-logic";
import { postLocation } from "./locations-api";
import {
  createPositionQueueItem,
  type PositionQueuePort,
} from "./position-queue";
import { positionQueueStore } from "./position-queue-store";
import { colors } from "../theme/tokens";
import type { TripType } from "./trips-api";

// Antrean offline background: disuntik supaya tes bisa pakai stub.
let backgroundQueue: PositionQueuePort = positionQueueStore;

/** Override antrean untuk tes (tanpa SecureStore). */
export function setBackgroundQueueForTests(
  queue: PositionQueuePort | null,
): void {
  backgroundQueue = queue ?? positionQueueStore;
}

// Ambang baterai rendah disamakan dengan server (ai-leader: < 20%).
const BATTERY_LOW_PCT = 20;
const BACKGROUND_TRIP_KEY = "gobareng-background-trip";

interface BackgroundTrip {
  tripId: string;
  tripType: TripType;
}

let activeTrip: BackgroundTrip | null = null;
let lastSent: { at: number; lat: number; lon: number } | null = null;
// Antre serial supaya start/stop yang dipicu effect layar (cleanup +
// effect baru) tidak balapan: stop selalu tuntas sebelum start jalan.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function readStoredTrip(): Promise<BackgroundTrip | null> {
  try {
    const raw = await SecureStore.getItemAsync(BACKGROUND_TRIP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BackgroundTrip>;
    if (
      typeof parsed.tripId === "string" &&
      (parsed.tripType === "HIKING" || parsed.tripType === "TOURING")
    ) {
      return { tripId: parsed.tripId, tripType: parsed.tripType };
    }
    return null;
  } catch {
    return null;
  }
}

async function readBatteryPct(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (typeof level !== "number" || level < 0 || level > 1) return null;
    return Math.round(level * 100);
  } catch {
    return null;
  }
}

// Handler task: dipanggil OS tiap ada fix lokasi baru. Fail-soft total:
// error apa pun ditelan supaya task tidak dimatikan OS.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async (body) => {
  try {
    if (body.error) return;
    const data = body.data as {
      locations?: Array<{
        coords: {
          latitude: number;
          longitude: number;
          accuracy?: number | null;
          speed?: number | null;
          heading?: number | null;
          altitude?: number | null;
          mocked?: boolean;
        };
      }>;
    } | null;
    const locations = data?.locations;
    if (!locations || locations.length === 0) return;
    const trip = activeTrip ?? (await readStoredTrip());
    if (trip === null) return;
    if (activeTrip === null) activeTrip = trip;
    const fix = locations[locations.length - 1];
    const coords = fix.coords;
    const batteryPct = await readBatteryPct();
    const send = shouldSendBackgroundPosition({
      now: Date.now(),
      tripType: trip.tripType,
      batteryLow: batteryPct !== null && batteryPct < BATTERY_LOW_PCT,
      mocked: coords.mocked === true,
      current: { lat: coords.latitude, lon: coords.longitude },
      lastSent,
    });
    if (!send) return;
    const payload = {
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy: coords.accuracy ?? undefined,
      speed: coords.speed ?? undefined,
      heading: coords.heading ?? undefined,
      altitude: coords.altitude ?? undefined,
      batteryLevel: batteryPct ?? undefined,
      timestamp: new Date().toISOString(),
      isMock: false,
    };
    try {
      await postLocation(trip.tripId, payload);
    } catch {
      // Offline/server error -> antre, jangan buang. Best-effort:
      // storage ikut gagal pun tick berikut mencoba lagi.
      try {
        await backgroundQueue.enqueue(
          createPositionQueueItem({ tripId: trip.tripId, payload }),
        );
      } catch {
        // Abaikan — fail-soft total, fix berikutnya mencoba lagi.
      }
      return;
    }
    lastSent = {
      at: Date.now(),
      lat: coords.latitude,
      lon: coords.longitude,
    };
  } catch {
    // Fail-soft: fix berikutnya mencoba lagi.
  }
});

async function doStop(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK,
    );
    if (registered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch {
    // Fail-soft: state lokal tetap dibersihkan.
  }
  activeTrip = null;
  lastSent = null;
  try {
    await SecureStore.deleteItemAsync(BACKGROUND_TRIP_KEY);
  } catch {
    // Abaikan: trip tersimpan akan diabaikan karena layar tidak lagi
    // me-restart task untuk trip itu.
  }
}

// Start background tracking untuk satu trip ACTIVE. Idempotent: task
// lama selalu dihentikan dulu supaya tidak ada dua task jalan. Butuh
// izin lokasi "always" — bila ditolak, kembalikan false dan pengirim
// foreground tetap menjadi satu-satunya pengirim saat layar fokus.
export function startBackgroundLocation(
  tripId: string,
  tripType: TripType,
): Promise<boolean> {
  return enqueue(async () => {
    try {
      const { status } =
        await Location.requestBackgroundPermissionsAsync();
      if (status !== "granted") return false;
      await doStop();
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: getBackgroundIntervalMs(tripType, false),
        distanceInterval: 0,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "GoBareng — trip berjalan",
          notificationBody:
            "Posisimu tetap terkirim ke rombongan selama trip aktif.",
          notificationColor: colors.primary,
        },
      });
      activeTrip = { tripId, tripType };
      lastSent = null;
      await SecureStore.setItemAsync(
        BACKGROUND_TRIP_KEY,
        JSON.stringify({ tripId, tripType }),
      );
      return true;
    } catch {
      return false;
    }
  });
}

export function stopBackgroundLocation(): Promise<void> {
  return enqueue(() => doStop());
}
