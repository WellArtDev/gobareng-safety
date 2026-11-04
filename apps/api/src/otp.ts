// Logika OTP passwordless (Wella 1 Nov 2026 + 22:52).
// Alur: identifier (email ATAU nomor HP) -> kode 6 digit -> sesi.
// Berlaku untuk SEMUA peran (member, organizer, admin, command_center,
// staff) — tidak ada lagi login password.
//
// Aturan yang dikunci di sini (angka dari perintah Wella):
// - Kode 6 digit, disimpan HASHED sha256, kedaluwarsa 5 menit, sekali
//   pakai, maks 5 percobaan salah lalu kunci 15 menit, cooldown kirim
//   ulang 60 detik (per identifier+kanal), cap 10 kiriman/jam per
//   identifier. Kunci berlaku per identifier (semua kanal) supaya tidak
//   bisa di-bypass dengan pindah kanal.
// - Kanal mengikuti toggle Pengaturan (otpEmail/otpSms/otpWhatsapp).
//   Kanal nonaktif -> CHANNEL_DISABLED, TANPA fallback diam-diam ke
//   kanal lain (tambahan Wella: pilihan kanal di klien hanya menampilkan
//   kanal aktif, dan server menolak kanal yang baru saja dimatikan).
//   Pengecualian yang dirancang (Wella 3 Nov 2026, BUKAN diam-diam):
//   bila pengiriman SMS GAGAL di provider dan kanal WhatsApp aktif,
//   kode yang sama dikirim ulang lewat WhatsApp dan respons membawa
//   channelSent — klien menampilkan ke user kanal mana yang mengirim.
// - Identifier baru tidak langsung dibuatkan akun tanpa nama: verify
//   mengembalikan { needsName: true } tanpa menghabiskan kode; langkah
//   kedua (verify + name) memakai kode yang sama dan membuat akun.
//   Identifier nomor HP yang baru juga wajib email (kolom User.email
//   wajib + unik) -> needsEmail: true pada langkah pertama.
// - Dependensi (jam, generator kode, pengirim) di-inject supaya tes
//   bisa memakai jam palsu dan pengirim tangkapan tanpa backdoor di
//   kode produksi.
import { createHash, randomInt } from "node:crypto";
import { ApiError, badRequest, forbidden, unauthorized } from "./errors.js";
import { dispatchNotificationChannels } from "./notify-channels.js";
import { sendOtpCode, type OtpChannel } from "./otp-delivery.js";
import { slugify } from "./auth.js";
import { normalizeCountryCode } from "./country.js";
import type { Db, PlatformSettings } from "./db.js";
import type { User } from "./store.js";

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCK_MS = 15 * 60_000;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const OTP_HOURLY_CAP = 10;

export interface OtpDeps {
  now?: () => number;
  generateCode?: () => string;
  send?: typeof sendOtpCode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{9,15}$/;
const CODE_RE = /^\d{6}$/;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function normalizeIdentifier(raw: string): string {
  const v = raw.trim();
  if (EMAIL_RE.test(v)) return v.toLowerCase();
  const phone = v.replace(/[\s-]/g, "");
  if (PHONE_RE.test(phone)) return phone;
  return v;
}

export function isEmailIdentifier(identifier: string): boolean {
  return EMAIL_RE.test(identifier);
}

export function isPhoneIdentifier(identifier: string): boolean {
  return PHONE_RE.test(identifier);
}

function toggleKey(channel: OtpChannel): "otpEmail" | "otpSms" | "otpWhatsapp" {
  return channel === "email"
    ? "otpEmail"
    : channel === "sms"
      ? "otpSms"
      : "otpWhatsapp";
}

export async function requestOtp(
  db: Db,
  settings: PlatformSettings,
  input: { identifier: string; channel?: string },
  deps: OtpDeps = {},
): Promise<{
  channel: OtpChannel;
  channelSent: OtpChannel;
  expiresInSeconds: number;
}> {
  const now = deps.now ?? Date.now;
  const generateCode = deps.generateCode ?? (() =>
    String(randomInt(0, 1_000_000)).padStart(6, "0"));
  const send = deps.send ?? sendOtpCode;

  const identifier = normalizeIdentifier(input.identifier ?? "");
  if (!isEmailIdentifier(identifier) && !isPhoneIdentifier(identifier)) {
    throw badRequest("INVALID_PAYLOAD");
  }
  // Kanal: eksplisit dari klien, atau default dari jenis identifier
  // (email -> email, HP -> sms). Default TIDAK fallback ke WhatsApp:
  // bila sms nonaktif, request ditolak CHANNEL_DISABLED.
  let channel: OtpChannel;
  if (input.channel === undefined) {
    channel = isEmailIdentifier(identifier) ? "email" : "sms";
  } else if (
    input.channel === "email" ||
    input.channel === "sms" ||
    input.channel === "whatsapp"
  ) {
    channel = input.channel;
  } else {
    throw badRequest("INVALID_PAYLOAD");
  }
  if (channel === "email" && !isEmailIdentifier(identifier)) {
    throw badRequest("INVALID_PAYLOAD");
  }
  if (channel !== "email" && !isPhoneIdentifier(identifier)) {
    throw badRequest("INVALID_PAYLOAD");
  }
  if (!settings[toggleKey(channel)]) {
    throw badRequest("CHANNEL_DISABLED");
  }

  const nowMs = now();
  const rows = await db.otpCodesFor(identifier);
  if (rows.some((r) => r.lockedUntil && r.lockedUntil.getTime() > nowMs)) {
    throw new ApiError(429, "OTP_LOCKED");
  }
  const lastSent = await db.latestOtpSentAt(identifier, channel);
  if (lastSent && nowMs - lastSent.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new ApiError(429, "OTP_COOLDOWN");
  }
  const sentThisHour = await db.countOtpSentSince(
    identifier,
    new Date(nowMs - 60 * 60_000),
  );
  if (sentThisHour >= OTP_HOURLY_CAP) {
    throw new ApiError(429, "OTP_HOURLY_CAP");
  }

  const code = generateCode();
  const result = await send(channel, identifier, code, settings);
  // Fallback SMS -> WhatsApp (Wella 3 Nov 2026): HANYA bila pengiriman
  // SMS gagal di sisi provider (result.ok false), dan HANYA bila kanal
  // WhatsApp AKTIF di Pengaturan — kanal nonaktif tidak pernah dipakai
  // diam-diam. Kode yang dikirim lewat fallback adalah kode yang SAMA
  // (bukan kode baru), jadi tidak ada kirim ganda dan tidak ada kode
  // kedua yang membingungkan user. Bila SMS berhasil, WhatsApp tidak
  // pernah dipanggil. Bila fallback dicoba dan gagal juga, error yang
  // dilaporkan adalah error fallback (yang paling spesifik/terakhir).
  // Batas yang disengaja: "SMS terkirim menurut provider tapi tidak
  // sampai ke HP" TIDAK terdeteksi otomatis dan tidak dicakup — itu
  // butuh laporan user, bukan fallback. Satu permintaan tetap dihitung
  // satu kiriman (baris OtpCode dicatat dengan kanal yang DIMINTA,
  // sehingga cooldown 60 detik + cap 10/jam berlaku seperti biasa).
  let channelSent: OtpChannel = channel;
  let sendResult = result;
  if (!result.ok && channel === "sms" && settings.otpWhatsapp) {
    const wa = await send("whatsapp", identifier, code, settings);
    sendResult = wa;
    if (wa.ok) {
      channelSent = "whatsapp";
    }
  }
  if (!sendResult.ok) {
    throw new ApiError(
      sendResult.errorCode === "WHATSAPP_TEMPLATE_NO_VARIABLE" ? 400 : 503,
      sendResult.errorCode ?? "OTP_SEND_FAILED",
    );
  }
  await db.createOtpCode({
    identifier,
    channel,
    codeHash: hashCode(code),
    expiresAt: new Date(nowMs + OTP_TTL_MS),
  });
  return { channel, channelSent, expiresInSeconds: OTP_TTL_MS / 1000 };
}

export type VerifyResult =
  | { user: User }
  | { needsName: true; needsEmail: boolean };

export async function verifyOtp(
  db: Db,
  settings: PlatformSettings,
  input: {
    identifier: string;
    code: string;
    name?: string;
    email?: string;
    // Opsional langkah pembuatan akun (layar needsName): disimpan
    // hanya pada User baru, validasi sama seperti PATCH /auth/me —
    // telepon dinormalisasi (strip spasi/dash, tak valid -> null),
    // negara lewat normalizeCountryCode (tak valid -> null).
    phone?: string;
    country?: string;
  },
  deps: OtpDeps = {},
): Promise<VerifyResult> {
  const now = deps.now ?? Date.now;
  const identifier = normalizeIdentifier(input.identifier ?? "");
  if (
    (!isEmailIdentifier(identifier) && !isPhoneIdentifier(identifier)) ||
    typeof input.code !== "string" ||
    !CODE_RE.test(input.code)
  ) {
    throw badRequest("INVALID_PAYLOAD");
  }
  const nowMs = now();
  const rows = await db.otpCodesFor(identifier);
  if (rows.some((r) => r.lockedUntil && r.lockedUntil.getTime() > nowMs)) {
    throw new ApiError(429, "OTP_LOCKED");
  }
  // consumedAt disaring di level DB (otpCodesFor hanya baris belum
  // dipakai), tapi tolak juga di sini sebagai pertahanan berlapis bila
  // pemanggil memakai sumber baris lain: kode terpakai = replay.
  const match = rows.find((r) => r.codeHash === hashCode(input.code));
  if (!match || match.consumedAt) {
    // Kode salah (atau replay baris terpakai): hitung percobaan salah
    // pada baris terbaru yang belum kedaluwarsa; tanpa baris seperti
    // itu, tidak ada yang dihitung.
    const latest = rows.find((r) => r.expiresAt.getTime() > nowMs);
    if (latest) {
      const attempts = await db.bumpOtpAttempt(
        latest.id,
        latest.attempts + 1 >= OTP_MAX_ATTEMPTS
          ? new Date(nowMs + OTP_LOCK_MS)
          : null,
      );
      if (attempts >= OTP_MAX_ATTEMPTS) {
        throw new ApiError(429, "OTP_LOCKED");
      }
    }
    throw unauthorized("INVALID_OTP");
  }
  if (match.expiresAt.getTime() <= nowMs) {
    throw unauthorized("OTP_EXPIRED");
  }

  const user = isEmailIdentifier(identifier)
    ? await db.userByEmail(identifier)
    : await db.userByPhone(identifier);
  if (user) {
    if (user.suspendedAt) throw unauthorized("ACCOUNT_SUSPENDED");
    await db.markOtpConsumed(match.id);
    return { user };
  }

  // Identifier baru: butuh nama (dan email bila identifier-nya HP).
  // Kode TIDAK dihabiskan di langkah ini — langkah kedua memakai kode
  // yang sama. Ini disengaja: kalau kode dihabiskan di sini, user
  // harus minta kode baru hanya untuk mengisi nama.
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2) {
    return { needsName: true, needsEmail: isPhoneIdentifier(identifier) };
  }
  if (!settings.signupOpen) {
    throw forbidden("SIGNUP_CLOSED");
  }
  const isPhone = isPhoneIdentifier(identifier);
  let email = identifier;
  if (isPhone) {
    const em = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(em)) throw badRequest("INVALID_PAYLOAD");
    if (await db.emailTaken(em)) throw badRequest("EMAIL_TAKEN");
    email = em;
  }
  // Telepon langkah daftar: identifier HP sudah jadi telepon akun;
  // identifier email memakai field telepon opsional (tak valid -> null,
  // sama seperti PATCH /auth/me — tidak pernah menggagalkan daftar).
  const phoneNorm =
    typeof input.phone === "string" ? input.phone.replace(/[\s-]/g, "") : "";
  const created = await db.createUserWithPendingOrganizerVerification({
    email,
    name,
    slug: await db.uniqueSlug(slugify(name)),
    // Akun OTP tidak punya password sama sekali (kolom nullable
    // sejak PR ganti-email OTP): null, bukan hash acak — tidak ada
    // nilai apa pun yang bisa dicoba diverifikasi.
    passwordHash: null,
    phone: isPhone ? identifier : PHONE_RE.test(phoneNorm) ? phoneNorm : null,
    country: normalizeCountryCode(input.country),
    isAdmin: false,
    role: "user",
    isVerified: false,
    // Verifikasi akun dua kanal (terpisah dari isVerified): kanal
    // identifier terbukti saat itu juga lewat OTP login; kanal
    // pendamping masih null sampai dibuktikan (link email / kode WA).
    // Telepon opsional pendaftar email TIDAK ditandai: belum terbukti.
    emailVerifiedAt: isPhone ? null : new Date(nowMs),
    phoneVerifiedAt: isPhone ? new Date(nowMs) : null,
  });
  // Notifikasi pendaftaran yang sama seperti register lama (fail-soft).
  try {
    if (settings.notifVerify) {
      await db.notifyDashboard("VERIFICATION_REQUEST", {
        refId: created.id,
        actorName: created.name,
      });
    }
    const staff = await db.listStaff();
    void dispatchNotificationChannels(settings, "regist", {
      subject: "GoBareng: pendaftar baru",
      message: `Pendaftar baru: ${created.name} (${created.email}).`,
      emails: staff.map((s) => s.email),
      phones: staff.map((s) => s.phone).filter((p): p is string => Boolean(p)),
    });
  } catch (error) {
    console.error("[api] verification notification failed", error);
  }
  await db.markOtpConsumed(match.id);
  return { user: created };
}
