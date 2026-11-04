// TDD — guard batas rekam/transkripsi SOS suara + render peta rute.
// Konstanta diimpor dari modul produksi (satu sumber kebenaran).
import { describe, expect, test } from "bun:test";

import {
  MAX_AUDIO_BASE64_LEN,
  MAX_RECORD_MS,
  TRANSCRIBE_TIMEOUT_MS,
} from "../utils/voice-sos-limits";
import {
  POSITION_QUEUE_MAX_ITEMS,
  capPositionQueue,
  createPositionQueueItem,
} from "../utils/position-queue";
import { routeMapHtml } from "../utils/route-map-html";
import type { LocationPayload } from "../utils/locations-api";

const PAYLOAD: LocationPayload = {
  lat: -7.19,
  lon: 109.92,
  timestamp: "2026-11-04T00:00:00.000Z",
};

describe("batas rekam SOS suara", () => {
  test("durasi rekam dibatasi 120 detik", () => {
    expect(MAX_RECORD_MS).toBe(120_000);
  });

  test("base64 dibatasi ~4 MB, transkripsi abort 60 detik", () => {
    expect(MAX_AUDIO_BASE64_LEN).toBe(4_000_000);
    expect(TRANSCRIBE_TIMEOUT_MS).toBe(60_000);
  });
});

describe("capPositionQueue", () => {
  test("di bawah batas -> tidak berubah", () => {
    const queue = [
      createPositionQueueItem({ tripId: "t1", payload: PAYLOAD }),
    ];
    expect(capPositionQueue(queue, 500)).toHaveLength(1);
  });

  test("kelebihan -> SOS dipertahankan, normal terbaru dipertahankan", () => {
    const queue = [
      createPositionQueueItem({
        tripId: "t1",
        payload: PAYLOAD,
        priority: "sos",
        createdAt: 1000,
      }),
      createPositionQueueItem({
        tripId: "t1",
        payload: PAYLOAD,
        createdAt: 2000,
      }),
      createPositionQueueItem({
        tripId: "t1",
        payload: PAYLOAD,
        createdAt: 3000,
      }),
    ];
    const capped = capPositionQueue(queue, 2);
    expect(capped).toHaveLength(2);
    expect(capped.some((i) => i.priority === "sos")).toBe(true);
    expect(capped.some((i) => i.createdAt === 3000)).toBe(true);
  });

  test("batas default 500 item", () => {
    expect(POSITION_QUEUE_MAX_ITEMS).toBe(500);
  });
});

describe("routeMapHtml", () => {
  test("render HTML minimal: peta + pin bernomor + pick", () => {
    const html = routeMapHtml(-7.19, 109.92);
    expect(html).toContain("leaflet");
    expect(html).toContain("-7.19");
    expect(html).toContain("setRoutePins");
    expect(html).toContain("ReactNativeWebView.postMessage");
    expect(html).toContain("tile.openstreetmap.org");
  });

  test("setMapCenter tersedia untuk hasil pencarian", () => {
    expect(routeMapHtml(0, 0)).toContain("window.setMapCenter");
  });
});
