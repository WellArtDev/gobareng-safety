// Klien trip-groups — kontrak §2. Bentuk Trip/TripMember = model Prisma
// apps/api (kontrak tunggal); jangan tambah field yang tidak ada di server.
import { apiRequest } from "./api-client";
import type { PublicUser } from "./auth-api";

export type TripType = "HIKING" | "TOURING";
export type TripStatus = "PLANNED" | "ACTIVE" | "CLOSED";
export type TripRole = "LEADER" | "SWEEPER" | "MEDIC" | "MEMBER";
export type Attendance = "NOT_DEPARTED" | "DEPARTED";

export interface Trip {
  id: string;
  name: string;
  type: TripType;
  date: string;
  meetingPoint: string;
  meetingLat: number | null;
  meetingLon: number | null;
  // Tujuan touring (server mengembalikan field ini via mapTrip; di
  // mobile opsional karena trip hiking tidak punya tujuan).
  destination?: string | null;
  destinationLat?: number | null;
  destinationLon?: number | null;
  quota: number | null;
  isOpenTrip: boolean;
  // PAY: harga per peserta untuk trip berbayar; null = gratis.
  price: number | null;
  status: TripStatus;
  leaderId: string;
  createdAt: string;
  // Cap waktu mulai trip — API BELUM mengembalikannya (terverifikasi:
  // skema Prisma Trip + mapTrip hanya punya createdAt, dan POST /start
  // hanya mengubah status jadi ACTIVE). Field opsional ini dipakai
  // tripElapsedMin bila server kelak menambahkannya; selama itu
  // durasi memakai createdAt sebagai fallback.
  startedAt?: string | null;
}

export interface TripMember {
  tripId: string;
  userId: string;
  role: TripRole;
  attendance: Attendance;
  user: PublicUser;
}

export async function fetchMyTrips(): Promise<Trip[]> {
  const data = await apiRequest<{ trips: Trip[] }>("/trip-groups");
  return data.trips;
}

export async function fetchTrip(tripId: string): Promise<Trip> {
  const data = await apiRequest<{ trip: Trip }>(`/trip-groups/${tripId}`);
  return data.trip;
}

export async function fetchTripMembers(tripId: string): Promise<TripMember[]> {
  const data = await apiRequest<{ members: TripMember[] }>(
    `/trip-groups/${tripId}/members`,
  );
  return data.members;
}

// Checkpoint trip (manual untuk Touring, dari jalur untuk Hiking).
export interface TripCheckpoint {
  id: string;
  tripId: string;
  name: string;
  lat: number;
  lon: number;
  createdAt: string;
}

export async function fetchTripCheckpoints(
  tripId: string,
): Promise<TripCheckpoint[]> {
  const data = await apiRequest<{ checkpoints: TripCheckpoint[] }>(
    `/trip-groups/${tripId}/checkpoints`,
  );
  return data.checkpoints;
}

export async function addTripCheckpoint(
  tripId: string,
  body: { name: string; lat: number; lon: number },
): Promise<TripCheckpoint> {
  const data = await apiRequest<{ checkpoint: TripCheckpoint }>(
    `/trip-groups/${tripId}/checkpoints`,
    { method: "POST", body },
  );
  return data.checkpoint;
}

// Ubah peran anggota (leader saja; klien tidak menawarkan LEADER atau
// peran diri sendiri — guard API juga menolaknya).
export async function setMemberRole(
  tripId: string,
  userId: string,
  role: "SWEEPER" | "MEDIC" | "MEMBER",
): Promise<TripMember> {
  const data = await apiRequest<{ member: TripMember }>(
    `/trip-groups/${tripId}/members/${userId}/role`,
    { method: "PATCH", body: { role } },
  );
  return data.member;
}

// Check-in di titik kumpul: attendance anggota jadi DEPARTED, yang
// membuat target direction berpindah ke tujuan trip.
export async function checkInMeetingPoint(
  tripId: string,
): Promise<TripMember> {
  const data = await apiRequest<{ member: TripMember }>(
    `/trip-groups/${tripId}/check-in-meeting-point`,
    { method: "POST", body: {} },
  );
  return data.member;
}

// AI-R: laporan pasca-trip tersimpan (hanya trip CLOSED). facts =
// snapshot angka + daftar dari DB saat generate (ai-report.ts API).
export interface TripReportFacts {
  tripName: string;
  tripType: string;
  tripDate: string;
  meetingPoint: string;
  memberCount: number;
  departedCount: number;
  notDepartedCount: number;
  attendance: {
    userId: string;
    name: string;
    role: string;
    attendance: string;
    checkInCount: number;
  }[];
  checkpointCount: number;
  checkInCount: number;
  checkpoints: { name: string; checkInCount: number }[];
  sosTotal: number;
  sosByReason: { reason: string; count: number }[];
}

export interface TripReport {
  id: string;
  tripId: string;
  generatedById: string;
  summary: string;
  model: string;
  facts: TripReportFacts;
  version: number;
  isRegenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

// Baca laporan di mobile; generate dari mobile ditambahkan 3 Nov 2026
// untuk detail trip selesai (leader/admin, CLOSED, gate aiR — semua
// ditegakkan server). 404 REPORT_NOT_FOUND diteruskan sebagai ApiError;
// layar detail menanganinya sebagai "belum ada laporan" (fail-soft).
export async function fetchTripReport(tripId: string): Promise<TripReport> {
  const data = await apiRequest<{ report: TripReport }>(
    `/trip-groups/${tripId}/trip-report`,
  );
  return data.report;
}

// Generate/regenerate laporan pasca-trip (AI-R): POST, leader trip
// atau admin saja, hanya CLOSED, digate toggle aiR. Regenerate menimpa
// baris yang sama (version+1, API); tanpa teks fallback/palsu.
export async function generateTripReport(tripId: string): Promise<TripReport> {
  const data = await apiRequest<{ report: TripReport }>(
    `/trip-groups/${tripId}/trip-report`,
    { method: "POST" },
  );
  return data.report;
}

// Ringkasan AI (S4): GET read-only, guard reader (member trip / peran
// dashboard). 503 AI_NOT_CONFIGURED bila env model belum diset, 502
// bila upstream gagal — diteruskan sebagai ApiError, bukan karangan.
export interface TripAiSummary {
  summary: string;
  model: string | null;
}

export async function fetchAiSummary(tripId: string): Promise<TripAiSummary> {
  const data = await apiRequest<{
    summary: string;
    model: string | null;
    generatedAt: string;
  }>(`/trip-groups/${tripId}/ai-summary`);
  return { summary: data.summary, model: data.model };
}

export async function startTrip(tripId: string): Promise<Trip> {
  const data = await apiRequest<{ trip: Trip }>(`/trip-groups/${tripId}/start`, {
    method: "POST",
  });
  return data.trip;
}

// Tutup trip (§17, M4). Server menolak TRIP_HAS_UNACCOUNTED_MEMBERS
// tanpa confirmUnaccounted — penutupan diam-diam dilarang.
export async function closeTrip(
  tripId: string,
  confirmUnaccounted = false,
): Promise<Trip> {
  const data = await apiRequest<{ trip: Trip }>(`/trip-groups/${tripId}/close`, {
    method: "POST",
    body: confirmUnaccounted ? { confirmUnaccounted: true } : {},
  });
  return data.trip;
}
