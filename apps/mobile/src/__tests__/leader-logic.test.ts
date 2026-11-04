// TDD RED — logika dashboard leader: statistik tim (SOS aktif, baterai
// rendah, hilang sinyal), persen headcount, klien attendance/safety.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  fetchAttendanceSummary,
  fetchSafetyScore,
} from "../utils/leader-api";
import {
  findLeaderMember,
  headcountPercent,
  leaderCheckInState,
  leaderLoadOutcome,
  leaderScreenState,
  teamStats,
  LOW_BATTERY_THRESHOLD,
  SIGNAL_LOSS_MS,
} from "../utils/leader-logic";
import type { TripMember } from "../utils/trips-api";
import type { MemberPosition } from "../utils/locations-api";
import { setSessionCache } from "../utils/session-token";

const realFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

beforeEach(() => {
  setSessionCache("jwt-tes", "Budi");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
});

function pos(partial: {
  userId: string;
  battery?: number | null;
  tsOffsetMs?: number;
  noLocation?: boolean;
}): MemberPosition {
  return {
    userId: partial.userId,
    role: "MEMBER",
    user: { id: partial.userId, name: partial.userId, slug: partial.userId },
    location: partial.noLocation
      ? null
      : {
          id: `loc-${partial.userId}`,
          tripId: "t1",
          userId: partial.userId,
          lat: 0,
          lon: 0,
          batteryLevel: partial.battery ?? 80,
          ts: new Date(Date.now() - (partial.tsOffsetMs ?? 0)).toISOString(),
        },
  };
}

describe("teamStats", () => {
  test("hitung baterai <20% dan hilang sinyal (ts basi)", () => {
    const positions = [
      pos({ userId: "a", battery: 15 }),
      pos({ userId: "b", battery: 60 }),
      pos({ userId: "c", battery: 50, tsOffsetMs: SIGNAL_LOSS_MS + 60000 }),
      pos({ userId: "d", noLocation: true }),
    ];
    const stats = teamStats(positions, 2);
    expect(stats.sosCount).toBe(2);
    expect(stats.lowBattery).toBe(1);
    // c basi + d tanpa posisi sama sekali = 2 hilang sinyal
    expect(stats.signalLost).toBe(2);
  });

  test("ambang baterai = konstanta 20", () => {
    expect(LOW_BATTERY_THRESHOLD).toBe(20);
    const stats = teamStats([pos({ userId: "a", battery: 20 })], 0);
    expect(stats.lowBattery).toBe(0); // tepat 20 bukan < 20
  });
});

describe("headcountPercent", () => {
  test("12/14 -> 86 (dibulatkan)", () => {
    expect(headcountPercent(12, 14)).toBe(86);
  });
  test("0 total -> 0", () => {
    expect(headcountPercent(0, 0)).toBe(0);
  });
});

describe("leaderScreenState", () => {
  test("belum loaded -> loading (bukan cangkang kosong 0/0)", () => {
    expect(
      leaderScreenState({ loaded: false, hasTrip: false, hasError: false }),
    ).toBe("loading");
  });

  test("loaded + error + tanpa trip -> error", () => {
    expect(
      leaderScreenState({ loaded: true, hasTrip: false, hasError: true }),
    ).toBe("error");
  });

  test("loaded + trip -> ready walau ada error polling susulan", () => {
    expect(
      leaderScreenState({ loaded: true, hasTrip: true, hasError: true }),
    ).toBe("ready");
  });

  test("loaded + trip + tanpa error -> ready", () => {
    expect(
      leaderScreenState({ loaded: true, hasTrip: true, hasError: false }),
    ).toBe("ready");
  });
});

describe("leaderLoadOutcome", () => {
  test("muat pertama gagal posisi -> error (bukan cangkang 0/0)", () => {
    expect(
      leaderLoadOutcome({
        everLoaded: false,
        positionsFailed: true,
        attendanceFailed: false,
      }),
    ).toBe("error");
  });

  test("muat pertama gagal attendance -> error", () => {
    expect(
      leaderLoadOutcome({
        everLoaded: false,
        positionsFailed: false,
        attendanceFailed: true,
      }),
    ).toBe("error");
  });

  test("muat pertama gagal keduanya -> error", () => {
    expect(
      leaderLoadOutcome({
        everLoaded: false,
        positionsFailed: true,
        attendanceFailed: true,
      }),
    ).toBe("error");
  });

  test("polling susulan gagal posisi -> banner, data lama dipertahankan", () => {
    expect(
      leaderLoadOutcome({
        everLoaded: true,
        positionsFailed: true,
        attendanceFailed: false,
      }),
    ).toBe("banner");
  });

  test("polling susulan gagal attendance -> banner", () => {
    expect(
      leaderLoadOutcome({
        everLoaded: true,
        positionsFailed: false,
        attendanceFailed: true,
      }),
    ).toBe("banner");
  });

  test("tidak ada yang gagal -> ok (muat pertama maupun susulan)", () => {
    expect(
      leaderLoadOutcome({
        everLoaded: false,
        positionsFailed: false,
        attendanceFailed: false,
      }),
    ).toBe("ok");
    expect(
      leaderLoadOutcome({
        everLoaded: true,
        positionsFailed: false,
        attendanceFailed: false,
      }),
    ).toBe("ok");
  });
});

// TDD RED — tombol check-in titik kumpul di layar Leader: cari
// anggota LEADER + status tombol (sudah-sampai / menekan / siap).
function tripMember(partial: {
  userId: string;
  role: TripMember["role"];
  attendance: TripMember["attendance"];
}): TripMember {
  return {
    tripId: "trip-1",
    userId: partial.userId,
    role: partial.role,
    attendance: partial.attendance,
    user: { id: partial.userId, name: partial.userId, slug: partial.userId },
  };
}

describe("check-in leader", () => {
  test("findLeaderMember mengembalikan anggota LEADER saja", () => {
    const members = [
      tripMember({ userId: "u1", role: "MEMBER", attendance: "DEPARTED" }),
      tripMember({ userId: "u2", role: "LEADER", attendance: "NOT_DEPARTED" }),
    ];
    expect(findLeaderMember(members)?.userId).toBe("u2");
  });

  test("findLeaderMember tanpa anggota / tanpa LEADER → undefined", () => {
    expect(findLeaderMember(null)).toBeUndefined();
    expect(findLeaderMember([])).toBeUndefined();
    expect(
      findLeaderMember([
        tripMember({ userId: "u1", role: "MEMBER", attendance: "DEPARTED" }),
      ]),
    ).toBeUndefined();
  });

  test("leaderCheckInState: DEPARTED → arrived (tombol nonaktif)", () => {
    expect(
      leaderCheckInState({ leaderAttendance: "DEPARTED", checkingIn: false }),
    ).toBe("arrived");
  });

  test("leaderCheckInState: NOT_DEPARTED → ready", () => {
    expect(
      leaderCheckInState({
        leaderAttendance: "NOT_DEPARTED",
        checkingIn: false,
      }),
    ).toBe("ready");
  });

  test("leaderCheckInState: anggota gagal dimuat (null) → ready — tombol tetap bisa ditekan karena server idempotent", () => {
    expect(
      leaderCheckInState({ leaderAttendance: null, checkingIn: false }),
    ).toBe("ready");
  });

  test("leaderCheckInState: sedang menekan → checking", () => {
    expect(
      leaderCheckInState({
        leaderAttendance: "NOT_DEPARTED",
        checkingIn: true,
      }),
    ).toBe("checking");
  });
});

describe("klien leader", () => {
  test("GET attendance-summary", async () => {
    mockFetch(200, { data: { total: 14, departed: 12, notDeparted: 2 } });
    const summary = await fetchAttendanceSummary("t1");
    expect(summary.departed).toBe(12);
    expect(summary.notDeparted).toBe(2);
  });

  test("GET safety-score", async () => {
    mockFetch(200, { data: { score: 65, staleMembers: 1, activeSos: 1 } });
    const safety = await fetchSafetyScore("t1");
    expect(safety.score).toBe(65);
  });
});
