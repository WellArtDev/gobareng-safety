// TDD RED — logika layar beranda: sapaan per jam, inisial avatar,
// pemetaan status trip -> pill, pemilihan trip aktif vs lainnya.
import { describe, expect, test } from "bun:test";

import {
  greetingKey,
  greetingAccessibilityLabel,
  nameInitial,
  pickHomeTrips,
  profileWarning,
  tripCardTagKey,
  tripDisplayPill,
  tripStatusPill,
} from "../utils/home-logic";
import type { Trip } from "../utils/trips-api";

function trip(partial: Partial<Trip>): Trip {
  return {
    id: "t1",
    name: "Pendakian Prau",
    type: "HIKING",
    date: "2026-10-25",
    meetingPoint: "Basecamp Patak Banteng",
    meetingLat: null,
    meetingLon: null,
    quota: null,
    isOpenTrip: false,
    status: "PLANNED",
    leaderId: "u1",
    createdAt: "2026-10-20T00:00:00.000Z",
    ...partial,
  };
}

describe("greetingKey", () => {
  test("pagi 5-10, siang 11-14, sore 15-18, malam 19-4", () => {
    expect(greetingKey(5)).toBe("home.greetMorning");
    expect(greetingKey(10)).toBe("home.greetMorning");
    expect(greetingKey(11)).toBe("home.greetAfternoon");
    expect(greetingKey(14)).toBe("home.greetAfternoon");
    expect(greetingKey(15)).toBe("home.greetEvening");
    expect(greetingKey(18)).toBe("home.greetEvening");
    expect(greetingKey(19)).toBe("home.greetNight");
    expect(greetingKey(4)).toBe("home.greetNight");
    expect(greetingKey(0)).toBe("home.greetNight");
  });
});

describe("greetingAccessibilityLabel", () => {
  test("groups greeting and user name without grouping sibling controls", () => {
    expect(greetingAccessibilityLabel("Selamat pagi,", "Wella")).toBe(
      "Selamat pagi, Wella",
    );
  });
});

describe("nameInitial", () => {
  test("huruf pertama kapital; kosong -> ?", () => {
    expect(nameInitial("wella")).toBe("W");
    expect(nameInitial("Budi Santoso")).toBe("B");
    expect(nameInitial("")).toBe("?");
    expect(nameInitial("  ")).toBe("?");
  });
});

describe("tripStatusPill", () => {
  test("PLANNED -> idle Belum mulai, ACTIVE -> live, CLOSED -> selesai", () => {
    expect(tripStatusPill("PLANNED")).toEqual({
      kind: "idle",
      labelKey: "home.statusIdle",
    });
    expect(tripStatusPill("ACTIVE")).toEqual({
      kind: "live",
      labelKey: "home.statusLive",
    });
    // CLOSED = selesai normal; label "Expired" khusus expired-rule §14
    // (kartu A-5), bukan status CLOSED.
    expect(tripStatusPill("CLOSED")).toEqual({
      kind: "expired",
      labelKey: "home.statusFinished",
    });
  });
});

describe("pickHomeTrips", () => {
  // Fixture tanggal 2026-10-25: "sekarang" dipatok sebelum tanggal itu
  // supaya PLANNED fixture belum expired (aturan baru menyaring trip
  // expired dari Beranda; tanpa now, tes ini membusuk begitu kalender
  // berjalan melewati tanggal fixture).
  const beforeFixture = new Date(2026, 9, 22, 12, 0, 0);

  test("trip ACTIVE jadi utama; sisanya ke daftar lain", () => {
    const active = trip({ id: "a", status: "ACTIVE" });
    const planned = trip({ id: "p", status: "PLANNED" });
    const closed = trip({ id: "c", status: "CLOSED" });
    const { primary, others } = pickHomeTrips(
      [closed, planned, active],
      beforeFixture,
    );
    expect(primary?.id).toBe("a");
    expect(others.map((t) => t.id)).toEqual(["p", "c"]);
  });

  test("tanpa ACTIVE: PLANNED terdepan jadi utama", () => {
    const planned = trip({ id: "p", status: "PLANNED" });
    const closed = trip({ id: "c", status: "CLOSED" });
    const { primary, others } = pickHomeTrips(
      [closed, planned],
      beforeFixture,
    );
    expect(primary?.id).toBe("p");
    expect(others.map((t) => t.id)).toEqual(["c"]);
  });

  test("kosong: primary null", () => {
    expect(pickHomeTrips([])).toEqual({ primary: null, others: [] });
  });

  // Bug QA 2 Nov 2026: Demo Trip Prau (PLANNED, 28 Okt) tampil di kartu
  // utama Beranda padahal tanggalnya sudah lewat. Trip expired harus
  // HILANG dari Beranda — bukan jadi utama, bukan masuk daftar lain.
  test("trip expired tidak jadi utama dan tidak masuk daftar lain", () => {
    const now = new Date(2026, 10, 2, 12, 0, 0);
    const expired = trip({ id: "e", status: "PLANNED", date: "2026-10-28" });
    const upcoming = trip({ id: "p", status: "PLANNED", date: "2026-11-10" });
    const { primary, others } = pickHomeTrips([expired, upcoming], now);
    expect(primary?.id).toBe("p");
    expect(others.map((t) => t.id)).toEqual([]);
  });

  test("hanya trip expired: primary null + empty state", () => {
    const now = new Date(2026, 10, 2, 12, 0, 0);
    const expired = trip({ id: "e", status: "PLANNED", date: "2026-10-28" });
    expect(pickHomeTrips([expired], now)).toEqual({
      primary: null,
      others: [],
    });
  });

  test("trip ACTIVE tanggal lewat tetap utama (bukan expired)", () => {
    const now = new Date(2026, 10, 2, 12, 0, 0);
    const active = trip({ id: "a", status: "ACTIVE", date: "2026-10-28" });
    const expired = trip({ id: "e", status: "PLANNED", date: "2026-10-28" });
    const { primary, others } = pickHomeTrips([expired, active], now);
    expect(primary?.id).toBe("a");
    expect(others.map((t) => t.id)).toEqual([]);
  });
});

describe("tripDisplayPill", () => {
  test("PLANNED tanggal lewat -> expired pill label Expired", () => {
    const now = new Date(2026, 10, 2, 12, 0, 0);
    const expired = trip({ status: "PLANNED", date: "2026-10-28" });
    expect(tripDisplayPill(expired, now)).toEqual({
      kind: "expired",
      labelKey: "home.statusExpired",
    });
  });

  test("PLANNED tanggal ke depan -> tetap idle Belum mulai", () => {
    const now = new Date(2026, 10, 2, 12, 0, 0);
    const upcoming = trip({ status: "PLANNED", date: "2026-11-10" });
    expect(tripDisplayPill(upcoming, now)).toEqual({
      kind: "idle",
      labelKey: "home.statusIdle",
    });
  });
});

describe("tripCardTagKey", () => {
  test("CLOSED -> SELESAI, apa pun expired", () => {
    expect(tripCardTagKey("CLOSED", true)).toBe("home.finishedTag");
    expect(tripCardTagKey("CLOSED", false)).toBe("home.finishedTag");
  });

  test("PLANNED tanggal lewat (expired) -> EXPIRED", () => {
    expect(tripCardTagKey("PLANNED", true)).toBe("home.expiredTag");
  });

  test("PLANNED belum lewat -> Belum mulai (bukan TRIP AKTIF)", () => {
    expect(tripCardTagKey("PLANNED", false)).toBe("home.statusIdle");
  });

  test("ACTIVE -> TRIP AKTIF", () => {
    expect(tripCardTagKey("ACTIVE", false)).toBe("home.activeTag");
  });
});

describe("profileWarning", () => {
  test("keduanya kosong -> both; hanya HP -> phone; hanya kontak -> contacts", () => {
    expect(profileWarning(null, 0)).toBe("both");
    expect(profileWarning("   ", 0)).toBe("both");
    expect(profileWarning(null, 2)).toBe("phone");
    expect(profileWarning("", 2)).toBe("phone");
    expect(profileWarning("0811111111", 0)).toBe("contacts");
  });
  test("keduanya terisi -> none (banner hilang)", () => {
    expect(profileWarning("0811111111", 1)).toBe("none");
    expect(profileWarning("0811111111", 3)).toBe("none");
  });
});
