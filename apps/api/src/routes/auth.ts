// Auth routes — contract §1. New accounts are never admins;
// admin promotion happens outside registration (seed / direct DB change).
// A-1: backed by Prisma (src/db.ts).
import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { requireAuth, signToken, signTokenWithExpiry, slugify } from "../auth.js";
import { MAGIC_LINK_DEADLINE, redeemMagicLink } from "../magic-link.js";
import { publicUser } from "../db.js";
import { parseBankUpdate } from "../bank-details.js";
import { normalizeCountryCode } from "../country.js";
import { sendBrevoEmail, effectiveBrevoSenderEmail } from "../brevo.js";
import { sendSmtpEmail, smtpEmailConfigured } from "../smtp.js";
import {
  requestEmailChangeOtp,
  verifyEmailChangeOtp,
} from "../email-change.js";
import {
  avatarImageUrl,
  avatarUpload,
  deleteOldAvatar,
  deleteOldIdentityDocument,
  identityDocumentUpload,
  saveAvatarFile,
  saveIdentityDocumentFile,
} from "../uploads.js";
import type { Db } from "../db.js";
import { dispatchNotificationChannels } from "../notify-channels.js";
import { badRequest, conflict, forbidden, gone, notFound, unauthorized } from "../errors.js";
import { requestOtp, verifyOtp } from "../otp.js";
import { authRateLimit, clearAuthAttempts } from "../rate-limit.js";

// A-2: refresh token rotasi — opaque 256-bit, disimpan sebagai hash.
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function issueRefreshToken(db: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.createRefreshToken({
    userId,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return token;
}

function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function authRouter(db: Db): Router {
  const r = Router();

  // Password dimatikan (Wella 1 Nov 2026): register/login passwordless
  // lewat OTP. Endpoint lama dikembalikan 410 OTP_ONLY — bukan dihapus
  // (klien lama mendapat sinyal eksplisit) dan bukan dibiarkan jalan.
  // Hash password lama di DB sudah dibersihkan (kolom nullable +
  // UPDATE menol-kan semua hash, migrasi PR ganti-email OTP).
  r.post("/register", (_req, _res, next) => {
    next(gone("OTP_ONLY"));
  });

  r.post("/login", (_req, _res, next) => {
    next(gone("OTP_ONLY"));
  });

  // ---- OTP passwordless (Wella 1 Nov 2026) ----
  // GET /otp/channels: publik, hanya flag aktif/tidak per kanal dari
  // platform settings — tanpa secret apa pun. Mobile (belum login)
  // memakai ini untuk menampilkan hanya kanal yang aktif.
  r.get("/otp/channels", (_req, res, next) => {
    (async () => {
      const settings = await db.platformSettings();
      res.json({
        data: {
          email: settings.otpEmail,
          sms: settings.otpSms,
          whatsapp: settings.otpWhatsapp,
        },
      });
    })().catch(next);
  });

  r.post("/otp/request", authRateLimit, (req, res, next) => {
    (async () => {
      const settings = await db.platformSettings();
      const { identifier, channel } = req.body ?? {};
      res.json({
        data: await requestOtp(db, settings, { identifier, channel }),
      });
    })().catch(next);
  });

  r.post("/otp/verify", authRateLimit, (req, res, next) => {
    (async () => {
      const settings = await db.platformSettings();
      const { identifier, code, name, email, phone, country } = req.body ?? {};
      const result = await verifyOtp(db, settings, {
        identifier,
        code,
        name,
        email,
        phone,
        country,
      });
      if ("needsName" in result) {
        // Langkah 1 untuk identifier baru: kode valid, tapi akun belum
        // dibuat — klien meminta nama (dan email bila identifier-nya
        // nomor HP), lalu verify lagi dengan kode yang sama.
        res.json({
          data: { needsName: true, needsEmail: result.needsEmail },
        });
        return;
      }
      clearAuthAttempts(req);
      res.json({
        data: {
          user: publicUser(result.user),
          token: signToken(result.user),
          refreshToken: await issueRefreshToken(db, result.user.id),
        },
      });
    })().catch(next);
  });

  // ---- Magic link juri tanpa OTP (3 Nov 2026) ----
  // Satu tautan per akun juri, pakai-ulang sampai tenggat pengumuman
  // (10 Nov 2026 23:59 WIB), lalu mati total. Responsnya sama persis
  // dengan otp/verify supaya klien yang sama (apps + dashboard) bisa
  // memakai sesi ini tanpa jalur khusus. Rate limit yang sama dengan
  // OTP (per IP — body tidak membawa identifier, jadi kunci jatuh ke
  // IP saja); sukses membersihkan jejak seperti otp/verify.
  r.post("/magic-link", authRateLimit, (req, res, next) => {
    (async () => {
      const { token } = req.body ?? {};
      const result = await redeemMagicLink(db, token);
      clearAuthAttempts(req);
      res.json({ data: result });
    })().catch(next);
  });

  r.get("/me", requireAuth, (req, res, next) => {
    (async () => {
      const user = await db.userById(req.user!.id);
      if (!user) throw unauthorized();
      res.json({ data: { user: publicUser(user) } });
    })().catch(next);
  });

  // Rekening organizer (PR rekening-organizer): hanya pemilik sendiri.
  // Sengaja endpoint terpisah, bukan bagian GET /me — publicUser dipakai
  // daftar member trip dan tidak boleh membawa rekening.
  r.get("/me/bank-details", requireAuth, (req, res, next) => {
    (async () => {
      res.json({
        data: { bankDetails: await db.bankDetailsOf(req.user!.id) },
      });
    })().catch(next);
  });

  // Notifikasi alamat lama setelah ganti email (fail-soft, tidak
  // pernah menggagalkan ganti email): SMTP relay Brevo diutamakan,
  // fallback REST Brevo — infrastruktur yang sama dengan kanal email
  // notifikasi. Bila keduanya tidak terkonfigurasi, hanya log.
  async function notifyOldEmailAddress(
    oldEmail: string,
    newEmail: string,
  ): Promise<void> {
    try {
      const settings = await db.platformSettings();
      const senderEmail = effectiveBrevoSenderEmail(settings);
      const ok = smtpEmailConfigured(senderEmail)
        ? await sendSmtpEmail(
            oldEmail,
            "GoBareng: alamat email kamu berubah",
            `Alamat email akun GoBareng kamu diubah menjadi ${newEmail}. ` +
              `Kalau kamu tidak merasa mengubahnya, segera hubungi admin GoBareng.`,
            senderEmail,
          )
        : await sendBrevoEmail(
            oldEmail,
            "GoBareng: alamat email kamu berubah",
            `Alamat email akun GoBareng kamu diubah menjadi ${newEmail}. ` +
              `Kalau kamu tidak merasa mengubahnya, segera hubungi admin GoBareng.`,
            fetch,
            settings,
          );
      if (!ok) console.warn("[api] old-email notification skipped (email not configured)");
    } catch (error) {
      console.warn("[api] old-email notification failed", error);
    }
  }

  r.patch("/me", requireAuth, (req, res, next) => {
    (async () => {
      const current = await db.userById(req.user!.id);
      if (!current) throw unauthorized();
      const { name, phone, country, address, email, emailOtp } = req.body ?? {};
      // Rekening organizer (PR rekening-organizer): validasi dulu
      // sebelum tulis apa pun — bank invalid = 400 tanpa perubahan.
      const bankUpdate = parseBankUpdate(req.body ?? {});
      if (bankUpdate.kind === "invalid") throw badRequest("INVALID_PAYLOAD");
      const data: {
        name?: string;
        email?: string;
        phone?: string | null;
        country?: string | null;
        address?: string | null;
        emailVerifiedAt?: Date | null;
        phoneVerifiedAt?: Date | null;
        accountVerifiedAt?: Date | null;
      } = {};
      if (typeof name === "string") {
        if (name.trim().length < 2) throw badRequest("INVALID_PAYLOAD");
        data.name = name.trim();
      } else if (name !== undefined) {
        throw badRequest("INVALID_PAYLOAD");
      }
      if (phone === null) data.phone = null;
      else if (typeof phone === "string") {
        const norm = phone.replace(/[\s-]/g, "");
        if (!/^\+?\d{9,15}$/.test(norm)) throw badRequest("INVALID_PAYLOAD");
        data.phone = norm;
      } else if (phone !== undefined) {
        throw badRequest("INVALID_PAYLOAD");
      }
      // Alamat: string -> simpan hasil trim, kosong -> null (hapus).
      // Tipe bukan string diabaikan seperti field opsional lain.
      if (typeof address === "string") {
        const trimmed = address.trim();
        data.address = trimmed ? trimmed : null;
      }
      // Negara: kode valid -> set, null -> hapus, nilai lain -> 400.
      if (country === null) data.country = null;
      else if (typeof country === "string") {
        const code = normalizeCountryCode(country);
        if (!code) throw badRequest("INVALID_PAYLOAD");
        data.country = code;
      } else if (country !== undefined) {
        throw badRequest("INVALID_PAYLOAD");
      }
      // Ganti email berbasis OTP (menggantikan gate currentPassword
      // yang mustahil dipenuhi pengguna OTP-only): klien meminta kode
      // dulu lewat POST /me/email-change/request (kode dikirim ke
      // alamat BARU), lalu PATCH /me menyertakan emailOtp. Tanpa kode
      // yang valid untuk alamat baru ini, email tidak berubah — field
      // lain di body yang sama tetap diproses. Token sesi saat ini
      // tetap berlaku: JWT hanya membawa user id. Field
      // currentPassword lama diabaikan sepenuhnya (bukan dibaca,
      // bukan divalidasi): tidak ada lagi password yang bisa digate.
      if (email !== undefined) {
        if (typeof email !== "string") throw badRequest("INVALID_PAYLOAD");
        const normalized = email.trim().toLowerCase();
        if (!isEmail(normalized)) throw badRequest("INVALID_PAYLOAD");
        if (normalized !== current.email) {
          if (typeof emailOtp !== "string" || !emailOtp) {
            throw badRequest("EMAIL_OTP_REQUIRED");
          }
          await verifyEmailChangeOtp(db, current.id, normalized, emailOtp);
          // Periksa ulang setelah verifikasi (race antar request):
          // kode sudah dikonsumsi, jadi konflik di sini berarti klien
          // harus minta kode baru untuk alamat lain.
          if (await db.emailTaken(normalized)) throw conflict("EMAIL_TAKEN");
          data.email = normalized;
        }
      }
      // Verifikasi akun dua kanal (terpisah dari isVerified):
      // - HP berubah (termasuk dihapus) tanpa bukti baru -> kanal HP +
      //   akun tidak lagi terverifikasi; email tidak tersentuh.
      // - Email berubah SELALU lewat emailOtp yang sudah diverifikasi
      //   di atas -> email baru terbukti; akun terverifikasi hanya bila
      //   kanal HP masih terbukti (dan tidak ikut berubah di request ini).
      if (data.phone !== undefined && data.phone !== current.phone) {
        data.phoneVerifiedAt = null;
        data.accountVerifiedAt = null;
      }
      if (data.email !== undefined && data.email !== current.email) {
        data.emailVerifiedAt = new Date();
        data.accountVerifiedAt =
          data.phoneVerifiedAt === null
            ? null
            : current.phoneVerifiedAt
              ? new Date()
              : null;
      }
      const updated = await db.updateUser(current.id, data);
      if (data.email && !updated) throw conflict("EMAIL_TAKEN");
      const user = updated ?? current;
      // Rekening ditulis terpisah dari updateUser/mapUser supaya tidak
      // bocor ke publicUser (daftar member trip, GET /me).
      if (bankUpdate.kind === "set") {
        await db.updateBankDetails(current.id, bankUpdate.details);
      } else if (bankUpdate.kind === "clear") {
        await db.updateBankDetails(current.id, null);
      }
      if (data.email && data.email !== current.email) {
        void notifyOldEmailAddress(current.email, data.email);
      }
      res.json({ data: { user: publicUser(user) } });
    })().catch(next);
  });

  // Minta kode ganti-email: sesi terautentikasi + alamat baru. Kode
  // hanya dikirim ke alamat baru (bukti kepemilikan alamat tujuan),
  // tidak pernah ke alamat lama, dan tidak bisa dipakai login
  // (identifier ber-namespace, lihat email-change.ts).
  r.post(
    "/me/email-change/request",
    requireAuth,
    authRateLimit,
    (req, res, next) => {
    (async () => {
      const current = await db.userById(req.user!.id);
      if (!current) throw unauthorized();
      const settings = await db.platformSettings();
      const { email } = req.body ?? {};
      res.json({
        data: await requestEmailChangeOtp(db, settings, current.id, email),
      });
    })().catch(next);
  });

  // Pengajuan organizer milik sendiri ("Lihat Data" di app): baris
  // terbaru pendaftar, apa pun statusnya. Verifikasi tetap MANUAL —
  // endpoint ini hanya mengisi data, tidak pernah mengubah isVerified.
  r.get(
    "/me/organizer-application",
    requireAuth,
    (req, res, next) => {
    (async () => {
      res.json({
        data: { application: await db.myOrganizerApplication(req.user!.id) },
      });
    })().catch(next);
  });

  // Kirim/ubah pengajuan organizer: nama organizer + alamat (wajib),
  // jenis + wilayah (opsional), foto KTP (opsional, field
  // "identityDocument"). KTP disimpan privat, bukan /uploads publik.
  // Mengisi baris PENDING yang sudah dibuat saat registrasi; bila
  // pendaftar sudah terverifikasi, ini membuat baris PENDING baru
  // untuk ditinjau admin (kontrak §14: antrean = baris PENDING).
  r.post(
    "/me/organizer-application",
    requireAuth,
    authRateLimit,
    (req, res, next) => {
    identityDocumentUpload.single("identityDocument")(req, res, (err) => {
      if (err) return next(badRequest("INVALID_IMAGE"));
      (async () => {
        const file = (
          req as typeof req & {
            file?: { buffer: Uint8Array; mimetype: string };
          }
        ).file;
        const body = (req.body ?? {}) as Record<string, unknown>;
        const organizerName =
          typeof body.organizerName === "string" ? body.organizerName.trim() : "";
        const address = typeof body.address === "string" ? body.address.trim() : "";
        if (organizerName.length < 2 || address.length < 2) {
          throw badRequest("INVALID_PAYLOAD");
        }
        const rawType = typeof body.organizerType === "string" ? body.organizerType : "";
        const organizerType =
          rawType === "" ? null : rawType === "HIKING" || rawType === "TOURING" ? rawType : null;
        if (rawType !== "" && organizerType === null) {
          throw badRequest("INVALID_PAYLOAD");
        }
        const region = typeof body.region === "string" && body.region.trim() ? body.region.trim() : null;

        const previous = await db.organizerVerificationRecord(req.user!.id);
        const saved = file ? saveIdentityDocumentFile(req.user!.id, file) : null;
        const input: Parameters<Db["createPendingOrganizerVerification"]>[1] = {
          organizerName,
          address,
          organizerType,
          region,
          identityDocumentComplete:
            saved !== null || previous?.identityDocumentFilename != null,
          profileComplete: true,
          submittedAt: new Date(),
        };
        if (saved) input.identityDocumentFilename = saved.filename;
        try {
          await db.createPendingOrganizerVerification(req.user!.id, input);
        } catch (error) {
          if (saved) deleteOldIdentityDocument(saved.filename);
          throw error;
        }
        if (
          saved &&
          previous?.identityDocumentFilename &&
          previous.identityDocumentFilename !== saved.filename
        ) {
          deleteOldIdentityDocument(previous.identityDocumentFilename);
        }
        // Pengajuan pertama yang lengkap = notif SET-2 ke dashboard
        // (fail-soft, sama seperti saat registrasi).
        try {
          const settings = await db.platformSettings();
          if (!previous?.organizerName && settings.notifVerify) {
            await db.notifyDashboard("VERIFICATION_REQUEST", {
              refId: req.user!.id,
              actorName: (await db.userById(req.user!.id))?.name ?? null,
            });
            const staff = await db.listStaff();
            const applicant = await db.userById(req.user!.id);
            void dispatchNotificationChannels(settings, "verify", {
              subject: "GoBareng: pengajuan verifikasi organizer baru",
              message: `Pengajuan verifikasi organizer baru dari ${applicant?.name ?? "member"}.`,
              emails: staff.map((s) => s.email),
              phones: staff.map((s) => s.phone).filter((p): p is string => Boolean(p)),
            });
          }
        } catch (error) {
          console.error("[api] verification notification failed", error);
        }
        res.json({
          data: { application: await db.myOrganizerApplication(req.user!.id) },
        });
      })().catch(next);
    });
  });

  // Ubah password dimatikan bersama login password (Wella 1 Nov 2026):
  // tidak ada lagi password untuk diubah. PATCH /me (nama/telepon/
  // negara/email) tetap jalan; ganti email kini memakai alur OTP
  // (POST /me/email-change/request + emailOtp di PATCH /me), jadi
  // pengguna OTP-only bisa ganti email tanpa currentPassword.
  r.patch("/me/password", requireAuth, (_req, _res, next) => {
    next(gone("OTP_ONLY"));
  });

  // Foto profil (Wella 1 Nov 2026): publik di /uploads/avatars/*,
  // bukan privat seperti KTP. Ganti = hapus file lama milik user ini.
  r.post("/me/avatar", requireAuth, authRateLimit, (req, res, next) => {
    avatarUpload.single("avatar")(req, res, (err) => {
      if (err) return next(badRequest("INVALID_IMAGE"));
      (async () => {
        const file = (
          req as typeof req & {
            file?: { buffer: Uint8Array; mimetype: string };
          }
        ).file;
        if (!file) throw badRequest("INVALID_IMAGE");
        const current = await db.userById(req.user!.id);
        if (!current) throw unauthorized();
        const saved = saveAvatarFile(req.user!.id, file);
        const url = avatarImageUrl(req, saved.filename);
        try {
          const user =
            (await db.updateUser(current.id, { avatarUrl: url })) ?? current;
          deleteOldAvatar(current.avatarUrl);
          res.json({ data: { user: publicUser(user) } });
        } catch (error) {
          deleteOldAvatar(url);
          throw error;
        }
      })().catch(next);
    });
  });

  r.delete("/me/avatar", requireAuth, (req, res, next) => {
    (async () => {
      const current = await db.userById(req.user!.id);
      if (!current) throw unauthorized();
      const user =
        (await db.updateUser(current.id, { avatarUrl: null })) ?? current;
      deleteOldAvatar(current.avatarUrl);
      res.json({ data: { user: publicUser(user) } });
    })().catch(next);
  });

  r.get("/check-slug", authRateLimit, (req, res, next) => {
    (async () => {
      const raw = typeof req.query.slug === "string" ? req.query.slug : "";
      const slug = slugify(raw).slice(0, 40);
      const available = slug.length > 0 && !(await db.slugTaken(slug));
      res.json({ data: { slug, available } });
    })().catch(next);
  });

  // ---- A-2: refresh rotation + logout ----
  r.post("/refresh", authRateLimit, (req, res, next) => {
    (async () => {
      const { refreshToken } = req.body ?? {};
      if (typeof refreshToken !== "string" || !refreshToken) {
        throw unauthorized("INVALID_REFRESH_TOKEN");
      }
      const row = await db.refreshTokenByHash(hashRefreshToken(refreshToken));
      if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
        throw unauthorized("INVALID_REFRESH_TOKEN");
      }
      const user = await db.userById(row.userId);
      if (!user || user.suspendedAt) throw unauthorized("INVALID_REFRESH_TOKEN");
      // Rotasi: token lama revoked, token baru diterbitkan.
      // Pengecualian tenggat: sesi akun pemegang magic link (juri)
      // TIDAK boleh diperpanjang melewati pengumuman — refresh hasil
      // rotasi ikut dibatasi tenggat, dan access JWT-nya dipangkas ke
      // sisa waktu tenggat bila kurang dari 15 menit. Tanpa ini, rantai
      // refresh 30 hari akan menghidupkan sesi juri melewati tenggat.
      const isMagicHolder = await db.userHasMagicLinkTokens(user.id);
      const nextToken = randomBytes(32).toString("hex");
      await db.rotateRefreshToken(row.id, {
        userId: user.id,
        tokenHash: hashRefreshToken(nextToken),
        expiresAt: isMagicHolder
          ? MAGIC_LINK_DEADLINE
          : new Date(Date.now() + REFRESH_TTL_MS),
      });
      res.json({
        data: {
          user: publicUser(user),
          token: isMagicHolder
            ? signTokenWithExpiry(
                user,
                Math.min(
                  900,
                  Math.floor(
                    (MAGIC_LINK_DEADLINE.getTime() - Date.now()) / 1000,
                  ),
                ),
              )
            : signToken(user),
          refreshToken: nextToken,
        },
      });
    })().catch(next);
  });

  r.post("/logout", (req, res, next) => {
    (async () => {
      const { refreshToken } = req.body ?? {};
      if (typeof refreshToken === "string" && refreshToken) {
        const row = await db.refreshTokenByHash(hashRefreshToken(refreshToken));
        if (row && !row.revokedAt) await db.revokeRefreshToken(row.id);
      }
      // Logout selalu sukses — tidak membocorkan keberadaan token.
      res.json({ data: { loggedOut: true } });
    })().catch(next);
  });

  // ---- Emergency contacts (A-4) ----
  // WA SOS recipients alongside the leader's phone and bystanders.
  // Same phone validation as register; numbers are normalized.
  const PHONE_RE = /^\+?\d{9,15}$/;

  r.get("/me/emergency-contacts", requireAuth, (req, res, next) => {
    (async () => {
      res.json({ data: { contacts: await db.emergencyContactsOf(req.user!.id) } });
    })().catch(next);
  });

  r.post("/me/emergency-contacts", requireAuth, (req, res, next) => {
    (async () => {
      const { name, phone } = req.body ?? {};
      const phoneNorm =
        typeof phone === "string" ? phone.replace(/[\s-]/g, "") : "";
      if (
        typeof name !== "string" ||
        name.trim().length < 2 ||
        !PHONE_RE.test(phoneNorm)
      ) {
        throw badRequest("INVALID_PAYLOAD");
      }
      const contact = await db.createEmergencyContact({
        userId: req.user!.id,
        name: name.trim(),
        phone: phoneNorm,
      });
      res.status(201).json({ data: { contact } });
    })().catch(next);
  });

  r.delete("/me/emergency-contacts/:id", requireAuth, (req, res, next) => {
    (async () => {
      const ok = await db.deleteEmergencyContact(
        req.user!.id,
        String(req.params.id),
      );
      if (!ok) throw notFound("CONTACT_NOT_FOUND");
      res.json({ data: { deleted: true } });
    })().catch(next);
  });

  // ---- PAY: upgrade GoBareng Pro ----
  // Mockup upgrade: bayar QRIS Rp150.000 sekali -> 'Saya sudah bayar'
  // membuat pengajuan PENDING -> admin verifikasi manual -> Pro aktif.
  const PRO_PRICE = 150000;

  r.get("/me/upgrade", requireAuth, (req, res, next) => {
    (async () => {
      const [isPro, request, settings] = await Promise.all([
        db.isPro(req.user!.id),
        db.latestUpgradeOf(req.user!.id),
        db.platformSettings(),
      ]);
      // QRIS aktif dari dashboard ("" = belum diunggah; mobile pakai
      // placeholder bila kosong). Harga + verifikasi admin tidak berubah.
      res.json({
        data: { isPro, price: PRO_PRICE, request, proQrisUrl: settings.proQrisUrl },
      });
    })().catch(next);
  });

  r.post("/me/upgrade", requireAuth, (req, res, next) => {
    (async () => {
      if (await db.isPro(req.user!.id)) throw conflict("ALREADY_PRO");
      if (await db.pendingUpgradeOf(req.user!.id)) {
        throw conflict("UPGRADE_ALREADY_PENDING");
      }
      const request = await db.createUpgradeRequest(req.user!.id, PRO_PRICE);
      res.status(201).json({ data: { request } });
    })().catch(next);
  });

  return r;
}
