// Domain types + locked SOS rules (contract §4). The F2 in-memory Store
// class was replaced by the Prisma-backed Db (src/db.ts) in card A-1;
// this file keeps the shared shapes routes and clients rely on.
// Tipe domain + aturan SOS terkunci (kontrak §4). Store in-memory F2
// digantikan Db berbasis Prisma (src/db.ts) di kartu A-1; file ini
// menyimpan bentuk bersama yang dipakai route dan klien.

export type TripType = "HIKING" | "TOURING";
export type TripRole = "LEADER" | "SWEEPER" | "MEDIC" | "MEMBER";
export type TripStatus = "PLANNED" | "ACTIVE" | "CLOSED";
export type Attendance = "NOT_DEPARTED" | "DEPARTED";

export type SosReason =
  | "TERSESAT"
  | "CEDERA"
  | "MEDIS"
  | "LAINNYA"
  | "MOTOR_RUSAK"
  | "BENSIN_HABIS"
  | "BAN_BOCOR"
  | "KECELAKAAN";

export type SosLevel = "EMERGENCY" | "URGENT" | "HELP";

// Dashboard roles (RBAC, M3): "admin" = full access, "command_center" =
// command-center only (read dashboard + ack/resolve SOS, no staff or
// admin management). "user" = regular app user with no dashboard role.
// The role lives in the store and is authoritative for authorization;
// the JWT claim (auth.ts) is only a hint, never trusted on its own.
export type StaffRole = "admin" | "command_center" | "user";
export type OrganizerVerificationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type SosStatus =
  | "ACTIVE"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CANCELLED"
  | "FALSE_ALARM";

export interface User {
  id: string;
  email: string;
  name: string;
  slug: string;
  passwordHash: string | null;
  // Optional WA number (E.164, e.g. 62812...) for official Cloud API
  // SOS alerts. Null = user gets in-app alerts only, never WA.
  phone: string | null;
  // Kode negara ISO alpha-2, null = belum diisi.
  country: string | null;
  // Alamat bebas pengguna, null = belum diisi. Privat seperti telepon:
  // tidak tampil di profil publik.
  address: string | null;
  isAdmin: boolean;
  // Dashboard role; invariant: isAdmin === (role === "admin").
  role: StaffRole;
  isVerified: boolean;
  // Set when an admin rejects the verification request; the user drops
  // off the pending list but may be verified later (verify clears it).
  verificationRejectedAt: string | null;
  // Verifikasi akun dua kanal (3 Nov 2026) — TERPISAH dari isVerified
  // (verifikasi organizer manual, jalur PRO). ISO string atau null:
  // emailVerifiedAt = email terbukti, phoneVerifiedAt = HP terbukti,
  // accountVerifiedAt = keduanya terbukti (otomatis, bukan input).
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  accountVerifiedAt: string | null;
  suspendedAt: string | null;
  // SET-7: opsional — kriteria high-risk mayoritas perempuan. Tidak
  // pernah tampil di profil publik (publicUser tidak memuatnya).
  gender: "MALE" | "FEMALE" | null;
  // Foto profil (Wella 1 Nov 2026): URL publik /uploads/avatars/*,
  // null = belum diunggah (UI menampilkan inisial).
  avatarUrl: string | null;
}

export interface OrganizerVerification {
  id: string;
  userId: string;
  tripId: string | null;
  organizerType: TripType | null;
  region: string | null;
  avatarUrl: string | null;
  // Pengajuan organizer (diisi pendaftar dari app). identityDocumentFilename
  // TIDAK ada di bentuk publik mana pun — hanya nama file privat server.
  organizerName: string | null;
  address: string | null;
  identityDocumentFilename: string | null;
  identityDocumentComplete: boolean;
  profileComplete: boolean;
  status: OrganizerVerificationStatus;
  rejectionNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedById: string | null;
}

export interface OrganizerVerificationAdminRow {
  id: string;
  user: Pick<User, "id" | "name" | "email">;
  organizerType: TripType | null;
  region: string | null;
  avatarUrl: string | null;
  organizerName: string | null;
  address: string | null;
  // KTP: admin hanya tahu ada/tidak; file-nya dibuka lewat endpoint
  // dokumen bertoken, bukan URL publik.
  hasIdentityDocument: boolean;
  identityDocumentComplete: boolean;
  profileComplete: boolean;
  trip: Pick<Trip, "id" | "name"> | null;
  status: "PENDING";
  submittedAt: string;
}

// Tampilan "Lihat Data" untuk pendaftar sendiri: data pengajuannya,
// tanpa nama file privat dan tanpa data user lain.
export interface OrganizerApplication {
  id: string;
  organizerName: string | null;
  address: string | null;
  organizerType: TripType | null;
  region: string | null;
  hasIdentityDocument: boolean;
  identityDocumentComplete: boolean;
  profileComplete: boolean;
  status: OrganizerVerificationStatus;
  submittedAt: string;
}

// In-app notification (contract §9). `kind` is a code the client maps
// to an i18n key — the server never sends user-facing text.
export type NotificationKind =
  | "SOS_TRIGGERED"
  | "CHECKPOINT_CHECKIN"
  | "VERIFICATION_REQUEST"
  | "GENERAL_SOS_ALERT"
  | "GENERAL_SOS_CLOSED"
  | "TRIP_STARTED";

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  tripId: string | null;
  // Id of the thing the notification points at (SOS id, checkpoint id,
  // or the requesting user's id), for client-side navigation.
  refId: string | null;
  // Display name of the actor (data, not UI text).
  actorName: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface Trip {
  id: string;
  name: string;
  type: TripType;
  date: string;
  meetingPoint: string;
  // Meeting-point coordinates (ERD): pin anchor for the dashboard map.
  meetingLat: number | null;
  meetingLon: number | null;
  // Touring: tujuan (string + koordinat). Sudah ada di runtime via
  // spread mapTrip; dideklarasikan di sini supaya TS ikut (INVITE).
  destination: string | null;
  destinationLat: number | null;
  destinationLon: number | null;
  // Participant quota (file-10 "joined/quota"); null = no limit.
  quota: number | null;
  // SET-7/8: durasi hari (>=3 = high-risk); null = tidak diisi.
  durationDays: number | null;
  // Participants this destination had last month (demo growth history).
  prevJoined: number | null;
  // Trip cover photo (static asset path under /trips/).
  image: string | null;
  // Time/status note ("Hari ke 2 / 5", "Berangkat 08:00").
  note: string | null;
  isOpenTrip: boolean;
  // PAY: harga per peserta (rupiah) untuk trip berbayar; null = gratis.
  price: number | null;
  // Hiking: tautan rute dari wizard (null = trip tanpa rute: touring
  // + trip hiking lama). Field turunan diisi server dari relasi saat
  // baca (attachTripRouteInfo di db.ts) — bentuk yang diharapkan
  // helper mobile resolveTripRouteInfo() (PR #191).
  mountainId: string | null;
  routeId: string | null;
  mountainName: string | null;
  routeName: string | null;
  distanceKm: number | null;
  gainM: number | null;
  estHours: number | null;
  status: TripStatus;
  leaderId: string;
  createdAt: string;
}

export type ReportStatus = "OPEN" | "ACTIONED" | "DISMISSED";

export interface Report {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  closedAt: string | null;
}

export interface TripMember {
  tripId: string;
  userId: string;
  role: TripRole;
  attendance: Attendance;
}

// AI-R: laporan pasca-trip tersimpan. facts = snapshot JSON dari query
// DB saat generate (bentuknya didefinisikan ai-report.ts ReportFacts).
export interface TripReport {
  id: string;
  tripId: string;
  generatedById: string;
  summary: string;
  model: string;
  facts: unknown;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  tripId: string;
  userId: string;
  lat: number;
  lon: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  batteryLevel?: number;
  ts: string;
}

export interface SosAlert {
  id: string;
  tripId: string;
  senderId: string;
  reason: SosReason;
  level: SosLevel;
  lat: number;
  lon: number;
  status: SosStatus;
  createdAt: string;
}

export interface Checkpoint {
  id: string;
  tripId: string;
  name: string;
  lat: number;
  lon: number;
}

export interface CheckpointCheckIn {
  id: string;
  checkpointId: string;
  userId: string;
  ts: string;
}

export interface ShareLink {
  id: string;
  tripId: string;
  label: string;
  scope: "EMERGENCY_CONTACT" | "ANYONE";
  token: string;
  createdBy: string;
  revokedAt: string | null;
}

// INVITE (2 Nov 2026): link undangan HANYA dari leader trip, berlaku
// sampai trip dimulai (status PLANNED). Beda dari ShareLink: undangan
// membuat orang jadi anggota, bukan sekadar memantau.
export interface TripInvite {
  id: string;
  tripId: string;
  label: string;
  token: string;
  createdBy: string;
  revokedAt: string | null;
}

// Contextual SOS reasons — locked decision (kanban M2, contract §4).
// A touring reason must never appear on a hiking trip, and vice versa.
export const SOS_REASONS: Record<TripType, SosReason[]> = {
  HIKING: ["TERSESAT", "CEDERA", "MEDIS", "LAINNYA"],
  TOURING: [
    "MOTOR_RUSAK",
    "BENSIN_HABIS",
    "BAN_BOCOR",
    "KECELAKAAN",
    "CEDERA",
    "MEDIS",
    "LAINNYA",
  ],
};

export const SOS_LEVELS: Record<SosReason, SosLevel> = {
  CEDERA: "EMERGENCY",
  KECELAKAAN: "EMERGENCY",
  MEDIS: "EMERGENCY",
  TERSESAT: "URGENT",
  MOTOR_RUSAK: "URGENT",
  BENSIN_HABIS: "HELP",
  BAN_BOCOR: "HELP",
  LAINNYA: "HELP",
};

// SOS Umum (tanpa trip, untuk sehari-hari) — 9 template alasan yang
// dikunci Wella 2 Nov 2026. Bentuknya meniru SOS trip: alasan -> level
// otomatis, tanpa pilihan level manual dari klien.
export type GeneralSosReason =
  | "KECELAKAAN_LALU_LINTAS"
  | "KENDARAAN_MOGOK"
  | "BAN_BOCOR_BENSIN_HABIS"
  | "KEJAHATAN"
  | "SAKIT_MENDADAK"
  | "BUTUH_AMBULANS"
  | "KEBAKARAN"
  | "BANJIR_POHON_TUMBANG"
  | "BUTUH_BANTUAN_SEGERA";

export const GENERAL_SOS_REASONS: GeneralSosReason[] = [
  "KECELAKAAN_LALU_LINTAS",
  "KENDARAAN_MOGOK",
  "BAN_BOCOR_BENSIN_HABIS",
  "KEJAHATAN",
  "SAKIT_MENDADAK",
  "BUTUH_AMBULANS",
  "KEBAKARAN",
  "BANJIR_POHON_TUMBANG",
  "BUTUH_BANTUAN_SEGERA",
];

export const GENERAL_SOS_LEVELS: Record<GeneralSosReason, SosLevel> = {
  KECELAKAAN_LALU_LINTAS: "EMERGENCY",
  SAKIT_MENDADAK: "EMERGENCY",
  BUTUH_AMBULANS: "EMERGENCY",
  KEBAKARAN: "EMERGENCY",
  KEJAHATAN: "URGENT",
  KENDARAAN_MOGOK: "URGENT",
  BANJIR_POHON_TUMBANG: "URGENT",
  BAN_BOCOR_BENSIN_HABIS: "HELP",
  BUTUH_BANTUAN_SEGERA: "HELP",
};

export interface GeneralSos {
  id: string;
  senderId: string;
  reason: GeneralSosReason;
  level: SosLevel;
  lat: number;
  lon: number;
  status: SosStatus;
  createdAt: string;
  flagged: boolean;
}

// Pengaman anti-penyalahgunaan SOS umum (Wella 2 Nov 2026).
// "Per hari" dibaca sebagai jendela geser 24 jam — batas hari kalender
// bisa diakali dengan mengirim 3x sebelum dan 3x sesudah tengah malam.
export const GENERAL_SOS_DAILY_LIMIT = 3;
export const GENERAL_SOS_WINDOW_MS = 24 * 60 * 60_000;
export const GENERAL_SOS_COOLDOWN_MS = 10 * 60_000;

export interface GeneralSosReport {
  id: string;
  generalSosId: string;
  reporterId: string;
  createdAt: string;
}

// AI-G Glimmer: satu pesan asisten dari antrean offline. answer null =
// tersimpan tapi belum terjawab (ingest gagal di AI, klien mengulang
// kunci yang sama). Priority hanya urutan flush klien, bukan TTL.
export type GlimmerPriority = "sos" | "normal";

export interface AiGlimmerMessage {
  id: string;
  userId: string;
  clientMessageId: string;
  message: string;
  priority: GlimmerPriority;
  answer: string | null;
  model: string | null;
  createdAt: string;
  answeredAt: string | null;
}

