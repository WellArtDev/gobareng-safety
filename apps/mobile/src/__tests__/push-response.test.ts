// Ketuk notifikasi push trip-dimulai -> layar tracking trip itu.
// TDD RED: pemicu tracking sedini mungkin untuk anggota — HP leader
// TIDAK bisa menyalakan GPS anggota dari jauh, jadi ketukan notifikasi
// inilah yang membuka tracking (pengirim posisi jalan saat layar fokus
// / background task saat layar ditinggalkan). Semua dependensi
// di-inject: tanpa React, tanpa device beneran.
import { describe, expect, test } from "bun:test";

import {
  handlePushResponse,
  resolveTripStartedPushTarget,
  setupTripStartedPushResponse,
  type PushResponseNotificationsLike,
} from "../utils/push-response";

type Listener = (response: {
  notification: { request: { content: { data?: Record<string, unknown> | null } } };
}) => void;

function makeFake(): {
  notifications: PushResponseNotificationsLike;
  fire: (data?: Record<string, unknown> | null) => void;
} {
  let listener: Listener | null = null;
  return {
    notifications: {
      addNotificationResponseReceivedListener(cb) {
        listener = cb;
        return { remove: () => undefined };
      },
    },
    fire(data) {
      listener?.({
        notification: { request: { content: { data } } },
      });
    },
  };
}

describe("resolveTripStartedPushTarget", () => {
  test("TRIP_STARTED + sesi ada -> /trips/<id>/tracking", () => {
    expect(
      resolveTripStartedPushTarget({ type: "TRIP_STARTED", tripId: "trip-1" }, true),
    ).toBe("/trips/trip-1/tracking");
  });

  test("tanpa sesi -> null (jangan navigasi sebelum login)", () => {
    expect(
      resolveTripStartedPushTarget({ type: "TRIP_STARTED", tripId: "trip-1" }, false),
    ).toBeNull();
  });

  test("type lain -> null", () => {
    expect(
      resolveTripStartedPushTarget({ type: "SOS", tripId: "trip-1" }, true),
    ).toBeNull();
  });

  test("tripId hilang / bukan string -> null", () => {
    expect(resolveTripStartedPushTarget({ type: "TRIP_STARTED" }, true)).toBeNull();
    expect(
      resolveTripStartedPushTarget({ type: "TRIP_STARTED", tripId: 42 }, true),
    ).toBeNull();
    expect(
      resolveTripStartedPushTarget({ type: "TRIP_STARTED", tripId: "" }, true),
    ).toBeNull();
  });

  test("data null -> null", () => {
    expect(resolveTripStartedPushTarget(null, true)).toBeNull();
  });
});

describe("handlePushResponse + setup", () => {
  test("setup sekali: ketuk TRIP_STARTED navigasi sekali; setup kedua tidak menggandakan", () => {
    const fake = makeFake();
    const navigated: string[] = [];
    const navigate = (path: string) => {
      navigated.push(path);
    };
    setupTripStartedPushResponse(fake.notifications, () => true, navigate);
    setupTripStartedPushResponse(fake.notifications, () => true, navigate);
    fake.fire({ type: "TRIP_STARTED", tripId: "trip-9" });
    expect(navigated).toEqual(["/trips/trip-9/tracking"]);
  });

  test("handlePushResponse: tanpa sesi tidak navigasi", () => {
    const navigated: string[] = [];
    handlePushResponse({ type: "TRIP_STARTED", tripId: "trip-1" }, false, (p) =>
      navigated.push(p),
    );
    expect(navigated).toEqual([]);
  });
});
