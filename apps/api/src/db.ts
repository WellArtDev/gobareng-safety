// Prisma-backed data layer — A-1 (replaces the F2 in-memory store).
// Shapes returned to routes are IDENTICAL to the old store.ts
// interfaces (ISO strings for dates), so API responses do not change.
// The only in-memory state left is the per-process SOS dispatch guard:
// it is written and read within the same request that creates the SOS,
// so it never needs to survive a restart.
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type OrganizerVerification as PrismaOrganizerVerification,
  type Prisma,
} from "@prisma/client";
import { config } from "./config.js";
import type { BankDetails } from "./bank-details.js";
import { planPositionCompaction } from "./position-compaction.js";
import type {
  AiGlimmerMessage,
  Checkpoint,
  CheckpointCheckIn,
  GeneralSos,
  GeneralSosReason,
  GeneralSosReport,
  Location,
  Notification,
  NotificationKind,
  OrganizerApplication,
  OrganizerVerification,
  OrganizerVerificationAdminRow,
  Report,
  ShareLink,
  SosAlert,
  TripInvite,
  StaffRole,
  Trip,
  TripReport,
  TripMember,
  User,
} from "./store.js";

// SET-4/5/6: toggle platform. Default = perilaku sebelum kartu ini
// (pendaftaran terbuka, trip publik tampil, tanpa maintenance).
export interface PlatformSettings {
  signupOpen: boolean;
  publicMapTrips: boolean;
  maintenanceMode: boolean;
  // SET-2: notif VERIFICATION_REQUEST ke staf dashboard saat ada
  // pendaftar baru; antrean verifikasi tetap terisi saat mati.
  notifVerify: boolean;
  // SET-3: notif CHECKPOINT_CHECKIN ke LEADER trip (keputusan Wella
  // 1 Nov 2026) saat peserta check-in; feed dashboard tetap jalan.
  notifCheckin: boolean;
  // Notifikasi per event x per channel (Wella 1 Nov 2026, provider
  // sementara Brevo): master notifVerify/notifCheckin di atas tetap
  // mengontrol feed dashboard; kunci di bawah mengontrol pengiriman
  // kanal tambahan. Untuk verify/checkin, kanal hanya jalan kalau
  // master-nya juga aktif; regist/sos tidak punya master, jadi kunci
  // kanal saja yang berlaku. Disimpan sebagai kunci boolean biasa
  // (PlatformSetting.value Boolean) supaya tidak perlu migrasi skema.
  notifRegistEmail: boolean;
  notifRegistWhatsapp: boolean;
  notifRegistSms: boolean;
  notifSosEmail: boolean;
  notifSosWhatsapp: boolean;
  notifSosSms: boolean;
  notifVerifyEmail: boolean;
  notifVerifyWhatsapp: boolean;
  notifVerifySms: boolean;
  notifCheckinEmail: boolean;
  notifCheckinWhatsapp: boolean;
  notifCheckinSms: boolean;
  // Kanal OTP register/login yang dipilih admin di Pengaturan
  // (Wella 1 Nov 2026: email, SMS, WhatsApp, masing-masing bisa
  // di-toggle). Pengiriman OTP nanti hanya lewat kanal yang aktif.
  // notifSosEmail di atas dipertahankan di DB demi kompatibilitas,
  // tapi SOS tidak lagi memakai email (SOS = SMS + WhatsApp saja).
  otpEmail: boolean;
  otpSms: boolean;
  otpWhatsapp: boolean;
  // Nama template OTP WhatsApp (Meta Cloud API, berparameter {{1}}
  // untuk kode) yang diatur admin di Pengaturan. Kosong = belum
  // dikonfigurasi -> request OTP WhatsApp gagal eksplisit dengan
  // WHATSAPP_TEMPLATE_NO_VARIABLE, TANPA fallback diam-diam ke kanal
  // lain. Template harus sudah disetujui di aplikasi Meta; nama
  // template BUKAN rahasia, tapi token WA tetap hanya dari env.
  otpWhatsappTemplate: string;
  // Penyedia WhatsApp (Wella 3 Nov 2026): "official" = Meta Cloud
  // API (whatsapp.ts), "dikontak" = Dikontak WABA Shared
  // (dikontak.ts). Default "official" — aturan lama "produksi hanya
  // official" dihormati lewat default ini; dikontak hanya jalan bila
  // admin memilihnya eksplisit di Pengaturan. Disimpan sebagai kunci
  // string biasa (valueText) sehingga tidak perlu migrasi skema.
  // Menentukan jalur kirim SEMUA pengiriman WA OTP + SOS; kanal
  // notifikasi Brevo (regist/verify/checkin) TIDAK ikut setting ini.
  whatsappProvider: "official" | "dikontak";
  // Setting Brevo yang bisa diubah dari dashboard Pengaturan
  // (bukan rahasia): kosong = fallback ke env VPS. Kunci API dan
  // password SMTP TIDAK PERNAH masuk ke setting ini — tetap env.
  brevoSenderEmail: string;
  brevoSmsSender: string;
  brevoWhatsappSenderNumber: string;
  brevoWhatsappTemplateId: string;
  // Keamanan & Batas (Wella 1 Nov 2026): pill hardcode kuota/mata
  // uang/zona waktu diganti setting tersimpan. Baris 'Verifikasi
  // manual trip Cartensz & Kerinci' DIHAPUS dari dashboard atas
  // koreksi Wella — tidak ada setting manualVerify dan tidak ada
  // logika penegakannya.
  // Batas kuota default dashboard (bukan prefill 10 form buat-trip
  // mobile SET-8 — itu rekomendasi berbeda, sengaja tidak diubah).
  defaultQuota: number;
  currency: string;
  timezone: string;
  // URL gambar QRIS Pro aktif (Wella 1 Nov 2026): diisi HANYA lewat
  // endpoint upload/hapus QRIS admin, bukan lewat PATCH settings.
  proQrisUrl: string;
  // Modul AI (Wella 2 Nov 2026): satu flag per modul, di-toggle dari
  // kartu "Modul AI" di Pengaturan. Default NYALA: endpoint AI tanpa
  // konfigurasi model sudah gagal eksplisit sendiri (503/502), jadi
  // default nyala tidak berbahaya — flag ini kill-switch admin, bukan
  // pengganti konfigurasi model. Penegakan lewat requireAiModule di
  // ai-modules.ts; endpoint AI di PR terpisah (#137, #142, #140,
  // #133, #136, #132) baru ter-gate saat rebase masing-masing.
  aiV: boolean;
  aiP: boolean;
  aiL: boolean;
  aiQ: boolean;
  aiR: boolean;
  aiG: boolean;
}

export const PLATFORM_SETTING_DEFAULTS: PlatformSettings = {
  signupOpen: true,
  publicMapTrips: true,
  maintenanceMode: false,
  notifVerify: true,
  notifCheckin: true,
  notifRegistEmail: true,
  notifRegistWhatsapp: true,
  notifRegistSms: true,
  notifSosEmail: true,
  notifSosWhatsapp: true,
  notifSosSms: true,
  notifVerifyEmail: true,
  notifVerifyWhatsapp: true,
  notifVerifySms: true,
  notifCheckinEmail: true,
  notifCheckinWhatsapp: true,
  notifCheckinSms: true,
  // Default OTP: email + SMS aktif (pilihan awal Wella), WhatsApp
  // tersedia tapi mati sampai admin mengaktifkannya + template OTP
  // WhatsApp-nya siap.
  otpEmail: true,
  otpSms: true,
  otpWhatsapp: false,
  otpWhatsappTemplate: "",
  whatsappProvider: "official",
  brevoSenderEmail: "",
  brevoSmsSender: "",
  brevoWhatsappSenderNumber: "",
  brevoWhatsappTemplateId: "",
  defaultQuota: 15,
  currency: "IDR",
  timezone: "WIB",
  proQrisUrl: "",
  // Modul AI default NYALA (alasan di komentar interface di atas).
  aiV: true,
  aiP: true,
  aiL: true,
  aiQ: true,
  aiR: true,
  aiG: true,
};

// TTL pendek: middleware maintenance membaca settings di setiap request;
// cache menahan beban DB, perubahan admin terasa maksimal 5 detik.
const SETTINGS_CACHE_TTL_MS = 5_000;

function iso(d: Date): string {
  return d.toISOString();
}
function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

type DbUserRow = {
  id: string;
  email: string;
  name: string;
  slug: string;
  passwordHash: string | null;
  phone: string | null;
  country: string | null;
  address: string | null;
  isAdmin: boolean;
  role: StaffRole;
  isVerified: boolean;
  verificationRejectedAt: Date | null;
  suspendedAt: Date | null;
  gender: "MALE" | "FEMALE" | null;
  avatarUrl: string | null;
  // Verifikasi akun dua kanal — lihat komentar di store.ts User.
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  accountVerifiedAt: Date | null;
};

export interface OtpCodeRow {
  id: string;
  identifier: string;
  channel: string;
  codeHash: string;
  attempts: number;
  lockedUntil: Date | null;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

function mapOtpCode(r: {
  id: string;
  identifier: string;
  channel: string;
  codeHash: string;
  attempts: number;
  lockedUntil: Date | null;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}): OtpCodeRow {
  return { ...r };
}

export interface EmailVerificationTokenRow {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

function mapEmailVerificationToken(r: {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}): EmailVerificationTokenRow {
  return { ...r };
}

function mapUser(u: DbUserRow): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    slug: u.slug,
    passwordHash: u.passwordHash,
    phone: u.phone,
    country: u.country,
    address: u.address,
    isAdmin: u.isAdmin,
    role: u.role,
    isVerified: u.isVerified,
    verificationRejectedAt: isoOrNull(u.verificationRejectedAt),
    suspendedAt: isoOrNull(u.suspendedAt),
    gender: u.gender,
    avatarUrl: u.avatarUrl,
    emailVerifiedAt: isoOrNull(u.emailVerifiedAt),
    phoneVerifiedAt: isoOrNull(u.phoneVerifiedAt),
    accountVerifiedAt: isoOrNull(u.accountVerifiedAt),
  };
}

type DbTripRow = {
  id: string;
  name: string;
  type: Trip["type"];
  date: string;
  meetingPoint: string;
  meetingLat: number | null;
  meetingLon: number | null;
  destination: string | null;
  destinationLat: number | null;
  destinationLon: number | null;
  quota: number | null;
  durationDays: number | null;
  prevJoined: number | null;
  image: string | null;
  note: string | null;
  isOpenTrip: boolean;
  price: number | null;
  mountainId: string | null;
  routeId: string | null;
  status: Trip["status"];
  leaderId: string;
  createdAt: Date;
};

function mapTrip(t: DbTripRow): Trip {
  // Field turunan rute default null; attachTripRouteInfo mengisinya
  // dari relasi bila trip punya tautan rute.
  return {
    ...t,
    mountainName: null,
    routeName: null,
    distanceKm: null,
    gainM: null,
    estHours: null,
    createdAt: iso(t.createdAt),
  };
}

// AI-Q: bentuk respons route (ISO string untuk tanggal, seperti Trip).
export interface TripQuestion {
  id: string;
  tripId: string;
  userId: string;
  question: string;
  answer: string | null;
  notFound: boolean;
  sources: string[];
  model: string | null;
  links: { label: string; url: string }[];
  createdAt: string;
}

type DbTripQuestionRow = {
  id: string;
  tripId: string;
  userId: string;
  question: string;
  answer: string | null;
  notFound: boolean;
  sources: string[];
  model: string | null;
  links: unknown;
  createdAt: Date;
};

// Baris lama (links null) dan payload rusak dipetakan ke [] — link
// tidak pernah boleh mematahkan pembacaan riwayat.
function mapTripQuestion(r: DbTripQuestionRow): TripQuestion {
  const raw = r.links;
  const links = Array.isArray(raw)
    ? raw.filter(
        (l): l is { label: string; url: string } =>
          typeof l === "object" &&
          l !== null &&
          typeof (l as { label: unknown }).label === "string" &&
          typeof (l as { url: unknown }).url === "string",
      )
    : [];
  const { links: _ignored, ...rest } = r;
  return { ...rest, links, createdAt: iso(r.createdAt) };
}

type DbLocationRow = {
  id: string;
  tripId: string;
  userId: string;
  lat: number;
  lon: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  batteryLevel: number | null;
  ts: Date;
};

function mapLocation(l: DbLocationRow): Location {
  return {
    id: l.id,
    tripId: l.tripId,
    userId: l.userId,
    lat: l.lat,
    lon: l.lon,
    accuracy: l.accuracy ?? undefined,
    speed: l.speed ?? undefined,
    heading: l.heading ?? undefined,
    altitude: l.altitude ?? undefined,
    batteryLevel: l.batteryLevel ?? undefined,
    ts: iso(l.ts),
  };
}

type DbSosRow = {
  id: string;
  tripId: string;
  senderId: string;
  reason: SosAlert["reason"];
  level: SosAlert["level"];
  lat: number;
  lon: number;
  status: SosAlert["status"];
  createdAt: Date;
};

function mapSos(s: DbSosRow): SosAlert {
  return { ...s, createdAt: iso(s.createdAt) };
}

type DbNotificationRow = {
  id: string;
  userId: string;
  kind: NotificationKind;
  tripId: string | null;
  refId: string | null;
  actorName: string | null;
  createdAt: Date;
  readAt: Date | null;
};

function mapNotification(n: DbNotificationRow): Notification {
  return { ...n, createdAt: iso(n.createdAt), readAt: isoOrNull(n.readAt) };
}

function mapOrganizerVerification(v: PrismaOrganizerVerification): OrganizerVerification {
  return {
    ...v,
    submittedAt: iso(v.submittedAt),
    reviewedAt: isoOrNull(v.reviewedAt),
  };
}

type DbShareLinkRow = {
  id: string;
  tripId: string;
  label: string;
  scope: ShareLink["scope"];
  token: string;
  createdBy: string;
  revokedAt: Date | null;
};

type CreateUserInput = {
  email: string;
  name: string;
  slug: string;
  passwordHash: string | null;
  phone: string | null;
  country?: string | null;
  isAdmin: boolean;
  role: StaffRole;
  isVerified: boolean;
  gender?: "MALE" | "FEMALE" | null;
  // Verifikasi akun dua kanal: diisi saat daftar lewat OTP (kanal
  // identifier terbukti saat itu juga); default null bila tak diisi.
  emailVerifiedAt?: Date | null;
  phoneVerifiedAt?: Date | null;
  accountVerifiedAt?: Date | null;
};

function mapShareLink(l: DbShareLinkRow): ShareLink {
  return { ...l, revokedAt: isoOrNull(l.revokedAt) };
}

// Jalur: bentuk respons route — relasi posts (nama + urutan) diratakan
// jadi array nama saja, sesuai yang dipakai klien. `checkpoints` =
// pos yang punya koordinat (data MDPL): nama + lat/lon shifted +
// elevasi + flag auto/target + tags, supaya dashboard/mobile bisa menggambar
// jalur tanpa mengubah bentuk `posts` lama. `track` hanya disertakan
// bila diminta eksplisit (detail satu jalur) — daftar jalur tidak
// memuat geometri penuh supaya payload tetap ringan.
function mapRoute(
  route: {
    posts?: {
      name: string;
      order: number;
      lat?: number | null;
      lon?: number | null;
      elevationM?: number | null;
      autoCheckpoint?: boolean;
      isTarget?: boolean;
      tags?: string[];
      isGathering?: boolean;
    }[];
    [key: string]: unknown;
  },
  withTrack = false,
) {
  const { posts, track, ...rest } = route;
  const list = posts ?? [];
  return {
    ...rest,
    ...(withTrack ? { track: track ?? null } : {}),
    posts: list.map((p) => p.name),
    checkpoints: list
      .filter((p) => p.lat !== null && p.lat !== undefined && p.lon !== null && p.lon !== undefined)
      .map((p) => ({
        name: p.name,
        order: p.order,
        lat: p.lat,
        lon: p.lon,
        elevationM: p.elevationM ?? null,
        autoCheckpoint: p.autoCheckpoint ?? false,
        isTarget: p.isTarget ?? false,
        tags: p.tags ?? [],
        isGathering: p.isGathering ?? false,
      })),
  };
}

// Jalur: normalisasi daftar pos dari form admin. Trim, buang yang
// kosong, maks 30, dan selalu diakhiri pos puncak gunungnya
// (case-insensitive) — jadi satu form Tambah Jalur selalu
// menghasilkan jalur lengkap dari basecamp sampai atas, tanpa
// admin harus ingat menulis "Puncak" sendiri.
//
// Tambahan A (1 Nov 2026): tiap pos boleh membawa koordinat.
// - string polos = nama saja (klien lama); coordsProvided false.
// - objek { name, lat?, lon? } = koordinat eksplisit; kunci lat/lon
//   yang HADIR (termasuk null) berarti admin sengaja mengaturnya
//   (null = hapus koordinat); kunci yang TIDAK ADA berarti "jangan
//   sentuh koordinat lama" — ini yang membuat edit ganti-nama tidak
//   menghapus koordinat checkpoint MDPL.
// - '' dianggap kosong (= null); nilai di luar rentang / bukan angka
//   dipertahankan sebagai null di sini (routePayload sudah menolaknya
//   dengan 400 sebelum sampai ke db).
export interface RoutePostInput {
  name: string;
  lat: number | null;
  lon: number | null;
  coordsProvided: boolean;
}

function parsePostCoord(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

export function normalizeRoutePosts(
  posts: unknown,
  mountainName: string,
): RoutePostInput[] {
  const raw: unknown[] = Array.isArray(posts) ? posts : [];
  const list: RoutePostInput[] = [];
  for (const p of raw) {
    if (typeof p === "string") {
      const name = p.trim();
      if (name) list.push({ name, lat: null, lon: null, coordsProvided: false });
    } else if (p && typeof p === "object" && !Array.isArray(p)) {
      const o = p as Record<string, unknown>;
      if (typeof o.name !== "string" || !o.name.trim()) continue;
      const lat = parsePostCoord(o.lat, -90, 90);
      const lon = parsePostCoord(o.lon, -180, 180);
      // Pasangan harus lengkap; separuh saja = tidak ada koordinat
      // (routePayload menolaknya lebih dulu dengan 400).
      const complete = (lat === null) === (lon === null);
      list.push({
        name: o.name.trim(),
        lat: complete ? lat : null,
        lon: complete ? lon : null,
        coordsProvided: "lat" in o || "lon" in o,
      });
    }
    if (list.length >= 30) break;
  }
  if (!list.some((p) => p.name.toLowerCase().startsWith("puncak"))) {
    list.push({
      name: `Puncak ${mountainName}`,
      lat: null,
      lon: null,
      coordsProvided: false,
    });
  }
  return list;
}

export class Db {
  readonly prisma: PrismaClient;
  // Per-process SOS dispatch idempotency guard (see file header).
  private sosDispatch = new Set<string>();

  constructor(prisma?: PrismaClient) {
    this.prisma =
      prisma ??
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: config.databaseUrl }),
      });
  }

  // ---- Users ----
  async userById(id: string): Promise<User | null> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    return u ? mapUser(u) : null;
  }

  async userByEmail(email: string): Promise<User | null> {
    const u = await this.prisma.user.findUnique({ where: { email } });
    return u ? mapUser(u) : null;
  }

  async userByPhone(phone: string): Promise<User | null> {
    const u = await this.prisma.user.findFirst({ where: { phone } });
    return u ? mapUser(u) : null;
  }

  async userBySlug(slug: string): Promise<User | null> {
    const u = await this.prisma.user.findUnique({ where: { slug } });
    return u ? mapUser(u) : null;
  }

  // Trips a user is a member of (public-profile history).
  async tripsOfUser(userId: string): Promise<Trip[]> {
    return this.attachTripRouteInfo(
      (
        await this.prisma.trip.findMany({
          where: { members: { some: { userId } } },
        })
      ).map(mapTrip),
    );
  }

  async emailTaken(email: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { email } })) > 0;
  }

  // Seed admin (app.ts): ada admin mana pun -> jangan buat admin baru
  // dari env. Mencegah admin kedua dengan email lama setelah admin
  // mengganti emailnya sendiri lewat PATCH /me (Wella 1 Nov 2026).
  async hasAnyAdmin(): Promise<boolean> {
    return (await this.prisma.user.count({ where: { isAdmin: true } })) > 0;
  }

  async slugTaken(slug: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { slug } })) > 0;
  }

  async uniqueSlug(base: string): Promise<string> {
    let slug = base || "user";
    let n = 2;
    while (await this.slugTaken(slug)) slug = `${base || "user"}-${n++}`;
    return slug;
  }

  async createUser(data: CreateUserInput): Promise<User> {
    return mapUser(await this.prisma.user.create({ data }));
  }

  async createUserWithPendingOrganizerVerification(data: CreateUserInput): Promise<User> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({ data });
      await tx.organizerVerification.create({ data: { userId: user.id } });
      return mapUser(user);
    });
  }

  async updateUser(
    id: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string | null;
      country: string | null;
      address: string | null;
      passwordHash: string | null;
      isVerified: boolean;
      verificationRejectedAt: Date | null;
      suspendedAt: Date | null;
      avatarUrl: string | null;
      emailVerifiedAt: Date | null;
      phoneVerifiedAt: Date | null;
      accountVerifiedAt: Date | null;
    }>,
  ): Promise<User | null> {
    try {
      return mapUser(await this.prisma.user.update({ where: { id }, data }));
    } catch {
      return null;
    }
  }

  // Rekening organizer (PR rekening-organizer): dibaca HANYA lewat sini
  // (member trip berbayar) dan GET /auth/me/bank-details (pemilik).
  // Sengaja bukan bagian mapUser: publicUser dipakai daftar member trip
  // dan GET /me, dan rekening tidak boleh muncul di kedua jalur itu.
  // Tidak lengkap (satu pun kosong) = null — trip berbayar lama yang
  // organizernya belum mengisi menampilkan state jujur, bukan kosong.
  async bankDetailsOf(userId: string): Promise<BankDetails | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        bankName: true,
        bankAccountNumber: true,
        bankAccountHolder: true,
      },
    });
    if (
      !row ||
      !row.bankName ||
      !row.bankAccountNumber ||
      !row.bankAccountHolder
    ) {
      return null;
    }
    return {
      bankName: row.bankName,
      bankAccountNumber: row.bankAccountNumber,
      bankAccountHolder: row.bankAccountHolder,
    };
  }

  async updateBankDetails(
    userId: string,
    details: BankDetails | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: details ?? {
        bankName: null,
        bankAccountNumber: null,
        bankAccountHolder: null,
      },
    });
  }

  async listUsers(): Promise<User[]> {
    return (await this.prisma.user.findMany()).map(mapUser);
  }

  // Member table: ids of users holding a VERIFIED Pro upgrade
  // (PAY: upgrade Pro Rp150.000, verified by admin). Uncapped on purpose:
  // the members list itself is uncapped, so a take:200 cap here would
  // silently drop Pro flags once the user base grows.
  async listProUserIds(): Promise<string[]> {
    const rows = await this.prisma.upgradeRequest.findMany({
      where: { status: "VERIFIED" },
      select: { userId: true },
      distinct: ["userId"],
    });
    return rows.map((r) => r.userId);
  }

  // Bersih-bersih hash password lama (PR ganti-email OTP): SATU
  // statement UPDATE, atomik — hanya kolom passwordHash yang
  // di-nol-kan, tidak ada kolom/baris lain yang disentuh. Migrasi
  // prisma di PR ini menjalankan UPDATE yang sama saat deploy;
  // metode ini adalah implementasi yang sama yang bisa dites dan
  // dijalankan ulang bila ada hash warisan yang lolos (mis. dari
  // db:seed lama). Mengembalikan jumlah baris yang dibersihkan.
  async clearLegacyPasswordHashes(): Promise<number> {
    const result = await this.prisma.user.updateMany({
      where: { passwordHash: { not: null } },
      data: { passwordHash: null },
    });
    return result.count;
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      await this.prisma.user.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // ---- OTP passwordless (Wella 1 Nov 2026) ----
  async createOtpCode(data: {
    identifier: string;
    channel: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<OtpCodeRow> {
    return mapOtpCode(await this.prisma.otpCode.create({ data }));
  }

  // Baris yang belum dipakai, terbaru dulu. Dipakai verifikasi (cocokkan
  // hash) dan deteksi kunci (lockedUntil aktif di baris mana pun).
  async otpCodesFor(identifier: string): Promise<OtpCodeRow[]> {
    return (
      await this.prisma.otpCode.findMany({
        where: { identifier, consumedAt: null },
        orderBy: { createdAt: "desc" },
      })
    ).map(mapOtpCode);
  }

  async latestOtpSentAt(
    identifier: string,
    channel: string,
  ): Promise<Date | null> {
    const row = await this.prisma.otpCode.findFirst({
      where: { identifier, channel },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  async countOtpSentSince(identifier: string, since: Date): Promise<number> {
    return this.prisma.otpCode.count({
      where: { identifier, createdAt: { gte: since } },
    });
  }

  async markOtpConsumed(id: string): Promise<void> {
    await this.prisma.otpCode.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }

  // Tambah 1 percobaan salah; lockedUntil di-set pemanggil bila ambang
  // tercapai. Mengembalikan jumlah percobaan terbaru.
  async bumpOtpAttempt(id: string, lockedUntil: Date | null): Promise<number> {
    const row = await this.prisma.otpCode.update({
      where: { id },
      data: { attempts: { increment: 1 }, lockedUntil },
    });
    return row.attempts;
  }

  // ---- Verifikasi akun dua kanal: token link email ----
  // Link baru menghanguskan link lama yang belum dipakai (satu link
  // aktif per user) supaya tidak ada dua link hidup bersamaan.
  async createEmailVerificationToken(data: {
    userId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<EmailVerificationTokenRow> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: data.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return tx.emailVerificationToken.create({ data });
    });
    return mapEmailVerificationToken(row);
  }

  async latestEmailVerificationToken(
    userId: string,
  ): Promise<EmailVerificationTokenRow | null> {
    const row = await this.prisma.emailVerificationToken.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return row ? mapEmailVerificationToken(row) : null;
  }

  async emailVerificationTokenByHash(
    tokenHash: string,
  ): Promise<EmailVerificationTokenRow | null> {
    const row = await this.prisma.emailVerificationToken.findFirst({
      where: { tokenHash },
      orderBy: { createdAt: "desc" },
    });
    return row ? mapEmailVerificationToken(row) : null;
  }

  // ---- Magic link juri tanpa OTP: tautan pakai-ulang sampai tenggat ----
  // Berbeda dari link verifikasi email: tidak ada consumedAt — baris
  // hidup sampai expiresAt dan dapat ditebus berkali-kali.
  async createMagicLinkToken(data: {
    userId: string;
    label: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.magicLinkToken.create({ data });
  }

  async magicLinkTokenByHash(tokenHash: string) {
    return this.prisma.magicLinkToken.findUnique({ where: { tokenHash } });
  }

  // Akun pemegang magic link (juri) — dipakai /refresh untuk membatasi
  // rotasi refresh + access JWT ke tenggat pengumuman. Akun juri hanya
  // bisa login lewat magic link, jadi semua sesi mereka berakar di sini.
  async userHasMagicLinkTokens(userId: string): Promise<boolean> {
    return (
      (await this.prisma.magicLinkToken.count({ where: { userId } })) > 0
    );
  }

  async consumeEmailVerificationToken(id: string): Promise<void> {
    await this.prisma.emailVerificationToken.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }

  async listStaff(): Promise<User[]> {
    return (
      await this.prisma.user.findMany({
        where: { role: { in: ["admin", "command_center"] } },
      })
    ).map(mapUser);
  }

  async listPendingVerifications(): Promise<OrganizerVerificationAdminRow[]> {
    await this.reconcilePendingOrganizerVerifications();
    const rows = await this.prisma.organizerVerification.findMany({
      where: { status: "PENDING" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        trip: { select: { id: true, name: true } },
      },
      orderBy: { submittedAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      user: row.user,
      organizerType: row.organizerType,
      region: row.region,
      avatarUrl: row.avatarUrl,
      organizerName: row.organizerName,
      address: row.address,
      hasIdentityDocument: row.identityDocumentFilename !== null,
      identityDocumentComplete: row.identityDocumentComplete,
      profileComplete: row.profileComplete,
      trip: row.trip,
      status: "PENDING",
      submittedAt: iso(row.submittedAt),
    }));
  }

  async reconcilePendingOrganizerVerifications(): Promise<number> {
    const missing = await this.prisma.user.findMany({
      where: {
        role: "user",
        isVerified: false,
        verificationRejectedAt: null,
        organizerVerifications: { none: { status: "PENDING" } },
      },
      select: { id: true },
    });
    if (missing.length === 0) return 0;
    const created = await this.prisma.organizerVerification.createMany({
      data: missing.map(({ id }) => ({ userId: id })),
      skipDuplicates: true,
    });
    return created.count;
  }

  // Pengajuan organizer milik sendiri ("Lihat Data" di app): baris
  // terbaru apa pun statusnya, tanpa nama file privat.
  async myOrganizerApplication(userId: string): Promise<OrganizerApplication | null> {
    const row = await this.prisma.organizerVerification.findFirst({
      where: { userId },
      orderBy: { submittedAt: "desc" },
    });
    if (!row) return null;
    return {
      id: row.id,
      organizerName: row.organizerName,
      address: row.address,
      organizerType: row.organizerType,
      region: row.region,
      hasIdentityDocument: row.identityDocumentFilename !== null,
      identityDocumentComplete: row.identityDocumentComplete,
      profileComplete: row.profileComplete,
      status: row.status,
      submittedAt: iso(row.submittedAt),
    };
  }

  // Baris penuh (server-side saja, untuk hapus file KTP lama saat
  // pendaftar mengunggah KTP baru). Tidak pernah dikirim ke klien.
  async organizerVerificationRecord(userId: string): Promise<OrganizerVerification | null> {
    const row = await this.prisma.organizerVerification.findFirst({
      where: { userId },
      orderBy: { submittedAt: "desc" },
    });
    return row ? mapOrganizerVerification(row) : null;
  }

  // Baris dokumen untuk endpoint admin: id verifikasi -> pemilik + file.
  async verificationDocumentRecord(
    id: string,
  ): Promise<{ id: string; userId: string; identityDocumentFilename: string | null } | null> {
    const row = await this.prisma.organizerVerification.findUnique({
      where: { id },
      select: { id: true, userId: true, identityDocumentFilename: true },
    });
    return row;
  }

  async createPendingOrganizerVerification(
    userId: string,
    input: Partial<{
      tripId: string | null;
      organizerType: "HIKING" | "TOURING" | null;
      region: string | null;
      avatarUrl: string | null;
      organizerName: string | null;
      address: string | null;
      identityDocumentFilename: string | null;
      identityDocumentComplete: boolean;
      profileComplete: boolean;
      submittedAt: Date;
    }> = {},
  ): Promise<OrganizerVerification> {
    const existing = await this.prisma.organizerVerification.findFirst({
      where: { userId, status: "PENDING" },
      orderBy: { submittedAt: "desc" },
    });
    if (existing) {
      if (Object.keys(input).length === 0) return mapOrganizerVerification(existing);
      return mapOrganizerVerification(
        await this.prisma.organizerVerification.update({
          where: { id: existing.id },
          data: input,
        }),
      );
    }

    try {
      return mapOrganizerVerification(
        await this.prisma.organizerVerification.create({ data: { userId, ...input } }),
      );
    } catch (error) {
      // The partial unique index resolves concurrent ensure calls. Only swallow
      // the race when the winning pending row can actually be read.
      const raced = await this.prisma.organizerVerification.findFirst({
        where: { userId, status: "PENDING" },
        orderBy: { submittedAt: "desc" },
      });
      if (raced) {
        if (Object.keys(input).length === 0) return mapOrganizerVerification(raced);
        return mapOrganizerVerification(
          await this.prisma.organizerVerification.update({
            where: { id: raced.id },
            data: input,
          }),
        );
      }
      throw error;
    }
  }

  async reviewOrganizerVerification(
    userId: string,
    reviewerId: string,
    decision: "APPROVED" | "REJECTED",
    rejectionNote?: string,
  ): Promise<{ application: OrganizerVerification; user: User } | null> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const pending = await tx.organizerVerification.findFirst({
        where: { userId, status: "PENDING" },
        orderBy: { submittedAt: "desc" },
      });
      if (!pending) return null;

      const reviewedAt = new Date();
      const claimed = await tx.organizerVerification.updateMany({
        where: { id: pending.id, status: "PENDING" },
        data: {
          status: decision,
          rejectionNote: decision === "REJECTED" ? (rejectionNote?.trim() || null) : null,
          reviewedAt,
          reviewedById: reviewerId,
        },
      });
      if (claimed.count !== 1) return null;

      const user = await tx.user.update({
        where: { id: userId },
        data:
          decision === "APPROVED"
            ? { isVerified: true, verificationRejectedAt: null }
            : { isVerified: false, verificationRejectedAt: reviewedAt },
      });
      const application = await tx.organizerVerification.findUniqueOrThrow({
        where: { id: pending.id },
      });
      return { application: mapOrganizerVerification(application), user: mapUser(user) };
    });
  }

  async roleOf(userId: string | undefined): Promise<StaffRole | null> {
    if (!userId) return null;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return u?.role ?? null;
  }

  async isDashboardRole(userId: string | undefined): Promise<boolean> {
    const role = await this.roleOf(userId);
    return role === "admin" || role === "command_center";
  }

  // ---- Trips ----
  async tripById(id: string): Promise<Trip | null> {
    const t = await this.prisma.trip.findUnique({ where: { id } });
    return t ? (await this.attachTripRouteInfo([mapTrip(t)]))[0] : null;
  }

  // TAUTAN RUTE (3 Nov 2026): isi field turunan rute pada trip yang
  // punya mountainId/routeId, dari relasi katalog. Trip tanpa tautan
  // tetap dengan field null (keadaan jujur PR #191). Batch: dua query
  // untuk berapa pun jumlah trip, bukan N+1.
  private async attachTripRouteInfo(trips: Trip[]): Promise<Trip[]> {
    const routeIds = [...new Set(trips.map((t) => t.routeId).filter((id): id is string => !!id))];
    const mountainIds = [...new Set(trips.map((t) => t.mountainId).filter((id): id is string => !!id))];
    if (routeIds.length === 0 && mountainIds.length === 0) return trips;
    const routes = await this.prisma.mountainRoute.findMany({
      where: { id: { in: routeIds } },
      include: { mountain: true },
    });
    const routeById = new Map(routes.map((r) => [r.id, r]));
    const mountains = mountainIds.length
      ? await this.prisma.mountain.findMany({ where: { id: { in: mountainIds } } })
      : [];
    const mountainById = new Map(mountains.map((m) => [m.id, m]));
    return trips.map((t) => {
      const route = t.routeId ? routeById.get(t.routeId) : undefined;
      const mountain = route?.mountain ?? (t.mountainId ? mountainById.get(t.mountainId) : undefined);
      if (!route && !mountain) return t;
      return {
        ...t,
        mountainName: mountain?.name ?? null,
        routeName: route?.name ?? null,
        distanceKm: route?.distanceKm ?? null,
        gainM: route?.gainM ?? null,
        estHours: route?.estHours ?? null,
      };
    });
  }

  // Validasi tautan rute untuk trip hiking baru. null = tidak valid:
  // jalur tidak ada, gunung tidak ada, atau jalur bukan milik gunung
  // yang diminta. Hanya routeId -> mountainId diturunkan dari jalur.
  // Pos tanpa koordinat tidak ikut disalin (Checkpoint wajib lat/lon).
  async resolveTripRoute(
    mountainId: string | null,
    routeId: string | null,
  ): Promise<{
    mountainId: string | null;
    routeId: string | null;
    posts: { name: string; lat: number; lon: number }[];
  } | null> {
    if (routeId) {
      const route = await this.prisma.mountainRoute.findUnique({
        where: { id: routeId },
        include: { posts: { orderBy: { order: "asc" } } },
      });
      if (!route) return null;
      if (mountainId && route.mountainId !== mountainId) return null;
      return {
        mountainId: route.mountainId,
        routeId: route.id,
        posts: route.posts
          .filter((p) => p.lat !== null && p.lon !== null)
          .map((p) => ({ name: p.name, lat: p.lat as number, lon: p.lon as number })),
      };
    }
    if (mountainId) {
      const mountain = await this.prisma.mountain.findUnique({ where: { id: mountainId } });
      if (!mountain) return null;
      return { mountainId: mountain.id, routeId: null, posts: [] };
    }
    return { mountainId: null, routeId: null, posts: [] };
  }

  async createTrip(data: {
    name: string;
    type: Trip["type"];
    date: string;
    meetingPoint: string;
    meetingLat?: number | null;
    meetingLon?: number | null;
    // Touring: tujuan (opsional; koordinat harus sepasang atau tidak ada).
    destination?: string | null;
    destinationLat?: number | null;
    destinationLon?: number | null;
    quota?: number | null;
    durationDays?: number | null;
    isOpenTrip: boolean;
    price?: number | null;
    leaderId: string;
    // Hiking: tautan rute yang SUDAH divalidasi route (resolveTripRoute)
    // + pos jalur berkoordinat untuk disalin menjadi checkpoint.
    mountainId?: string | null;
    routeId?: string | null;
    routePosts?: { name: string; lat: number; lon: number }[];
  }): Promise<Trip> {
    const { routePosts = [], ...tripData } = data;
    const t = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          ...tripData,
          members: {
            create: { userId: data.leaderId, role: "LEADER", attendance: "NOT_DEPARTED" },
          },
        },
      });
      // Salin pos jalur menjadi checkpoint trip, SEKALI di pembuatan.
      // Checkpoint tidak punya kolom urutan — urutan = urutan pembuatan
      // (tripCheckpoints orderBy createdAt asc), jadi createdAt dibuat
      // menanjak per pos agar urutan RoutePost.order tidak hilang saat
      // beberapa baris berbagi milidetik yang sama. Checkpoint manual
      // leader sesudahnya menempel di belakang, tidak menduplikasi ini.
      const base = Date.now();
      for (let i = 0; i < routePosts.length; i++) {
        await tx.checkpoint.create({
          data: {
            tripId: created.id,
            name: routePosts[i].name,
            lat: routePosts[i].lat,
            lon: routePosts[i].lon,
            createdAt: new Date(base + i),
          },
        });
      }
      return created;
    });
    return (await this.attachTripRouteInfo([mapTrip(t)]))[0];
  }

  async updateTrip(
    id: string,
    data: Partial<{
      name: string;
      meetingPoint: string;
      meetingLat: number | null;
      meetingLon: number | null;
      quota: number | null;
      status: Trip["status"];
    }>,
  ): Promise<Trip | null> {
    try {
      return mapTrip(await this.prisma.trip.update({ where: { id }, data }));
    } catch {
      return null;
    }
  }

  async deleteTrip(id: string): Promise<void> {
    await this.prisma.trip.delete({ where: { id } }).catch(() => undefined);
  }

  // Start Trip otomatis Berangkat (keputusan pemilik 3 Nov 2026 16:51
  // WIB): PLANNED -> ACTIVE + SEMUA anggota jadi DEPARTED dalam SATU
  // transaksi — tidak ada kondisi setengah jalan (trip ACTIVE tapi
  // sebagian anggota masih NOT_DEPARTED). Mengembalikan trip + jumlah
  // anggota yang ditandai; null bila trip tidak ada.
  async activateTrip(
    id: string,
  ): Promise<{ trip: Trip; departedCount: number } | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.trip.update({
          where: { id },
          data: { status: "ACTIVE" },
        });
        const marked = await tx.tripMember.updateMany({
          where: { tripId: id },
          data: { attendance: "DEPARTED" },
        });
        return { trip: mapTrip(updated), departedCount: marked.count };
      });
    } catch {
      return null;
    }
  }

  async listTrips(): Promise<Trip[]> {
    return this.attachTripRouteInfo((await this.prisma.trip.findMany()).map(mapTrip));
  }

  async listTripsForUser(userId: string): Promise<Trip[]> {
    return this.attachTripRouteInfo(
      (
        await this.prisma.trip.findMany({
          where: {
            OR: [
              { members: { some: { userId } } },
              { isOpenTrip: true, status: { not: "CLOSED" } },
            ],
          },
        })
      ).map(mapTrip),
    );
  }

  // ---- Members ----
  async memberOf(tripId: string, userId: string): Promise<TripMember | null> {
    return this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
  }

  async upsertMember(tripId: string, userId: string, role: TripMember["role"]): Promise<void> {
    await this.prisma.tripMember.upsert({
      where: { tripId_userId: { tripId, userId } },
      create: { tripId, userId, role, attendance: "NOT_DEPARTED" },
      update: {},
    });
  }

  async removeMember(tripId: string, userId: string): Promise<void> {
    await this.prisma.tripMember
      .delete({ where: { tripId_userId: { tripId, userId } } })
      .catch(() => undefined);
  }

  async updateMember(
    tripId: string,
    userId: string,
    data: Partial<{ role: TripMember["role"]; attendance: TripMember["attendance"] }>,
  ): Promise<TripMember | null> {
    try {
      return await this.prisma.tripMember.update({
        where: { tripId_userId: { tripId, userId } },
        data,
      });
    } catch {
      return null;
    }
  }

  async tripMembers(tripId: string): Promise<TripMember[]> {
    return this.prisma.tripMember.findMany({ where: { tripId } });
  }

  async tripMembersWithUser(
    tripId: string,
  ): Promise<(TripMember & { user: Omit<User, "passwordHash" | "gender"> })[]> {
    const rows = await this.prisma.tripMember.findMany({
      where: { tripId },
      include: { user: true },
    });
    return rows.map((m) => ({
      tripId: m.tripId,
      userId: m.userId,
      role: m.role,
      attendance: m.attendance,
      user: publicUser(mapUser(m.user)),
    }));
  }

  // ---- Locations ----
  async addLocation(data: {
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
  }): Promise<Location> {
    const l = await this.prisma.location.create({
      data: {
        tripId: data.tripId,
        userId: data.userId,
        lat: data.lat,
        lon: data.lon,
        accuracy: data.accuracy ?? null,
        speed: data.speed ?? null,
        heading: data.heading ?? null,
        altitude: data.altitude ?? null,
        batteryLevel: data.batteryLevel ?? null,
        ts: new Date(data.ts),
      },
    });
    return mapLocation(l);
  }

  // M7 — compaction posisi lama per (trip, user): hanya baris lebih tua
  // dari 30 menit yang dipadatkan (pertama + terakhir per jendela
  // 5 menit, sisanya dihapus — lihat position-compaction.ts). Baris baru
  // tidak pernah disentuh, jadi last-seen (Location.ts terbaru) aman.
  async compactLocationsForMember(
    tripId: string,
    userId: string,
    now: Date = new Date(),
  ): Promise<{ kept: number; deleted: number }> {
    const rows = await this.prisma.location.findMany({
      where: { tripId, userId },
      orderBy: { ts: "asc" },
      select: { id: true, ts: true },
    });
    const { deleteIds } = planPositionCompaction(
      rows.map((r) => ({ id: r.id, ts: r.ts })),
      now.getTime(),
    );
    if (deleteIds.length === 0) {
      return { kept: rows.length, deleted: 0 };
    }
    await this.prisma.location.deleteMany({
      where: { id: { in: deleteIds } },
    });
    return { kept: rows.length - deleteIds.length, deleted: deleteIds.length };
  }

  // Latest location per member of the trip (same semantics as the old
  // store.latestLocations: newest ts wins per userId).
  async latestLocations(tripId: string): Promise<Location[]> {
    const rows = await this.prisma.location.findMany({
      where: { tripId },
      orderBy: { ts: "desc" },
    });
    const byUser = new Map<string, DbLocationRow>();
    for (const row of rows) {
      if (!byUser.has(row.userId)) byUser.set(row.userId, row);
    }
    return [...byUser.values()].map(mapLocation);
  }

  // M6: bounded recent history for one member, oldest-first. `since`
  // keeps the read bounded: callers pass now − 2× the signal-loss
  // window, which covers the NO_MOVEMENT window anchored at the latest
  // position (that latest may itself be up to one window old) plus
  // OFF_ROUTE's last two positions.
  async locationsSince(
    tripId: string,
    userId: string,
    since: string,
  ): Promise<Location[]> {
    const rows = await this.prisma.location.findMany({
      where: { tripId, userId, ts: { gte: new Date(since) } },
      orderBy: { ts: "asc" },
    });
    return rows.map(mapLocation);
  }
  // (null when the member has not sent any position yet). Powers
  // GET /trip-groups/:id/positions and the cross-trip overview.
  async tripPositions(tripId: string): Promise<
    {
      userId: string;
      role: TripMember["role"];
      user: Omit<User, "passwordHash" | "gender">;
      location: Location | null;
    }[]
  > {
    const [members, locations] = await Promise.all([
      this.tripMembersWithUser(tripId),
      this.latestLocations(tripId),
    ]);
    const locByUser = new Map(locations.map((l) => [l.userId, l]));
    return members.map((m) => ({
      userId: m.userId,
      role: m.role,
      user: m.user,
      location: locByUser.get(m.userId) ?? null,
    }));
  }

  // CC overview: every ACTIVE trip with member positions and SOS that
  // are not yet closed (same "active" set as hasActiveSos).
  async listActiveTrips(): Promise<Trip[]> {
    return (await this.prisma.trip.findMany({ where: { status: "ACTIVE" } })).map(mapTrip);
  }

  async activeSosOfTrip(tripId: string): Promise<SosAlert[]> {
    return (
      await this.prisma.sosAlert.findMany({
        where: {
          tripId,
          status: { notIn: ["RESOLVED", "CANCELLED", "FALSE_ALARM"] },
        },
        orderBy: { createdAt: "desc" },
      })
    ).map(mapSos);
  }

  // ---- SOS ----
  async createSos(data: {
    tripId: string;
    senderId: string;
    reason: SosAlert["reason"];
    level: SosAlert["level"];
    lat: number;
    lon: number;
  }): Promise<SosAlert> {
    return mapSos(await this.prisma.sosAlert.create({ data }));
  }

  async sosById(id: string): Promise<SosAlert | null> {
    const s = await this.prisma.sosAlert.findUnique({ where: { id } });
    return s ? mapSos(s) : null;
  }

  async tripSos(tripId: string): Promise<SosAlert[]> {
    return (
      await this.prisma.sosAlert.findMany({
        where: { tripId },
        orderBy: { createdAt: "desc" },
      })
    ).map(mapSos);
  }

  async hasActiveSos(tripId: string, senderId: string): Promise<boolean> {
    const count = await this.prisma.sosAlert.count({
      where: {
        tripId,
        senderId,
        status: { notIn: ["RESOLVED", "CANCELLED", "FALSE_ALARM"] },
      },
    });
    return count > 0;
  }

  async updateSosStatus(id: string, status: SosAlert["status"]): Promise<SosAlert | null> {
    try {
      return mapSos(await this.prisma.sosAlert.update({ where: { id }, data: { status } }));
    } catch {
      return null;
    }
  }

  // One dispatch per SOS id (same request that created the alert).
  recordDispatch(sosId: string): boolean {
    if (this.sosDispatch.has(sosId)) return false;
    this.sosDispatch.add(sosId);
    return true;
  }

  // ---- SOS Umum (tanpa trip) ----
  async createGeneralSos(data: {
    senderId: string;
    reason: GeneralSosReason;
    level: GeneralSos["level"];
    lat: number;
    lon: number;
  }): Promise<GeneralSos> {
    const row = await this.prisma.generalSos.create({ data });
    return { ...row, createdAt: iso(row.createdAt) };
  }

  async generalSosById(id: string): Promise<GeneralSos | null> {
    const row = await this.prisma.generalSos.findUnique({ where: { id } });
    return row ? { ...row, createdAt: iso(row.createdAt) } : null;
  }

  async hasActiveGeneralSos(senderId: string): Promise<boolean> {
    const count = await this.prisma.generalSos.count({
      where: {
        senderId,
        status: { notIn: ["RESOLVED", "CANCELLED", "FALSE_ALARM"] },
      },
    });
    return count > 0;
  }

  async updateGeneralSosStatus(
    id: string,
    status: GeneralSos["status"],
  ): Promise<GeneralSos | null> {
    try {
      const row = await this.prisma.generalSos.update({ where: { id }, data: { status } });
      return { ...row, createdAt: iso(row.createdAt) };
    } catch {
      return null;
    }
  }

  async generalSosResponderCount(generalSosId: string): Promise<number> {
    return this.prisma.generalSosResponder.count({ where: { generalSosId } });
  }

  async generalSosHasResponder(generalSosId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.generalSosResponder.findUnique({
      where: { generalSosId_userId: { generalSosId, userId } },
    });
    return row !== null;
  }

  // AI-G Glimmer — ingest idempotent per pengguna.
  private static mapGlimmer(row: {
    id: string;
    userId: string;
    clientMessageId: string;
    message: string;
    priority: string;
    answer: string | null;
    model: string | null;
    createdAt: Date;
    answeredAt: Date | null;
  }): AiGlimmerMessage {
    return {
      ...row,
      priority: row.priority === "sos" ? "sos" : "normal",
      createdAt: iso(row.createdAt),
      answeredAt: isoOrNull(row.answeredAt),
    };
  }

  async glimmerByClientKey(
    userId: string,
    clientMessageId: string,
  ): Promise<AiGlimmerMessage | null> {
    const row = await this.prisma.aiGlimmerMessage.findUnique({
      where: { userId_clientMessageId: { userId, clientMessageId } },
    });
    return row ? Db.mapGlimmer(row) : null;
  }

  async createGlimmerMessage(data: {
    userId: string;
    clientMessageId: string;
    message: string;
    priority: "sos" | "normal";
  }): Promise<AiGlimmerMessage> {
    const row = await this.prisma.aiGlimmerMessage.create({ data });
    return Db.mapGlimmer(row);
  }

  async listGlimmerMessages(userId: string): Promise<AiGlimmerMessage[]> {
    const rows = await this.prisma.aiGlimmerMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(Db.mapGlimmer);
  }

  async saveGlimmerAnswer(
    id: string,
    answer: string,
    model: string,
  ): Promise<AiGlimmerMessage | null> {
    try {
      const row = await this.prisma.aiGlimmerMessage.update({
        where: { id },
        data: { answer, model, answeredAt: new Date() },
      });
      return Db.mapGlimmer(row);
    } catch {
      return null;
    }
  }

  // Idempotent: pengguna yang sama menekan "Saya menuju lokasi" dua
  // kali tetap dihitung satu responder.
  async addGeneralSosResponder(generalSosId: string, userId: string): Promise<void> {
    await this.prisma.generalSosResponder.upsert({
      where: { generalSosId_userId: { generalSosId, userId } },
      create: { generalSosId, userId },
      update: {},
    });
  }

  // Bukti kirim ke penerima: baris notifikasi GENERAL_SOS_ALERT dengan
  // refId = id SOS umum. Dipakai juga sebagai cek hak baca detail.
  async hasGeneralSosAlertNotification(generalSosId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.notification.findFirst({
      where: { userId, refId: generalSosId, kind: "GENERAL_SOS_ALERT" },
    });
    return row !== null;
  }

  // Pengaman anti-penyalahgunaan: hitung SOS umum pengirim dalam
  // jendela geser (batas harian) + waktu kirim terakhir (cooldown).
  async countGeneralSosSince(senderId: string, since: Date): Promise<number> {
    return this.prisma.generalSos.count({
      where: { senderId, createdAt: { gte: since } },
    });
  }

  async latestGeneralSosCreatedAt(senderId: string): Promise<Date | null> {
    const row = await this.prisma.generalSos.findFirst({
      where: { senderId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  // Laporan SOS palsu dari penerima (satu laporan per pelapor per SOS).
  async generalSosReportByPair(
    generalSosId: string,
    reporterId: string,
  ): Promise<GeneralSosReport | null> {
    const row = await this.prisma.generalSosReport.findUnique({
      where: { generalSosId_reporterId: { generalSosId, reporterId } },
    });
    return row ? { ...row, createdAt: iso(row.createdAt) } : null;
  }

  async createGeneralSosReport(
    generalSosId: string,
    reporterId: string,
  ): Promise<GeneralSosReport> {
    const row = await this.prisma.generalSosReport.create({
      data: { generalSosId, reporterId },
    });
    return { ...row, createdAt: iso(row.createdAt) };
  }

  // Daftar SOS umum yang dilaporkan, untuk admin (urut laporan terbanyak).
  async reportedGeneralSosList(): Promise<
    Array<{
      sos: GeneralSos;
      senderName: string | null;
      reportCount: number;
      reporters: string[];
    }>
  > {
    const groups = await this.prisma.generalSosReport.groupBy({
      by: ["generalSosId"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const out = [];
    for (const g of groups) {
      const sos = await this.generalSosById(g.generalSosId);
      if (!sos) continue;
      const sender = await this.userById(sos.senderId);
      const reports = await this.prisma.generalSosReport.findMany({
        where: { generalSosId: g.generalSosId },
        include: { reporter: { select: { name: true } } },
      });
      out.push({
        sos,
        senderName: sender?.name ?? null,
        reportCount: g._count.id,
        reporters: reports.map((r) => r.reporter.name),
      });
    }
    return out;
  }

  async setGeneralSosFlagged(
    id: string,
    flagged: boolean,
  ): Promise<GeneralSos | null> {
    try {
      const row = await this.prisma.generalSos.update({
        where: { id },
        data: { flagged },
      });
      return { ...row, createdAt: iso(row.createdAt) };
    } catch {
      return null;
    }
  }

  // Posisi terakhir tiap pengguna lintas SEMUA trip (bukan per trip):
  // SOS umum tidak punya trip, jadi "terdekat" dihitung dari posisi
  // terakhir yang diketahui sistem untuk tiap pengguna.
  async latestLocationsGlobal(): Promise<Location[]> {
    const rows = await this.prisma.location.findMany({ orderBy: { ts: "desc" } });
    const byUser = new Map<string, DbLocationRow>();
    for (const row of rows) {
      if (!byUser.has(row.userId)) byUser.set(row.userId, row);
    }
    return [...byUser.values()].map(mapLocation);
  }

  // ---- Checkpoints ----
  async createCheckpoint(data: {
    tripId: string;
    name: string;
    lat: number;
    lon: number;
  }): Promise<Checkpoint> {
    return this.prisma.checkpoint.create({ data });
  }

  async checkpointById(id: string): Promise<Checkpoint | null> {
    return this.prisma.checkpoint.findUnique({ where: { id } });
  }

  async tripCheckpoints(tripId: string): Promise<Checkpoint[]> {
    // M6: the polyline is checkpoints in order; the model has no
    // ordering field, so creation order is the route order.
    return this.prisma.checkpoint.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
    });
  }

  async updateCheckpoint(
    id: string,
    data: Partial<{ name: string; lat: number; lon: number }>,
  ): Promise<Checkpoint | null> {
    try {
      return await this.prisma.checkpoint.update({ where: { id }, data });
    } catch {
      return null;
    }
  }

  async deleteCheckpoint(id: string): Promise<void> {
    await this.prisma.checkpoint.delete({ where: { id } }).catch(() => undefined);
  }

  async addCheckIn(checkpointId: string, userId: string): Promise<CheckpointCheckIn> {
    const ci = await this.prisma.checkpointCheckIn.create({
      data: { checkpointId, userId },
    });
    return { ...ci, ts: iso(ci.ts) };
  }

  async checkpointCheckIns(checkpointId: string): Promise<CheckpointCheckIn[]> {
    const rows = await this.prisma.checkpointCheckIn.findMany({ where: { checkpointId } });
    return rows.map((ci) => ({ ...ci, ts: iso(ci.ts) }));
  }

  // ---- Emergency contacts (A-4) ----
  async emergencyContactsOf(userId: string): Promise<
    { id: string; userId: string; name: string; phone: string }[]
  > {
    return this.prisma.emergencyContact.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, name: true, phone: true },
    });
  }

  async createEmergencyContact(data: {
    userId: string;
    name: string;
    phone: string;
  }): Promise<{ id: string; userId: string; name: string; phone: string }> {
    return this.prisma.emergencyContact.create({
      data,
      select: { id: true, userId: true, name: true, phone: true },
    });
  }

  // Deletes only when the contact belongs to userId; returns false
  // otherwise (foreign contacts look like 404 to the caller).
  async deleteEmergencyContact(userId: string, id: string): Promise<boolean> {
    const res = await this.prisma.emergencyContact.deleteMany({
      where: { id, userId },
    });
    return res.count > 0;
  }

  // ---- WA dispatch log (A-4) — dashboard monitors send failures ----
  async logWaDispatch(data: {
    sosId: string;
    tripId: string | null;
    toPhone: string;
    recipient: "EMERGENCY_CONTACT" | "LEADER" | "BYSTANDER";
    status: "SENT" | "FAILED" | "SKIPPED_UNCONFIGURED";
    error?: string | null;
  }): Promise<void> {
    await this.prisma.waDispatchLog.create({
      data: { ...data, error: data.error ?? null },
    });
  }

  async waDispatchLogs(filter: {
    sosId?: string;
    limit?: number;
  }): Promise<
    {
      id: string;
      sosId: string;
      tripId: string | null;
      toPhone: string;
      recipient: string;
      status: string;
      error: string | null;
      createdAt: Date;
    }[]
  > {
    return this.prisma.waDispatchLog.findMany({
      where: filter.sosId ? { sosId: filter.sosId } : undefined,
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 100,
    });
  }

  // ---- A-2: refresh token (rotasi) ----
  // Token opaque disimpan sebagai hash SHA-256 — DB bocor tidak
  // membocorkan token hidup.
  async createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.refreshToken.create({ data });
  }

  async refreshTokenByHash(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async rotateRefreshToken(
    oldId: string,
    next: { userId: string; tokenHash: string; expiresAt: Date },
  ) {
    const created = await this.prisma.refreshToken.create({ data: next });
    await this.prisma.refreshToken.update({
      where: { id: oldId },
      data: { revokedAt: new Date(), replacedBy: created.id },
    });
    return created;
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  // ---- A-5 §2: calendar + recap + activities ----
  // Kalender hanya trip yang saya ikuti (bukan open trip orang lain) —
  // beda dengan listTripsForUser yang juga memuat open trip publik.
  async tripsByMembership(userId: string): Promise<Trip[]> {
    return this.attachTripRouteInfo(
      (
        await this.prisma.trip.findMany({
          where: { members: { some: { userId } } },
          orderBy: { date: "asc" },
        })
      ).map(mapTrip),
    );
  }

  async tripRecap(tripId: string): Promise<{
    memberCount: number;
    sosCount: number;
    checkpointCount: number;
    checkInCount: number;
    locationCount: number;
  }> {
    const [memberCount, sosCount, checkpointCount, checkInCount, locationCount] =
      await Promise.all([
        this.prisma.tripMember.count({ where: { tripId } }),
        this.prisma.sosAlert.count({ where: { tripId } }),
        this.prisma.checkpoint.count({ where: { tripId } }),
        this.prisma.checkpointCheckIn.count({
          where: { checkpoint: { tripId } },
        }),
        this.prisma.location.count({ where: { tripId } }),
      ]);
    return { memberCount, sosCount, checkpointCount, checkInCount, locationCount };
  }

  // AI-R: satu laporan aktif per trip. upsert menaikkan version dan
  // menimpa narasi + facts (regenerate), createdAt pertama dipertahankan.
  async tripReportByTrip(tripId: string): Promise<TripReport | null> {
    const r = await this.prisma.tripReport.findUnique({ where: { tripId } });
    if (!r) return null;
    return {
      id: r.id,
      tripId: r.tripId,
      generatedById: r.generatedById,
      summary: r.summary,
      model: r.model,
      facts: r.facts,
      version: r.version,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  async upsertTripReport(data: {
    tripId: string;
    generatedById: string;
    summary: string;
    model: string;
    facts: object;
  }): Promise<{ report: TripReport; created: boolean }> {
    const existing = await this.prisma.tripReport.findUnique({
      where: { tripId: data.tripId },
    });
    const row = existing
      ? await this.prisma.tripReport.update({
          where: { tripId: data.tripId },
          data: {
            generatedById: data.generatedById,
            summary: data.summary,
            model: data.model,
            facts: data.facts,
            version: { increment: 1 },
          },
        })
      : await this.prisma.tripReport.create({ data });
    return {
      report: {
        id: row.id,
        tripId: row.tripId,
        generatedById: row.generatedById,
        summary: row.summary,
        model: row.model,
        facts: row.facts,
        version: row.version,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      },
      created: !existing,
    };
  }

  // Aktivitas trip diturunkan dari tabel kejadian yang sudah ada (SOS +
  // checkpoint + check-in) — tanpa tabel activity baru; cukup untuk layar
  // Aktivitas mockup dan tidak menduplikasi sumber kebenaran.
  async tripActivities(
    tripId: string,
  ): Promise<{ kind: string; at: string; actorId: string | null; refId: string }[]> {
    const [sos, checkpoints, checkIns] = await Promise.all([
      this.prisma.sosAlert.findMany({ where: { tripId } }),
      this.prisma.checkpoint.findMany({
        where: { tripId },
        select: { id: true, createdAt: true },
      }),
      this.prisma.checkpointCheckIn.findMany({
        where: { checkpoint: { tripId } },
        select: { id: true, userId: true, ts: true },
      }),
    ]);
    const acts = [
      ...sos.map((s) => ({
        kind: "SOS_TRIGGERED",
        at: iso(s.createdAt),
        actorId: s.senderId as string | null,
        refId: s.id,
      })),
      ...checkpoints.map((c) => ({
        kind: "CHECKPOINT_CREATED",
        at: iso(c.createdAt),
        actorId: null as string | null,
        refId: c.id,
      })),
      ...checkIns.map((ci) => ({
        kind: "CHECKPOINT_CHECKIN",
        at: iso(ci.ts),
        actorId: ci.userId as string | null,
        refId: ci.id,
      })),
    ];
    return acts.sort((a, b) => b.at.localeCompare(a.at));
  }

  // ---- A-5 §4: my-alerts + stats ----
  // "SOS yang saya terima" = SOS di trip yang saya ikuti, dikirim orang
  // lain (pengirim tidak menerima SOS-nya sendiri).
  async sosReceivedBy(userId: string): Promise<SosAlert[]> {
    return (
      await this.prisma.sosAlert.findMany({
        where: {
          senderId: { not: userId },
          trip: { members: { some: { userId } } },
        },
        orderBy: { createdAt: "desc" },
      })
    ).map(mapSos);
  }

  async sosStats(userId: string): Promise<{
    sent: number;
    active: number;
    resolved: number;
    received: number;
  }> {
    const [sent, active, resolved, received] = await Promise.all([
      this.prisma.sosAlert.count({ where: { senderId: userId } }),
      this.prisma.sosAlert.count({
        where: {
          senderId: userId,
          status: { in: ["ACTIVE", "ACKNOWLEDGED", "IN_PROGRESS"] },
        },
      }),
      this.prisma.sosAlert.count({
        where: { senderId: userId, status: "RESOLVED" },
      }),
      this.prisma.sosAlert.count({
        where: {
          senderId: { not: userId },
          trip: { members: { some: { userId } } },
        },
      }),
    ]);
    return { sent, active, resolved, received };
  }

  // ---- A-5 §13: ratings organizer ----
  async createRating(data: {
    tripId: string;
    raterId: string;
    organizerId: string;
    score: number;
    comment: string | null;
  }): Promise<{ id: string } | "DUPLICATE"> {
    try {
      const row = await this.prisma.rating.create({ data });
      return { id: row.id };
    } catch (e) {
      // P2002 = unique (tripId, raterId): sudah pernah menilai.
      if (
        typeof e === "object" &&
        e !== null &&
        (e as { code?: string }).code === "P2002"
      ) {
        return "DUPLICATE";
      }
      throw e;
    }
  }

  async ratingsOf(organizerId: string): Promise<{
    ratings: { id: string; tripId: string; score: number; comment: string | null; createdAt: string }[];
    average: number | null;
  }> {
    const rows = await this.prisma.rating.findMany({
      where: { organizerId },
      orderBy: { createdAt: "desc" },
    });
    const ratings = rows.map((r) => ({
      id: r.id,
      tripId: r.tripId,
      score: r.score,
      comment: r.comment,
      createdAt: iso(r.createdAt),
    }));
    const average =
      rows.length === 0
        ? null
        : Math.round((rows.reduce((s, r) => s + r.score, 0) / rows.length) * 10) / 10;
    return { ratings, average };
  }

  // ---- AI-Q: riwayat tanya-jawab member per trip ----
  async createTripQuestion(data: {
    tripId: string;
    userId: string;
    question: string;
    answer: string | null;
    notFound: boolean;
    sources: string[];
    model: string | null;
    links: { label: string; url: string }[];
  }): Promise<TripQuestion> {
    const row = await this.prisma.tripQuestion.create({ data });
    return mapTripQuestion(row);
  }

  async listTripQuestions(tripId: string): Promise<TripQuestion[]> {
    const rows = await this.prisma.tripQuestion.findMany({
      where: { tripId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapTripQuestion);
  }

  // ---- SET-4/5/6: platform settings (toggle dashboard) ----
  // Default di kode; baris DB hanya ada untuk kunci yang pernah diubah.
  // Cache in-memory dengan TTL pendek supaya middleware maintenance tidak
  // memukul DB di setiap request.
  async platformSettings(): Promise<PlatformSettings> {
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCacheAt < SETTINGS_CACHE_TTL_MS) {
      return this.settingsCache;
    }
    const rows = await this.prisma.platformSetting.findMany();
    const merged = { ...PLATFORM_SETTING_DEFAULTS };
    for (const row of rows) {
      if (row.key in merged) {
        if (typeof merged[row.key as keyof PlatformSettings] === "string") {
          (merged as Record<string, unknown>)[row.key] = row.valueText ?? "";
        } else if (typeof merged[row.key as keyof PlatformSettings] === "number") {
          // Angka disimpan sebagai teks (pola valueText Brevo) karena
          // kolom value Boolean tidak bisa menampung angka.
          const parsed = parseInt(row.valueText ?? "", 10);
          if (Number.isFinite(parsed)) {
            (merged as Record<string, unknown>)[row.key] = parsed;
          }
        } else {
          merged[row.key as keyof PlatformSettings] = row.value as never;
        }
      }
    }
    this.settingsCache = merged;
    this.settingsCacheAt = now;
    return merged;
  }

  async updatePlatformSettings(
    patch: Partial<PlatformSettings>,
  ): Promise<PlatformSettings> {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (typeof value === "number") {
        // Angka: valueText yang dibaca platformSettings(); kolom value
        // Boolean diisi true saja (tidak dipakai untuk kunci angka).
        await this.prisma.platformSetting.upsert({
          where: { key },
          update: { value: true, valueText: String(value) },
          create: { key, value: true, valueText: String(value) },
        });
      } else if (typeof value === "string") {
        await this.prisma.platformSetting.upsert({
          where: { key },
          update: { value: value.length > 0, valueText: value },
          create: { key, value: value.length > 0, valueText: value },
        });
      } else {
        await this.prisma.platformSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        });
      }
    }
    this.settingsCache = null;
    return this.platformSettings();
  }

  // ---- M2 push tokens (FCM saja, Wella 3 Nov 2026): satu token
  // device native per user (terbaru menang). Token yang sama tidak
  // boleh menempel di dua user — daftar ulang memindahkan token
  // (ganti HP / login akun lain).
  async upsertPushToken(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { token } });
    await this.prisma.pushToken.upsert({
      where: { userId },
      update: { token },
      create: { userId, token },
    });
  }

  async pushTokensForUsers(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  private settingsCache: PlatformSettings | null = null;
  private settingsCacheAt = 0;

  // ---- PAY: upgrade Pro (verifikasi manual admin) ----
  async isPro(userId: string): Promise<boolean> {
    const verified = await this.prisma.upgradeRequest.count({
      where: { userId, status: "VERIFIED" },
    });
    return verified > 0;
  }

  async pendingUpgradeOf(userId: string): Promise<{
    id: string;
    userId: string;
    amount: number;
    status: string;
    createdAt: Date;
  } | null> {
    return this.prisma.upgradeRequest.findFirst({
      where: { userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
  }

  async latestUpgradeOf(userId: string): Promise<{
    id: string;
    userId: string;
    amount: number;
    status: string;
    createdAt: Date;
  } | null> {
    return this.prisma.upgradeRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createUpgradeRequest(userId: string, amount: number) {
    return this.prisma.upgradeRequest.create({ data: { userId, amount } });
  }

  async listUpgrades(status?: "PENDING" | "VERIFIED" | "REJECTED") {
    return this.prisma.upgradeRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async verifyUpgrade(id: string, adminId: string): Promise<boolean> {
    const res = await this.prisma.upgradeRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "VERIFIED", verifiedAt: new Date(), verifiedBy: adminId },
    });
    return res.count > 0;
  }

  // ---- PAY: pembayaran trip berbayar (konfirmasi organizer) ----
  async createTripPayment(tripId: string, userId: string, amount: number) {
    // Idempoten: join ulang tidak menggandakan tagihan.
    return this.prisma.tripPayment.upsert({
      where: { tripId_userId: { tripId, userId } },
      update: {},
      create: { tripId, userId, amount },
    });
  }

  async tripPaymentOf(tripId: string, userId: string) {
    return this.prisma.tripPayment.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
  }

  async tripPayments(tripId: string) {
    return this.prisma.tripPayment.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
    });
  }

  async confirmTripPayment(tripId: string, paymentId: string): Promise<boolean> {
    const res = await this.prisma.tripPayment.updateMany({
      where: { id: paymentId, tripId, status: "WAITING" },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    return res.count > 0;
  }

  // ---- Share links ----
  async createShareLink(data: {
    tripId: string;
    label: string;
    scope: ShareLink["scope"];
    token: string;
    createdBy: string;
  }): Promise<ShareLink> {
    return mapShareLink(await this.prisma.shareLink.create({ data }));
  }

  async tripShareLinks(tripId: string): Promise<ShareLink[]> {
    return (
      await this.prisma.shareLink.findMany({ where: { tripId, revokedAt: null } })
    ).map(mapShareLink);
  }

  async shareLinkById(id: string): Promise<ShareLink | null> {
    const l = await this.prisma.shareLink.findUnique({ where: { id } });
    return l ? mapShareLink(l) : null;
  }

  async shareLinkByToken(token: string): Promise<ShareLink | null> {
    const l = await this.prisma.shareLink.findUnique({ where: { token } });
    return l && !l.revokedAt ? mapShareLink(l) : null;
  }

  async revokeShareLink(id: string): Promise<void> {
    await this.prisma.shareLink
      .update({ where: { id }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  // ---- Trip invites (INVITE 2 Nov 2026) ----
  async createTripInvite(data: {
    tripId: string;
    label: string;
    token: string;
    createdBy: string;
  }): Promise<TripInvite> {
    const inv = await this.prisma.tripInvite.create({ data });
    return { ...inv, revokedAt: isoOrNull(inv.revokedAt) };
  }

  async tripInvites(tripId: string): Promise<TripInvite[]> {
    const rows = await this.prisma.tripInvite.findMany({
      where: { tripId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((inv) => ({ ...inv, revokedAt: isoOrNull(inv.revokedAt) }));
  }

  async tripInviteById(id: string): Promise<TripInvite | null> {
    const inv = await this.prisma.tripInvite.findUnique({ where: { id } });
    return inv ? { ...inv, revokedAt: isoOrNull(inv.revokedAt) } : null;
  }

  async tripInviteByToken(token: string): Promise<TripInvite | null> {
    const inv = await this.prisma.tripInvite.findUnique({ where: { token } });
    return inv && !inv.revokedAt
      ? { ...inv, revokedAt: isoOrNull(inv.revokedAt) }
      : null;
  }

  async revokeTripInvite(id: string): Promise<void> {
    await this.prisma.tripInvite
      .update({ where: { id }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  // ---- Notifications (§9) ----
  async notifyDashboard(
    kind: NotificationKind,
    data: { tripId?: string | null; refId?: string | null; actorName?: string | null },
  ): Promise<void> {
    const staff = await this.prisma.user.findMany({
      where: { role: { in: ["admin", "command_center"] } },
      select: { id: true },
    });
    if (staff.length === 0) return;
    await this.prisma.notification.createMany({
      data: staff.map((s) => ({
        userId: s.id,
        kind,
        tripId: data.tripId ?? null,
        refId: data.refId ?? null,
        actorName: data.actorName ?? null,
      })),
    });
  }

  // SET-3: notif langsung ke satu user (leader trip saat check-in).
  async notifyUser(
    userId: string,
    kind: NotificationKind,
    data: { tripId?: string | null; refId?: string | null; actorName?: string | null },
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId,
        kind,
        tripId: data.tripId ?? null,
        refId: data.refId ?? null,
        actorName: data.actorName ?? null,
      },
    });
  }

  // Start Trip otomatis Berangkat: satu baris notifikasi per anggota
  // (broadcast, bukan hanya leader) — createMany satu query.
  async notifyUsers(
    userIds: string[],
    kind: NotificationKind,
    data: { tripId?: string | null; refId?: string | null; actorName?: string | null },
  ): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        kind,
        tripId: data.tripId ?? null,
        refId: data.refId ?? null,
        actorName: data.actorName ?? null,
      })),
    });
  }

  async userNotifications(userId: string): Promise<Notification[]> {
    return (
      await this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      })
    ).map(mapNotification);
  }

  async unreadNotificationCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async notificationById(id: string): Promise<Notification | null> {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    return n ? mapNotification(n) : null;
  }

  async markNotificationRead(id: string): Promise<Notification | null> {
    try {
      return mapNotification(
        await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } }),
      );
    } catch {
      return null;
    }
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  // ---- Reports (§14, Moderasi) ----
  async createReport(data: {
    reporterId: string;
    targetType: string;
    targetId: string | null;
    reason: string;
  }): Promise<Report> {
    const r = await this.prisma.report.create({ data });
    return { ...r, createdAt: iso(r.createdAt), closedAt: isoOrNull(r.closedAt) };
  }

  async listReports(status?: Report["status"]): Promise<(Report & { reporterName: string })[]> {
    const rows = await this.prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: { reporter: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      reporterId: r.reporterId,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      createdAt: iso(r.createdAt),
      closedAt: isoOrNull(r.closedAt),
      reporterName: r.reporter.name,
    }));
  }

  async closeReport(id: string, status: "ACTIONED" | "DISMISSED"): Promise<Report | null> {
    try {
      const r = await this.prisma.report.update({
        where: { id },
        data: { status, closedAt: new Date() },
      });
      return { ...r, createdAt: iso(r.createdAt), closedAt: isoOrNull(r.closedAt) };
    } catch {
      return null;
    }
  }

  // ---- Communities (Komunitas page, tab Komunitas Aktif) ----
  async listCommunities(): Promise<
    { id: string; name: string; memberCount: number; createdAt: string }[]
  > {
    const rows = await this.prisma.community.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { members: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      memberCount: c._count.members,
      createdAt: iso(c.createdAt),
    }));
  }

  async deleteCommunity(id: string): Promise<boolean> {
    try {
      // Members cascade via the CommunityMember FK (onDelete: Cascade).
      await this.prisma.community.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // ---- A-5 §12: communities sisi user ----
  async communityById(id: string): Promise<{
    id: string;
    name: string;
    description: string | null;
    region: string | null;
    memberCount: number;
    members: { userId: string; name: string; slug: string }[];
  } | null> {
    const c = await this.prisma.community.findUnique({
      where: { id },
      include: { members: { include: { user: true } } },
    });
    if (!c) return null;
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      region: c.region,
      memberCount: c.members.length,
      members: c.members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        slug: m.user.slug,
      })),
    };
  }

  async isCommunityMember(communityId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.communityMember.findFirst({
      where: { communityId, userId },
      select: { userId: true },
    });
    return row !== null;
  }

  // Join idempoten: sudah anggota = sukses tanpa baris ganda.
  async joinCommunity(communityId: string, userId: string): Promise<boolean> {
    const exists = await this.prisma.community.count({ where: { id: communityId } });
    if (exists === 0) return false;
    if (!(await this.isCommunityMember(communityId, userId))) {
      await this.prisma.communityMember.create({ data: { communityId, userId } });
    }
    return true;
  }

  async leaveCommunity(communityId: string, userId: string): Promise<void> {
    await this.prisma.communityMember.deleteMany({
      where: { communityId, userId },
    });
  }

  async communityFeed(communityId: string): Promise<
    {
      id: string;
      authorId: string;
      authorName: string;
      body: string;
      commentCount: number;
      createdAt: string;
    }[]
  > {
    const posts = await this.prisma.communityPost.findMany({
      where: { communityId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { comments: true } } },
    });
    const authorIds = [...new Set(posts.map((p) => p.authorId))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(authors.map((a) => [a.id, a.name]));
    return posts.map((p) => ({
      id: p.id,
      authorId: p.authorId,
      authorName: nameOf.get(p.authorId) ?? "?",
      body: p.body,
      commentCount: p._count.comments,
      createdAt: iso(p.createdAt),
    }));
  }

  async createCommunityPost(data: {
    communityId: string;
    authorId: string;
    body: string;
  }): Promise<{ id: string }> {
    const row = await this.prisma.communityPost.create({ data });
    return { id: row.id };
  }

  async communityPostById(
    communityId: string,
    postId: string,
  ): Promise<{ id: string } | null> {
    const row = await this.prisma.communityPost.findFirst({
      where: { id: postId, communityId },
      select: { id: true },
    });
    return row;
  }

  async postComments(postId: string): Promise<
    { id: string; authorId: string; authorName: string; body: string; createdAt: string }[]
  > {
    const comments = await this.prisma.communityComment.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
    });
    const authorIds = [...new Set(comments.map((c) => c.authorId))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(authors.map((a) => [a.id, a.name]));
    return comments.map((c) => ({
      id: c.id,
      authorId: c.authorId,
      authorName: nameOf.get(c.authorId) ?? "?",
      body: c.body,
      createdAt: iso(c.createdAt),
    }));
  }

  async createPostComment(data: {
    postId: string;
    authorId: string;
    body: string;
  }): Promise<{ id: string }> {
    const row = await this.prisma.communityComment.create({ data });
    return { id: row.id };
  }

  // ---- A-5 §10: katalog gunung ----
  // Tabel Gunung (1 Nov 2026): list memuat field tabel + routeCount
  // (jumlah jalur dari relasi routes, bukan kolom tersimpan).
  async listMountains() {
    const rows = await this.prisma.mountain.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { routes: true } } },
    });
    return rows.map((m) => ({
      ...m,
      routeCount: m._count.routes,
      _count: undefined,
    }));
  }

  async mountainById(id: string) {
    const m = await this.prisma.mountain.findUnique({
      where: { id },
      include: {
        routes: {
          orderBy: { name: "asc" },
          include: { posts: { orderBy: { order: "asc" } } },
        },
        _count: { select: { routes: true } },
      },
    });
    if (!m) return null;
    return {
      ...m,
      routes: m.routes.map((r) => mapRoute(r)),
      routeCount: m._count.routes,
      _count: undefined,
    };
  }

  // Tabel Gunung: edit admin (PATCH). Hanya field yang diizinkan yang
  // diteruskan; validasi bentuk ada di route, bukan di sini.
  async updateMountain(
    id: string,
    patch: Partial<{
      name: string;
      elevationM: number;
      location: string;
      province: string;
      difficultyKey: string;
      imageUrl: string | null;
      volcanoActive: boolean;
      isActive: boolean;
      description: string | null;
      lat: number | null;
      lon: number | null;
    }>,
  ) {
    return this.prisma.mountain.update({ where: { id }, data: patch });
  }

  // Tabel Gunung: hapus admin (DELETE). Routes ikut terhapus via
  // onDelete Cascade; Trip tidak punya FK ke Mountain, jadi aman.
  async deleteMountain(id: string) {
    await this.prisma.mountain.delete({ where: { id } });
  }

  async mountainRoute(mountainId: string, routeId: string) {
    const route = await this.prisma.mountainRoute.findFirst({
      where: { id: routeId, mountainId },
      include: { posts: { orderBy: { order: "asc" } } },
    });
    return route ? mapRoute(route, true) : null;
  }

  // Jalur (admin-only): buat. posts dinormalisasi (lihat
  // normalizeRoutePosts) supaya jalur selalu lengkap sampai puncak.
  async createMountainRoute(
    mountainId: string,
    data: {
      name: string;
      meetingPoint: string;
      distanceKm: number;
      gainM: number;
      estHours: number;
      recommended?: boolean;
    },
    posts: unknown,
  ) {
    const mountain = await this.prisma.mountain.findUnique({
      where: { id: mountainId },
    });
    if (!mountain) return null;
    const inputs = normalizeRoutePosts(posts, mountain.name);
    const route = await this.prisma.mountainRoute.create({
      data: {
        id: randomUUID(),
        mountainId,
        ...data,
        recommended: data.recommended ?? false,
        posts: {
          create: inputs.map((p, order) => ({
            name: p.name,
            order,
            lat: p.lat,
            lon: p.lon,
          })),
        },
      },
      include: { posts: { orderBy: { order: "asc" } } },
    });
    return mapRoute(route);
  }

  // Jalur (admin-only): edit. posts === undefined berarti daftar pos
  // tidak diubah; selain itu daftar lama diganti total (dan tetap
  // diakhiri Puncak oleh normalizeRoutePosts) — TAPI kolom yang tidak
  // dipegang form (koordinat, elevasi, flag checkpoint bawaan/tujuan)
  // dipertahankan per urutan bila pos baru tidak membawanya secara
  // eksplisit, supaya edit ganti-nama tidak memusnahkan data MDPL.
  async updateMountainRoute(
    mountainId: string,
    routeId: string,
    patch: Partial<{
      name: string;
      meetingPoint: string;
      distanceKm: number;
      gainM: number;
      estHours: number;
      recommended: boolean;
      isActive: boolean;
    }>,
    posts?: unknown,
  ) {
    const existing = await this.prisma.mountainRoute.findFirst({
      where: { id: routeId, mountainId },
      include: {
        mountain: true,
        posts: { orderBy: { order: "asc" } },
      },
    });
    if (!existing) return null;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (posts !== undefined) {
        await tx.routePost.deleteMany({ where: { routeId } });
        const inputs = normalizeRoutePosts(posts, existing.mountain.name);
        await tx.routePost.createMany({
          data: inputs.map((p, order) => {
            const old = existing.posts[order];
            return {
              routeId,
              name: p.name,
              order,
              // Eksplisit (termasuk null) = pakai nilai baru; selebihnya
              // warisi baris lama di urutan yang sama.
              lat: p.coordsProvided ? p.lat : (old?.lat ?? null),
              lon: p.coordsProvided ? p.lon : (old?.lon ?? null),
              elevationM: old?.elevationM ?? null,
              autoCheckpoint: old?.autoCheckpoint ?? false,
              isTarget: old?.isTarget ?? false,
              // Tags diwarisi seperti koordinat: edit nama saja tidak
              // boleh menghapus jenis checkpoint MDPL.
              tags: old?.tags ?? [],
            };
          }),
        });
      }
      return tx.mountainRoute.update({
        where: { id: routeId },
        data: patch,
        include: { posts: { orderBy: { order: "asc" } } },
      });
    });
    return mapRoute(updated);
  }

  // Jalur (admin-only): hapus. RoutePost ikut terhapus via Cascade.
  async deleteMountainRoute(mountainId: string, routeId: string) {
    const existing = await this.prisma.mountainRoute.findFirst({
      where: { id: routeId, mountainId },
    });
    if (!existing) return false;
    await this.prisma.mountainRoute.delete({ where: { id: routeId } });
    return true;
  }

  async seedMountains(
    mountains: {
      id: string;
      name: string;
      elevationM: number;
      location: string;
      difficultyKey: string;
      province?: string;
      imageUrl?: string | null;
      volcanoActive?: boolean;
      isActive?: boolean;
      description?: string | null;
      lat?: number | null;
      lon?: number | null;
      routes: {
        id: string;
        name: string;
        meetingPoint: string;
        distanceKm: number | null;
        gainM: number | null;
        estHours: number | null;
        recommended: boolean;
        track?: unknown;
        checkpoints?: {
          name: string;
          lat: number;
          lon: number;
          elevationM: number | null;
          autoCheckpoint: boolean;
          isTarget: boolean;
          tags?: string[];
        }[];
      }[];
    }[],
  ): Promise<void> {
    for (const m of mountains) {
      const { routes, ...mountain } = m;
      // Tabel Gunung: seed TIDAK menimpa edit admin. Gunung yang sudah
      // ada hanya di-backfill field barunya yang masih kosong (provinsi,
      // gambar, deskripsi, koordinat, tipe vulkanik); nama/elevasi/
      // lokasi/kesulitan/status tetap milik admin. Gunung baru dibuat
      // lengkap, jadi rerun setelah DELETE me-restore katalog seed.
      const existing = await this.prisma.mountain.findUnique({
        where: { id: mountain.id },
      });
      if (!existing) {
        // Baris seed selalu MDPL; baris USER tidak pernah dibuat di sini.
        await this.prisma.mountain.create({ data: { ...mountain, source: "MDPL" } });
      } else if (!existing.imageUrl) {
        // Baris pra-tabel (imageUrl masih kosong) = belum pernah
        // di-backfill: isi semua field baru dari seed sekali saja,
        // termasuk pecahan lokasi (kota saja; provinsi pindah ke kolom
        // province supaya kolom Lokasi tidak menduplikasi Provinsi).
        await this.prisma.mountain.update({
          where: { id: mountain.id },
          data: {
            location: mountain.location,
            province: mountain.province ?? "",
            imageUrl: mountain.imageUrl ?? null,
            description: mountain.description ?? null,
            lat: mountain.lat ?? null,
            lon: mountain.lon ?? null,
            volcanoActive: mountain.volcanoActive ?? false,
          },
        });
      } else {
        // Sudah di-backfill: hanya isi field yang masih kosong, jangan
        // sentuh edit admin (termasuk volcanoActive/imageUrl).
        await this.prisma.mountain.update({
          where: { id: mountain.id },
          data: {
            province: existing.province ? undefined : (mountain.province ?? ""),
            description: existing.description
              ? undefined
              : (mountain.description ?? null),
            lat: existing.lat ?? mountain.lat ?? null,
            lon: existing.lon ?? mountain.lon ?? null,
          },
        });
      }
      for (const route of routes) {
        const { checkpoints, track, ...routeData } = route;
        const saved = await this.prisma.mountainRoute.upsert({
          where: { id: route.id },
          update: { ...routeData, mountainId: m.id, track: track ?? undefined },
          create: {
            ...routeData,
            mountainId: m.id,
            track: track ?? undefined,
          },
        });
        // Jalur MDPL membawa daftar checkpoint-nya sendiri: ganti total
        // (bukan ditambah normalizeRoutePosts) supaya pos MDPL tidak
        // tercampur pos admin lama. Jalur tanpa checkpoints dibiarkan.
        if (checkpoints !== undefined) {
          await this.prisma.routePost.deleteMany({ where: { routeId: saved.id } });
          if (checkpoints.length > 0) {
            await this.prisma.routePost.createMany({
              data: checkpoints.map((c, order) => ({
                routeId: saved.id,
                order,
                name: c.name,
                lat: c.lat,
                lon: c.lon,
                elevationM: c.elevationM,
                autoCheckpoint: c.autoCheckpoint,
                isTarget: c.isTarget,
                // Tags MDPL (Post/CampArea/Peak/dll.) disimpan di seed
                // supaya peta + tabel bisa membedakan jenis checkpoint.
                tags: c.tags ?? [],
              })),
            });
          }
        }
      }
    }
  }

  // Ganti katalog MDPL shifted: HANYA gunung bersource MDPL yang tidak
  // ada di katalog baru dihapus — gunung buatan user yang sudah
  // disetujui admin (source 'USER') SELAMAT dari restart/deploy API.
  // Trip tidak punya FK ke Mountain, jadi hapus MDPL aman. Cara
  // re-run: restart API (seedMountains di ready) atau bun db:seed.
  // Katalog lama (4 seed + 36 impor #104) sengaja tidak dipertahankan
  // — perintah Wella 1 Nov 2026: data gunung lama diganti JSON MDPL.
  async replaceMountainCatalog(
    mountains: Parameters<Db["seedMountains"]>[0],
  ): Promise<void> {
    const keepIds = new Set(mountains.map((m) => m.id));
    const existing = await this.prisma.mountain.findMany({
      where: { source: "MDPL" },
      select: { id: true },
    });
    for (const row of existing) {
      if (!keepIds.has(row.id)) {
        await this.prisma.mountain.delete({ where: { id: row.id } });
      }
    }
    await this.seedMountains(mountains);
  }

  // ---- Usulan gunung & jalur buatan user (antre persetujuan admin) ----
  async createMountainProposal(
    userId: string,
    data: {
      name: string;
      location: string;
      lat: number;
      lon: number;
      elevationM: number | null;
    },
  ) {
    return this.prisma.mountainProposal.create({ data: { userId, ...data } });
  }

  async listMyMountainProposals(userId: string) {
    return this.prisma.mountainProposal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createRouteProposal(
    userId: string,
    mountainId: string,
    name: string,
    posts: { name: string; lat: number; lon: number; isGathering: boolean }[],
  ) {
    return this.prisma.routeProposal.create({
      data: {
        userId,
        mountainId,
        name,
        posts: { create: posts.map((p, order) => ({ ...p, order })) },
      },
      include: { posts: { orderBy: { order: "asc" } } },
    });
  }

  async listMyRouteProposals(userId: string) {
    return this.prisma.routeProposal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { posts: { orderBy: { order: "asc" } }, mountain: true },
    });
  }

  async listProposals() {
    const [mountains, routes] = await Promise.all([
      this.prisma.mountainProposal.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.routeProposal.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          mountain: true,
          posts: { orderBy: { order: "asc" } },
        },
      }),
    ]);
    return { mountains, routes };
  }

  async proposalById(kind: "mountain" | "route", id: string) {
    if (kind === "mountain") {
      return this.prisma.mountainProposal.findUnique({
        where: { id },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    }
    return this.prisma.routeProposal.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        mountain: true,
        posts: { orderBy: { order: "asc" } },
      },
    });
  }

  // Approve usulan gunung: jadi baris Mountain source 'USER' (kebal
  // seed), usulan ditandai APPROVED. Hanya dari status PENDING.
  async approveMountainProposal(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.mountainProposal.findUnique({ where: { id } });
      if (!proposal || proposal.status !== "PENDING") return null;
      const mountain = await tx.mountain.create({
        data: {
          id: randomUUID(),
          name: proposal.name,
          elevationM: proposal.elevationM ?? 0,
          location: proposal.location,
          difficultyKey: "",
          province: "",
          lat: proposal.lat,
          lon: proposal.lon,
          source: "USER",
        },
      });
      await tx.mountainProposal.update({
        where: { id },
        data: { status: "APPROVED", decidedAt: new Date() },
      });
      return mountain;
    });
  }

  // Approve usulan jalur: jadi MountainRoute source 'USER' + RoutePost
  // (checkpoint pertama = titik kumpul awal, isGathering true).
  async approveRouteProposal(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.routeProposal.findUnique({
        where: { id },
        include: { posts: { orderBy: { order: "asc" } } },
      });
      if (!proposal || proposal.status !== "PENDING") return null;
      const route = await tx.mountainRoute.create({
        data: {
          id: randomUUID(),
          mountainId: proposal.mountainId,
          name: proposal.name,
          meetingPoint: proposal.posts[0]?.name ?? proposal.name,
          distanceKm: null,
          gainM: null,
          estHours: null,
          recommended: false,
          source: "USER",
          posts: {
            create: proposal.posts.map((p) => ({
              name: p.name,
              order: p.order,
              lat: p.lat,
              lon: p.lon,
              isGathering: p.isGathering,
            })),
          },
        },
        include: { posts: { orderBy: { order: "asc" } } },
      });
      await tx.routeProposal.update({
        where: { id },
        data: { status: "APPROVED", decidedAt: new Date() },
      });
      return mapRoute(route);
    });
  }

  async rejectProposal(kind: "mountain" | "route", id: string, reason: string | null) {
    const data = { status: "REJECTED", rejectReason: reason, decidedAt: new Date() };
    if (kind === "mountain") {
      const proposal = await this.prisma.mountainProposal.findUnique({ where: { id } });
      if (!proposal || proposal.status !== "PENDING") return null;
      return this.prisma.mountainProposal.update({ where: { id }, data });
    }
    const proposal = await this.prisma.routeProposal.findUnique({ where: { id } });
    if (!proposal || proposal.status !== "PENDING") return null;
    return this.prisma.routeProposal.update({ where: { id }, data });
  }

  // ---- A-5 §14: aturan trip expired ----
  // Expired = CLOSED, ATAU PLANNED yang tanggalnya sudah lewat (trip yang
  // tidak pernah dimulai). ACTIVE tidak pernah expired — trip berjalan.
  async listExpiredTrips(today: string): Promise<Trip[]> {
    return (
      await this.prisma.trip.findMany({
        where: {
          OR: [{ status: "CLOSED" }, { status: "PLANNED", date: { lt: today } }],
        },
        orderBy: { date: "asc" },
      })
    ).map(mapTrip);
  }

  async isTripExpired(id: string, today: string): Promise<boolean> {
    const t = await this.prisma.trip.findUnique({
      where: { id },
      select: { status: true, date: true },
    });
    if (!t) return false;
    return t.status === "CLOSED" || (t.status === "PLANNED" && t.date < today);
  }
}

// SET-7: gender anggota trip yang MENGISI gender (null dilewati) —
// kriteria FEMALE_MAJORITY dihitung dari subset ini saja.
export async function memberGendersOf(db: Db, tripId: string): Promise<("MALE" | "FEMALE")[]> {
  const members = await db.tripMembers(tripId);
  const users = await Promise.all(members.map((m) => db.userById(m.userId)));
  return users.flatMap((u) => (u?.gender ? [u.gender] : []));
}

// SET-7: gender ikut dibuang — data sensitif, hanya untuk penilaian
// risk server-side, tidak pernah keluar lewat respons publik.
export function publicUser(u: User): Omit<User, "passwordHash" | "gender"> {
  const { passwordHash: _passwordHash, gender: _gender, ...rest } = u;
  return rest;
}
