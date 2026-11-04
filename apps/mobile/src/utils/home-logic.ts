// Logika layar beranda — murni, dites unit: sapaan per jam, inisial
// avatar, pemetaan status trip -> pill, pemilihan trip utama.
import { isTripExpired } from "./trip-dates";
import type { Trip, TripStatus } from "./trips-api";

const MORNING_START = 5;
const AFTERNOON_START = 11;
const EVENING_START = 15;
const NIGHT_START = 19;

export function greetingKey(hour: number): string {
  if (hour >= MORNING_START && hour < AFTERNOON_START) {
    return "home.greetMorning";
  }
  if (hour >= AFTERNOON_START && hour < EVENING_START) {
    return "home.greetAfternoon";
  }
  if (hour >= EVENING_START && hour < NIGHT_START) return "home.greetEvening";
  return "home.greetNight";
}

export function nameInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?";
}

export function greetingAccessibilityLabel(
  greeting: string,
  name: string,
): string {
  return `${greeting.trim()} ${name.trim()}`.trim();
}

export type PillKind = "idle" | "live" | "expired";

export interface StatusPill {
  kind: PillKind;
  labelKey: string;
}

// CLOSED = trip selesai normal (§17). Status EXPIRED terpisah menyusul
// bersama expired-rule §14 (kartu A-5) — label "Expired" dipakai nanti.
const STATUS_PILLS: Record<TripStatus, StatusPill> = {
  PLANNED: { kind: "idle", labelKey: "home.statusIdle" },
  ACTIVE: { kind: "live", labelKey: "home.statusLive" },
  CLOSED: { kind: "expired", labelKey: "home.statusFinished" },
};

export function tripStatusPill(status: TripStatus): StatusPill {
  return STATUS_PILLS[status];
}

// Pill tampilan: trip PLANNED yang tanggalnya sudah lewat tampil
// "Expired" (kunci home.statusExpired sudah ada di i18n id/en sejak
// kartu A-5, tapi belum pernah dipakai). ACTIVE/CLOSED tidak pernah
// expired — CLOSED tetap "Selesai", bukan "Expired".
export function tripDisplayPill(trip: Trip, now: Date = new Date()): StatusPill {
  if (isTripExpired(trip, now)) {
    return { kind: "expired", labelKey: "home.statusExpired" };
  }
  return tripStatusPill(trip.status);
}

// Tag kiri-bawah header kartu (TripCard): urutan menang sama dengan
// ternary lama di komponen, ditambah jalur PLANNED — trip PLANNED yang
// tanggalnya belum lewat dulu jatuh ke "TRIP AKTIF" padahal pill
// statusnya "Belum mulai". Pakai kunci home.statusIdle yang sudah ada
// ("Belum mulai"/"Not started"), tanpa kunci i18n baru.
export function tripCardTagKey(
  status: TripStatus,
  expired: boolean,
): string {
  if (status === "CLOSED") return "home.finishedTag";
  if (expired) return "home.expiredTag";
  if (status === "PLANNED") return "home.statusIdle";
  return "home.activeTag";
}

export interface HomeTrips {
  primary: Trip | null;
  others: Trip[];
}

// Kartu utama = trip ACTIVE pertama; tanpa ACTIVE, PLANNED pertama.
// Sisanya masuk "TRIP SAYA LAINNYA" urut PLANNED dulu baru CLOSED.
// Perbaikan bug QA 2 Nov 2026: trip expired (PLANNED + tanggal lewat)
// DISEMBUNYIKAN dari Beranda seluruhnya — bukan jadi utama, bukan
// masuk daftar lain. Kalau tidak ada trip non-expired sama sekali,
// primary null sehingga Beranda menampilkan empty state yang sudah ada.
// (Di daftar Trip Saya / detail, trip expired tetap tampil dengan
// label Expired — itu permukaan lain, bukan Beranda.)
// Banner peringatan profil (2 Nov 2026): tampil selama HP kosong
// dan/atau kontak darurat kosong; hilang hanya bila keduanya terisi.
// HP kosong = null/kosong/spasi saja; kontak kosong = jumlah <= 0.
export type ProfileWarning = "none" | "phone" | "contacts" | "both";

export function profileWarning(
  phone: string | null | undefined,
  contactCount: number,
): ProfileWarning {
  const phoneMissing = !phone || phone.trim().length === 0;
  const contactsMissing = contactCount <= 0;
  if (phoneMissing && contactsMissing) return "both";
  if (phoneMissing) return "phone";
  if (contactsMissing) return "contacts";
  return "none";
}

export function pickHomeTrips(trips: Trip[], now: Date = new Date()): HomeTrips {
  const visible = trips.filter((t) => !isTripExpired(t, now));
  if (visible.length === 0) return { primary: null, others: [] };
  const primary =
    visible.find((t) => t.status === "ACTIVE") ??
    visible.find((t) => t.status === "PLANNED") ??
    visible[0];
  const others = [
    ...visible.filter((t) => t !== primary && t.status !== "CLOSED"),
    ...visible.filter((t) => t !== primary && t.status === "CLOSED"),
  ];
  return { primary, others };
}
