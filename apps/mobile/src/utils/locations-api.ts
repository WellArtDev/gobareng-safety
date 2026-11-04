// Klien lokasi + SOS read — kontrak §3 (positions/ingest) dan §4 (sos).
// Bentuk Location = model Prisma; location null = anggota belum pernah
// kirim posisi (CC, 28 Okt 2026).
import { apiRequest } from "./api-client";
import type { PublicUser } from "./auth-api";
import type { TripRole } from "./trips-api";

export interface Location {
  id: string;
  tripId: string;
  userId: string;
  lat: number;
  lon: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  batteryLevel?: number | null;
  ts: string;
}

export interface MemberPosition {
  userId: string;
  role: TripRole;
  user: PublicUser;
  location: Location | null;
}

export interface LocationPayload {
  lat: number;
  lon: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  batteryLevel?: number;
  timestamp: string;
  // A-3: dari expo-location `mocked` — server menolak posisi palsu
  // (400 MOCK_LOCATION_REJECTED). Selalu kirim apa adanya.
  isMock?: boolean;
}

export type SosStatus =
  | "ACTIVE"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CANCELLED"
  | "FALSE_ALARM";

export interface SosAlert {
  id: string;
  status: SosStatus;
  userId: string;
  reason: string;
}

// SOS yang masih butuh perhatian; RESOLVED/CANCELLED/FALSE_ALARM tutup.
const OPEN_SOS: ReadonlySet<SosStatus> = new Set([
  "ACTIVE",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
]);

export async function fetchPositions(tripId: string): Promise<MemberPosition[]> {
  const data = await apiRequest<{ positions: MemberPosition[] }>(
    `/trip-groups/${tripId}/positions`,
  );
  return data.positions;
}

export async function postLocation(
  tripId: string,
  payload: LocationPayload,
): Promise<void> {
  await apiRequest(`/trip-groups/${tripId}/locations`, {
    method: "POST",
    body: payload,
  });
}

export async function fetchActiveSos(tripId: string): Promise<SosAlert[]> {
  const data = await apiRequest<{ sos: SosAlert[] }>(`/trip-groups/${tripId}/sos`);
  return data.sos.filter((alert) => OPEN_SOS.has(alert.status));
}
