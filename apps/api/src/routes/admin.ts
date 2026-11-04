// Admin routes — contract §14 (M3 dashboard input) + §14b staff (RBAC)
// + organizer verification (file-10 Verifikasi page).
// ADMIN-only, enforced server-side from the DB role (auth.ts
// requireRole): a JWT role claim is never trusted on its own, and
// pre-RBAC tokens (no role claim) still authorize via the DB.
// Admin accounts are seeded outside registration (see README).
import { createReadStream, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { Router } from "express";
import { param, requireAuth, requireRole, slugify } from "../auth.js";
import { publicUser } from "../db.js";
import { normalizeCountryCode } from "../country.js";
import {
  avatarImageUrl,
  avatarUpload,
  deleteOldAvatar,
  deleteOldQrisImage,
  identityDocumentsDir,
  qrisImageUpload,
  qrisImageUrl,
  saveAvatarFile,
  saveQrisImageFile,
} from "../uploads.js";
import type { Db, PlatformSettings } from "../db.js";
import type { User } from "../store.js";
import { brevoConfigured, brevoWhatsappConfigured } from "../brevo.js";
import { smtpEmailConfigured } from "../smtp.js";
import { badRequest, conflict, forbidden, gone, notFound } from "../errors.js";

export function adminRouter(db: Db): Router {
  const r = Router();

  // SET-4/5/6: platform settings. GET terdaftar SEBELUM guard admin-only
  // karena command_center ikut membaca (filter pin peta Ringkasan);
  // PATCH tetap admin-only lewat guard router di bawah.
  r.get(
    "/settings",
    requireAuth,
    requireRole(db, "admin", "command_center"),
    (_req, res, next) => {
      (async () => {
        const settings = await db.platformSettings();
        res.json({
          data: {
            settings,
            // Hanya status konfigurasi (bukan kunci) — kunci Brevo
            // tidak pernah keluar lewat API.
            brevo: {
              configured: brevoConfigured() || smtpEmailConfigured(),
              emailViaSmtp: smtpEmailConfigured(),
              whatsappConfigured: brevoWhatsappConfigured(settings),
            },
          },
        });
      })().catch(next);
    },
  );

  r.use(requireAuth, requireRole(db, "admin"));

  r.patch("/settings", (req, res, next) => {
    (async () => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Partial<PlatformSettings> = {};
      for (const key of [
        "signupOpen",
        "publicMapTrips",
        "maintenanceMode",
        "notifVerify",
        "notifCheckin",
        "notifRegistEmail",
        "notifRegistWhatsapp",
        "notifRegistSms",
        "notifSosEmail",
        "notifSosWhatsapp",
        "notifSosSms",
        "notifVerifyEmail",
        "notifVerifyWhatsapp",
        "notifVerifySms",
        "notifCheckinEmail",
        "notifCheckinWhatsapp",
        "notifCheckinSms",
        "otpEmail",
        "otpSms",
        "otpWhatsapp",
        // Modul AI (Wella 2 Nov 2026): kill-switch per modul.
        "aiV",
        "aiP",
        "aiL",
        "aiQ",
        "aiR",
        "aiG",
      ] as const) {
        const v = body[key];
        if (v === undefined) continue;
        if (typeof v !== "boolean") throw badRequest("INVALID_PAYLOAD");
        patch[key] = v;
      }
      // Setting angka Keamanan & Batas: integer >= 2 (validasi kuota
      // SET-8). Bukan string, bukan pecahan.
      if (body.defaultQuota !== undefined) {
        const v = body.defaultQuota;
        if (typeof v !== "number" || !Number.isInteger(v) || v < 2) {
          throw badRequest("INVALID_PAYLOAD");
        }
        patch.defaultQuota = v;
      }
      // Mata uang & zona waktu: opsi tetap, tanpa konversi kurs.
      // currency hanya IDR dulu; timezone WIB/WITA/WIT.
      if (body.currency !== undefined) {
        if (body.currency !== "IDR") throw badRequest("INVALID_PAYLOAD");
        patch.currency = body.currency;
      }
      if (body.timezone !== undefined) {
        if (
          body.timezone !== "WIB" &&
          body.timezone !== "WITA" &&
          body.timezone !== "WIT"
        ) {
          throw badRequest("INVALID_PAYLOAD");
        }
        patch.timezone = body.timezone;
      }
      // Penyedia WhatsApp (Wella 3 Nov 2026): hanya dua nilai yang
      // dikenal — "official" (Meta Cloud API, default) atau
      // "dikontak" (Dikontak WABA Shared). Nilai lain ditolak tanpa
      // mengubah apa pun; default "official" hidup di
      // PLATFORM_SETTING_DEFAULTS, bukan di sini.
      if (body.whatsappProvider !== undefined) {
        if (
          body.whatsappProvider !== "official" &&
          body.whatsappProvider !== "dikontak"
        ) {
          throw badRequest("INVALID_PAYLOAD");
        }
        patch.whatsappProvider = body.whatsappProvider;
      }
      // proQrisUrl sengaja TIDAK diterima di sini: hanya endpoint
      // upload/hapus QRIS di bawah yang boleh mengisinya.
      // Setting teks Brevo (bukan rahasia): validasi bentuknya, lalu
      // simpan ter-trim. Kosong = hapus override, kembali ke env VPS.
      for (const key of [
        "brevoSenderEmail",
        "brevoSmsSender",
        "brevoWhatsappSenderNumber",
        "brevoWhatsappTemplateId",
        "otpWhatsappTemplate",
      ] as const) {
        const v = body[key];
        if (v === undefined) continue;
        if (typeof v !== "string" || v.length > 254) throw badRequest("INVALID_PAYLOAD");
        const trimmed = v.trim();
        if (key === "brevoSenderEmail" && trimmed && !/^\S+@\S+\.\S+$/.test(trimmed)) {
          throw badRequest("INVALID_PAYLOAD");
        }
        if (key === "brevoWhatsappSenderNumber" && trimmed && !/^[0-9]{8,15}$/.test(trimmed)) {
          throw badRequest("INVALID_PAYLOAD");
        }
        if (key === "brevoWhatsappTemplateId" && trimmed && !/^[0-9]+$/.test(trimmed)) {
          throw badRequest("INVALID_PAYLOAD");
        }
        // Nama template Meta: huruf kecil, angka, underscore saja
        // (aturan penamaan template WhatsApp). Kosong = belum diatur.
        if (key === "otpWhatsappTemplate" && trimmed && !/^[a-z0-9_]+$/.test(trimmed)) {
          throw badRequest("INVALID_PAYLOAD");
        }
        patch[key] = trimmed;
      }
      // Pengaman lockout OTP (Wella 1 Nov 2026): admin sendiri login
      // pakai OTP, jadi mematikan SEMUA kanal sekaligus mengunci semua
      // orang termasuk admin. Hitung flag efektif (setting lama +
      // patch ini) SEBELUM menyimpan; bila ketiganya false, tolak
      // tanpa mengubah apa pun.
      {
        const current = await db.platformSettings();
        const effEmail = patch.otpEmail ?? current.otpEmail;
        const effSms = patch.otpSms ?? current.otpSms;
        const effWa = patch.otpWhatsapp ?? current.otpWhatsapp;
        if (!effEmail && !effSms && !effWa) {
          throw badRequest("OTP_ALL_CHANNELS_DISABLED");
        }
      }
      // Sama seperti GET: sertakan status Brevo supaya dashboard bisa
      // menampilkan status konfigurasi langsung setelah simpan, tanpa
      // GET tambahan. Kunci tidak pernah keluar lewat API.
      const settings = await db.updatePlatformSettings(patch);
      res.json({
        data: {
          settings,
          brevo: {
            configured: brevoConfigured() || smtpEmailConfigured(),
            emailViaSmtp: smtpEmailConfigured(),
            whatsappConfigured: brevoWhatsappConfigured(settings),
          },
        },
      });
    })().catch(next);
  });

  // ---- Pro Payment: gambar QRIS (Wella 1 Nov 2026) ----
  // Admin-only (guard router di atas). Upload baru menggantikan yang
  // lama (file lama dihapus); hapus mengosongkan setting. Harga Pro
  // dan logika verifikasi admin tidak berubah di sini.
  r.post("/pro-qris", (req, res, next) => {
    qrisImageUpload.single("qrisImage")(req, res, (err) => {
      if (err) return next(badRequest("INVALID_IMAGE"));
      (async () => {
        const file = (
          req as typeof req & {
            file?: { buffer: Uint8Array; mimetype: string };
          }
        ).file;
        if (!file) throw badRequest("INVALID_IMAGE");
        const saved = saveQrisImageFile(file);
        const url = qrisImageUrl(req, saved.filename);
        try {
          const previous = await db.platformSettings();
          const settings = await db.updatePlatformSettings({ proQrisUrl: url });
          deleteOldQrisImage(
            previous.proQrisUrl && previous.proQrisUrl !== url
              ? previous.proQrisUrl
              : null,
          );
          res.json({ data: { settings } });
        } catch (error) {
          deleteOldQrisImage(url);
          throw error;
        }
      })().catch(next);
    });
  });

  r.delete("/pro-qris", (req, res, next) => {
    (async () => {
      const previous = await db.platformSettings();
      const settings = await db.updatePlatformSettings({ proQrisUrl: "" });
      deleteOldQrisImage(previous.proQrisUrl);
      res.json({ data: { settings } });
    })().catch(next);
  });

  // ---- Staff accounts (RBAC) ----
  // GET /staff: every dashboard-role account (admin + command_center).
  r.get("/staff", (_req, res, next) => {
    (async () => {
      const staff = (await db.listStaff()).map(publicUser);
      res.json({ data: { staff } });
    })().catch(next);
  });

  // POST /staff: create a staff account. Role admin|command_center,
  // response carries NO token — creating an account never logs the
  // creating admin in as the new account. Sejak OTP passwordless
  // (Wella 1 Nov 2026) password TIDAK lagi diminta: akun staff login
  // lewat OTP ke email-nya. Field password lama diabaikan bila dikirim
  // (demi kompatibilitas klien lama), dan hash yang tersimpan adalah
  // penanda acak yang tidak bisa dipakai login — bukan password user.
  r.post("/staff", (req, res, next) => {
    (async () => {
      const { email, name, role } = req.body ?? {};
      const emailOk =
        typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailOk || typeof name !== "string" || name.trim().length < 2) {
        throw badRequest("INVALID_PAYLOAD");
      }
      if (role !== "admin" && role !== "command_center") {
        throw badRequest("INVALID_ROLE");
      }
      if (await db.emailTaken(email)) throw badRequest("EMAIL_TAKEN");
      const user = await db.createUser({
        email,
        name: name.trim(),
        slug: await db.uniqueSlug(slugify(name)),
        passwordHash: null,
        phone: null,
        isAdmin: role === "admin",
        role,
        isVerified: true,
      });
      res.status(201).json({ data: { user: publicUser(user) } });
    })().catch(next);
  });

  // ---- Edit profil akun dashboard (popup Edit Profile staff) ----
  // Validasi + simpan dipisah dari gate peran: helper ini sengaja
  // TIDAK mengasumsikan target harus staff, supaya tahap berikutnya
  // (edit profil member, pola yang sama) bisa memakai ulang helper
  // yang sama dengan gate perannya sendiri. Gate staff ada di route
  // di bawah (staffTarget), bukan di helper.
  const staffTarget = async (id: string) => {
    const u = await db.userById(id);
    if (!u) return null;
    return u.role === "admin" || u.role === "command_center" ? u : null;
  };

  function profilePatch(body: Record<string, unknown>): {
    name?: string;
    email?: string;
  } {
    const patch: { name?: string; email?: string } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length < 2) {
        throw badRequest("INVALID_PAYLOAD");
      }
      patch.name = body.name.trim();
    }
    if (body.email !== undefined) {
      if (typeof body.email !== "string") throw badRequest("INVALID_PAYLOAD");
      const normalized = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        throw badRequest("INVALID_PAYLOAD");
      }
      patch.email = normalized;
    }
    if (Object.keys(patch).length === 0) throw badRequest("INVALID_PAYLOAD");
    return patch;
  }

  async function saveProfilePatch(
    target: User,
    patch: { name?: string; email?: string },
  ) {
    if (
      patch.email !== undefined &&
      patch.email !== target.email &&
      (await db.emailTaken(patch.email))
    ) {
      throw conflict("EMAIL_TAKEN");
    }
    // Verifikasi akun dua kanal: email diubah admin tanpa bukti OTP
    // user -> email + akun tidak lagi terverifikasi (isVerified jalur
    // organizer tidak tersentuh).
    const emailChanged =
      patch.email !== undefined && patch.email !== target.email;
    return (
      (await db.updateUser(target.id, {
        ...patch,
        ...(emailChanged
          ? { emailVerifiedAt: null, accountVerifiedAt: null }
          : {}),
      })) ?? target
    );
  }

  // PATCH /staff/:id: nama/email saja — peran TIDAK bisa diubah lewat
  // sini (field role di body diabaikan). Tanpa currentPassword: yang
  // bertindak adalah admin, sama polanya seperti reset password member.
  r.patch("/staff/:id", (req, res, next) => {
    (async () => {
      const target = await staffTarget(param(req, "id"));
      if (!target) throw notFound();
      const patch = profilePatch((req.body ?? {}) as Record<string, unknown>);
      const user = await saveProfilePatch(target, patch);
      res.json({ data: { user: publicUser(user) } });
    })().catch(next);
  });

  // POST /staff/:id/avatar: pola sama seperti POST /me/avatar, tapi
  // target diperiksa SEBELUM multer berjalan supaya file tidak yatim
  // bila target bukan staff.
  r.post("/staff/:id/avatar", (req, res, next) => {
    (async () => {
      const target = await staffTarget(param(req, "id"));
      if (!target) throw notFound();
      avatarUpload.single("avatar")(req, res, (err) => {
        if (err) return next(badRequest("INVALID_IMAGE"));
        (async () => {
          const file = (
            req as typeof req & {
              file?: { buffer: Uint8Array; mimetype: string };
            }
          ).file;
          if (!file) throw badRequest("INVALID_IMAGE");
          const saved = saveAvatarFile(target.id, file);
          const url = avatarImageUrl(req, saved.filename);
          try {
            const updated =
              (await db.updateUser(target.id, { avatarUrl: url })) ?? target;
            deleteOldAvatar(target.avatarUrl);
            res.json({ data: { user: publicUser(updated) } });
          } catch (error) {
            deleteOldAvatar(url);
            throw error;
          }
        })().catch(next);
      });
    })().catch(next);
  });

  r.delete("/staff/:id/avatar", (req, res, next) => {
    (async () => {
      const target = await staffTarget(param(req, "id"));
      if (!target) throw notFound();
      const user =
        (await db.updateUser(target.id, { avatarUrl: null })) ?? target;
      deleteOldAvatar(target.avatarUrl);
      res.json({ data: { user: publicUser(user) } });
    })().catch(next);
  });

  r.get("/members", (_req, res, next) => {
    (async () => {
      const [members, proUserIds] = await Promise.all([
        db.listUsers(),
        db.listProUserIds(),
      ]);
      res.json({
        data: { members: members.map(publicUser), proUserIds },
      });
    })().catch(next);
  });

  // ---- Edit profil member (dashboard, popup edit profil member) ----
  // Pelengkap PR #126: endpoint yang ditunggu UI-nya. Pola sama persis
  // seperti PATCH /staff/:id — helper profilePatch/saveProfilePatch
  // dipakai ulang, gate-nya memberTarget (role "user") bukan
  // staffTarget. Admin-only lewat guard router di atas
  // (command_center -> 403). Nama/email saja: password TIDAK pernah
  // diubah admin (login sudah OTP-only) dan peran TIDAK bisa diubah
  // (field role/password di body diabaikan).
  const memberTarget = async (id: string) => {
    const u = await db.userById(id);
    if (!u) return null;
    return u.role === "user" ? u : null;
  };

  r.patch("/members/:id", (req, res, next) => {
    (async () => {
      const target = await memberTarget(param(req, "id"));
      if (!target) throw notFound();
      const patch = profilePatch((req.body ?? {}) as Record<string, unknown>);
      const user = await saveProfilePatch(target, patch);
      res.json({ data: { user: publicUser(user) } });
    })().catch(next);
  });

  // ---- Organizer verification (file-10 Verifikasi page) ----
  // Pending = regular accounts that are not verified and not rejected.
  // There is no separate "organizer application" entity: verification
  // operates on user accounts, per contract §14.
  r.get("/verifications", (_req, res, next) => {
    (async () => {
      const pending = await db.listPendingVerifications();
      res.json({ data: { pending } });
    })().catch(next);
  });

  // Lihat KTP pengajuan (admin-only, bertoken — BUKAN url publik):
  // stream file privat dari identityDocumentsDir. Nama file tidak
  // pernah muncul di respons JSON mana pun.
  r.get("/verifications/:id/document", (req, res, next) => {
    (async () => {
      const record = await db.verificationDocumentRecord(param(req, "id"));
      if (!record?.identityDocumentFilename) throw notFound();
      const file = join(identityDocumentsDir, basename(record.identityDocumentFilename));
      if (!existsSync(file)) throw notFound();
      const ext = basename(file).split(".").pop()?.toLowerCase();
      const contentType =
        ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : ext === "gif"
              ? "image/gif"
              : "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", "inline");
      createReadStream(file).pipe(res);
    })().catch(next);
  });

  r.patch("/members/:id/verify", (req, res, next) => {
    (async () => {
      const reviewed = await db.reviewOrganizerVerification(
        param(req, "id"),
        req.user!.id,
        "APPROVED",
      );
      if (!reviewed) throw notFound();
      res.json({ data: { user: publicUser(reviewed.user), application: reviewed.application } });
    })().catch(next);
  });

  // Reject a pending verification: the account stays usable but drops
  // off the pending list; a later verify clears the rejection.
  r.patch("/members/:id/reject-verification", (req, res, next) => {
    (async () => {
      const reviewed = await db.reviewOrganizerVerification(
        param(req, "id"),
        req.user!.id,
        "REJECTED",
        typeof req.body?.note === "string" ? req.body.note : undefined,
      );
      if (!reviewed) throw notFound();
      res.json({ data: { user: publicUser(reviewed.user), application: reviewed.application } });
    })().catch(next);
  });

  r.patch("/members/:id/suspend", (req, res, next) => {
    (async () => {
      const user = await db.updateUser(param(req, "id"), { suspendedAt: new Date() });
      if (!user) throw notFound("USER_NOT_FOUND");
      res.json({ data: { user: publicUser(user) } });
    })().catch(next);
  });

  r.patch("/members/:id/unsuspend", (req, res, next) => {
    (async () => {
      const user = await db.updateUser(param(req, "id"), { suspendedAt: null });
      if (!user) throw notFound("USER_NOT_FOUND");
      res.json({ data: { user: publicUser(user) } });
    })().catch(next);
  });

  // SOS umum yang dilaporkan palsu/iseng oleh penerima — urut laporan
  // terbanyak. Tindak lanjut admin: flag SOS ini (sudah ditinjau) dan
  // suspend pengirim bila terbukti (PATCH /members/:id/suspend).
  r.get("/general-sos-reports", (req, res, next) => {
    (async () => {
      const items = await db.reportedGeneralSosList();
      res.json({ data: { items } });
    })().catch(next);
  });

  r.patch("/general-sos/:id/flag", (req, res, next) => {
    (async () => {
      const sos = await db.setGeneralSosFlagged(param(req, "id"), true);
      if (!sos) throw notFound("SOS_NOT_FOUND");
      res.json({ data: { sos } });
    })().catch(next);
  });

  r.patch("/general-sos/:id/unflag", (req, res, next) => {
    (async () => {
      const sos = await db.setGeneralSosFlagged(param(req, "id"), false);
      if (!sos) throw notFound("SOS_NOT_FOUND");
      res.json({ data: { sos } });
    })().catch(next);
  });

  // Reset password member dimatikan bersama login password (Wella
  // 1 Nov 2026): password yang di-set admin tidak akan pernah bisa
  // dipakai login (login password sudah 410), jadi form ini hanya
  // berpura-pura memberi kredensial. Endpoint dikembalikan 410
  // OTP_ONLY; UI-nya dihapus dari dashboard di PR yang sama.
  r.patch("/members/:id/password", (_req, _res, next) => {
    next(gone("OTP_ONLY"));
  });

  r.patch("/members/:id/country", (req, res, next) => {
    (async () => {
      const body = req.body ?? {};
      if (!("country" in body)) throw badRequest("INVALID_COUNTRY");
      const raw = body.country;
      const country =
        raw === null ? null : normalizeCountryCode(raw);
      if (raw !== null && country === null) {
        throw badRequest("INVALID_COUNTRY");
      }
      const user = await db.updateUser(param(req, "id"), { country });
      if (!user) throw notFound("USER_NOT_FOUND");
      res.json({ data: { user: publicUser(user) } });
    })().catch(next);
  });

  // Member table: admin deletes a member. All User relations are
  // onDelete Cascade/SetNull and Trip.leaderId is a plain string, so
  // the delete cascades cleanly. Guards: never self, never an admin.
  r.delete("/members/:id", (req, res, next) => {
    (async () => {
      const id = param(req, "id");
      if (id === req.user!.id) throw forbidden("CANNOT_DELETE_SELF");
      const target = await db.userById(id);
      if (!target) throw notFound("USER_NOT_FOUND");
      if (target.isAdmin || target.role === "admin") {
        throw forbidden("CANNOT_DELETE_ADMIN");
      }
      const ok = await db.deleteUser(id);
      if (!ok) throw notFound("USER_NOT_FOUND");
      res.json({ data: { deleted: true } });
    })().catch(next);
  });

  r.get("/trips", (_req, res, next) => {
    (async () => {
      res.json({ data: { trips: await db.listTrips() } });
    })().catch(next);
  });

  // PAY: daftar pengajuan upgrade Pro + verifikasi manual admin
  // (mockup: 'aktif setelah pembayaran terverifikasi admin').
  r.get("/upgrades", (req, res, next) => {
    (async () => {
      const status =
        req.query.status === "PENDING" ||
        req.query.status === "VERIFIED" ||
        req.query.status === "REJECTED"
          ? req.query.status
          : undefined;
      res.json({ data: { upgrades: await db.listUpgrades(status) } });
    })().catch(next);
  });

  r.post("/upgrades/:id/verify", (req, res, next) => {
    (async () => {
      const ok = await db.verifyUpgrade(String(req.params.id), req.user!.id);
      if (!ok) throw notFound("UPGRADE_NOT_FOUND");
      res.json({ data: { verified: true } });
    })().catch(next);
  });

  // A-4: log pengiriman WA SOS untuk dashboard backend — pantau
  // kegagalan kirim (FAILED / SKIPPED_UNCONFIGURED) per SOS.
  r.get("/wa-dispatch-logs", (req, res, next) => {
    (async () => {
      const sosId =
        typeof req.query.sosId === "string" ? req.query.sosId : undefined;
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      res.json({ data: { logs: await db.waDispatchLogs({ sosId, limit }) } });
    })().catch(next);
  });

  // A-5 §14: expired = CLOSED, atau PLANNED yang tanggalnya sudah lewat
  // (tidak pernah dimulai). ACTIVE tidak pernah expired. "Hari ini"
  // dihitung server-side (tanggal trip disimpan sebagai string ISO date).
  r.get("/trips/expired", (_req, res, next) => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      res.json({ data: { trips: await db.listExpiredTrips(today) } });
    })().catch(next);
  });

  r.delete("/trips/:id", (req, res, next) => {
    (async () => {
      const trip = await db.tripById(param(req, "id"));
      if (!trip) throw notFound("TRIP_NOT_FOUND");
      const today = new Date().toISOString().slice(0, 10);
      if (!(await db.isTripExpired(trip.id, today))) {
        throw conflict("TRIP_NOT_EXPIRED");
      }
      await db.deleteTrip(trip.id);
      res.json({ data: { deleted: true } });
    })().catch(next);
  });

  // ---- Reports (Moderasi, file-10): list open reports, act or dismiss.
  r.get("/reports", (req, res, next) => {
    (async () => {
      const status = req.query.status;
      const filter =
        status === "OPEN" || status === "ACTIONED" || status === "DISMISSED"
          ? status
          : undefined;
      res.json({ data: { reports: await db.listReports(filter) } });
    })().catch(next);
  });

  // Close a report: body { action: "ACTIONED" | "DISMISSED" } —
  // "Tindak" hides the content (ACTIONED), "Abaikan" dismisses.
  r.patch("/reports/:id/close", (req, res, next) => {
    (async () => {
      const { action } = req.body ?? {};
      const status = action === "DISMISSED" ? "DISMISSED" : "ACTIONED";
      const report = await db.closeReport(param(req, "id"), status);
      if (!report) throw notFound("NOT_FOUND");
      res.json({ data: { report } });
    })().catch(next);
  });

  return r;
}
