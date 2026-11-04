// Bystander dispatch for SOS (M2, server-side).
// Rule (locked in PRD): on SOS trigger, trip members whose LAST KNOWN
// location is within config.bystanderRadiusKm (2 km) of the SOS location
// are bystanders — excluding the SOS sender. A-1: reads via the Prisma
// Db; per-SOS idempotency lives on Db.recordDispatch.
import { config } from "./config.js";
import type { Db } from "./db.js";
import type { SosAlert } from "./store.js";

export interface Bystander {
  userId: string;
  distanceKm: number;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export async function selectBystanders(db: Db, alert: SosAlert): Promise<Bystander[]> {
  const radiusKm = config.bystanderRadiusKm;
  return (await db.latestLocations(alert.tripId))
    .filter((loc) => loc.userId !== alert.senderId)
    .map((loc) => ({
      userId: loc.userId,
      distanceKm: haversineKm(alert.lat, alert.lon, loc.lat, loc.lon),
    }))
    .filter((b) => b.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// SOS Umum: pola yang sama, tapi tanpa trip — posisi terakhir dibaca
// lintas trip, dan penerima disaring ke akun TERVERIFIKASI saja
// (pembatas anti-penyalahgunaan Wella 2 Nov 2026). Pengirim dikecualikan.
export async function selectNearbyVerifiedUsers(
  db: Db,
  senderId: string,
  lat: number,
  lon: number,
): Promise<Bystander[]> {
  const radiusKm = config.bystanderRadiusKm;
  const candidates = (await db.latestLocationsGlobal())
    .filter((loc) => loc.userId !== senderId)
    .map((loc) => ({
      userId: loc.userId,
      distanceKm: haversineKm(lat, lon, loc.lat, loc.lon),
    }))
    .filter((b) => b.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const verified: Bystander[] = [];
  for (const c of candidates) {
    const user = await db.userById(c.userId);
    if (user?.isVerified) verified.push(c);
  }
  return verified;
}

// WA SOS umum: HANYA Pengguna Sekitar yang punya nomor HP — tanpa
// kontak darurat pengirim, tanpa leader (keduanya tidak ada di SOS umum).
export async function collectGeneralSosWaRecipients(
  db: Db,
  recipients: Bystander[],
): Promise<WaRecipient[]> {
  const out: WaRecipient[] = [];
  const seen = new Set<string>();
  for (const r of recipients) {
    const phone = (await db.userById(r.userId))?.phone;
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({ phone, kind: "BYSTANDER" });
  }
  return out;
}

// A-4 (decision 28 Okt 2026): WA SOS recipients = ALL THREE groups —
// the sender's emergency contacts, the leader's phone, AND bystanders
// within 2 km that have a phone on file. Sender never receives their
// own alert; duplicate phone numbers are sent once (first kind wins).
export type WaRecipientKind = "EMERGENCY_CONTACT" | "LEADER" | "BYSTANDER";

export interface WaRecipient {
  phone: string;
  kind: WaRecipientKind;
}

export async function collectSosWaRecipients(
  db: Db,
  alert: SosAlert,
  leaderId: string,
  bystanders: Bystander[],
): Promise<WaRecipient[]> {
  const out: WaRecipient[] = [];
  const seen = new Set<string>();
  const push = (phone: string | null | undefined, kind: WaRecipientKind) => {
    if (!phone || seen.has(phone)) return;
    seen.add(phone);
    out.push({ phone, kind });
  };

  for (const contact of await db.emergencyContactsOf(alert.senderId)) {
    push(contact.phone, "EMERGENCY_CONTACT");
  }
  if (leaderId !== alert.senderId) {
    push((await db.userById(leaderId))?.phone, "LEADER");
  }
  for (const b of bystanders) {
    push((await db.userById(b.userId))?.phone, "BYSTANDER");
  }
  return out;
}
