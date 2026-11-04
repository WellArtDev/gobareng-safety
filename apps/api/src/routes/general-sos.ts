// SOS Umum (tanpa trip, untuk sehari-hari) — Wella 2 Nov 2026.
// Aturan kunci: pengirim HARUS terverifikasi (403 bila belum);
// penerima HANYA Pengguna Sekitar terverifikasi dalam radius 2 km
// (pola selectBystanders SOS trip, posisi dibaca lintas trip karena
// tidak ada trip); WA HANYA ke penerima terdekat ber-HP (tanpa kontak
// darurat, tanpa leader); lokasi wajib lat/lon, 0,0 ditolak; satu SOS
// umum aktif per pengirim. Event realtime memakai nama yang sama
// dengan SOS trip ("sos-bystander-alert", tripId: null) supaya klien
// yang sudah mendengarkan event itu tidak perlu kanal baru.
import { Router } from "express";
import { param, requireAuth } from "../auth.js";
import {
  collectGeneralSosWaRecipients,
  haversineKm,
  selectNearbyVerifiedUsers,
  type WaRecipient,
} from "../dispatch.js";
import { badRequest, conflict, forbidden, notFound, tooMany } from "../errors.js";
import type { Db } from "../db.js";
import type { Realtime } from "../realtime.js";
import {
  GENERAL_SOS_COOLDOWN_MS,
  GENERAL_SOS_DAILY_LIMIT,
  GENERAL_SOS_LEVELS,
  GENERAL_SOS_REASONS,
  GENERAL_SOS_WINDOW_MS,
  type GeneralSos,
  type GeneralSosReason,
} from "../store.js";
import { sendWhatsappSosAlert, whatsappProviderConfigured } from "../whatsapp.js";
import { sendSosPush } from "../push.js";
// AI-P: detail SOS umum diperkaya foto + deskripsi AI (tambahan aditif).
import { withSosPhotos } from "../sos-photos-serialize.js";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const CLOSED = ["RESOLVED", "CANCELLED", "FALSE_ALARM"] as const;

export function generalSosRouter(db: Db, io: Realtime): Router {
  const r = Router();
  r.use(requireAuth);

  async function serialize(sos: GeneralSos, viewerId: string) {
    const [sender, responderCount, viewerResponded] = await Promise.all([
      db.userById(sos.senderId),
      db.generalSosResponderCount(sos.id),
      db.generalSosHasResponder(sos.id, viewerId),
    ]);
    let distanceKm: number | null = null;
    if (viewerId !== sos.senderId) {
      const mine = (await db.latestLocationsGlobal()).find((l) => l.userId === viewerId);
      if (mine) {
        distanceKm = Math.round(haversineKm(sos.lat, sos.lon, mine.lat, mine.lon) * 100) / 100;
      }
    }
    return withSosPhotos(db, "GENERAL", {
      ...sos,
      tripId: null,
      senderName: sender?.name ?? null,
      responderCount,
      viewerResponded,
      viewerIsSender: viewerId === sos.senderId,
      distanceKm,
    });
  }

  async function canView(sos: GeneralSos, viewerId: string): Promise<boolean> {
    if (viewerId === sos.senderId) return true;
    if (await db.generalSosHasResponder(sos.id, viewerId)) return true;
    return db.hasGeneralSosAlertNotification(sos.id, viewerId);
  }

  async function closeFanout(
    sos: GeneralSos,
    recipients: { userId: string }[],
    status: GeneralSos["status"],
  ): Promise<void> {
    const ids = recipients.map((x) => x.userId);
    // Identitas pengirim selalu tampil di alert penerima (bukan anonim):
    // nama pengirim ikut di payload realtime + notifikasi.
    const sender = await db.userById(sos.senderId);
    io.toUsers(ids, "sos-bystander-alert", {
      generalSosId: sos.id,
      sosId: sos.id,
      tripId: null,
      userId: sos.senderId,
      senderName: sender?.name ?? null,
      reason: sos.reason,
      lat: sos.lat,
      lon: sos.lon,
      level: sos.level,
      status,
      bystanderUserIds: ids,
    });
    await Promise.all(
      ids.map((userId) =>
        db.notifyUser(userId, "GENERAL_SOS_CLOSED", {
          tripId: null,
          refId: sos.id,
          actorName: null,
        }),
      ),
    );
  }

  r.post("/", (req, res, next) => {
    (async () => {
      const sender = await db.userById(req.user!.id);
      // Gate: organizer-verified (isVerified) ATAU account-verified dua
      // kanal — salah satu lolos; datanya tetap terpisah.
      if (!sender?.isVerified && !sender?.accountVerifiedAt) {
        throw forbidden("GENERAL_SOS_UNVERIFIED_SENDER");
      }
      const { reason, lat, lon } = req.body ?? {};
      if (!GENERAL_SOS_REASONS.includes(reason as GeneralSosReason)) {
        throw badRequest("GENERAL_SOS_REASON_INVALID");
      }
      const la = num(lat);
      const lo = num(lon);
      // Kontrak lokasi sama seperti SOS trip, diperketat: 0,0 ditolak
      // eksplisit (titik nol bukan lokasi pengirim yang valid).
      if (la === null || lo === null || (la === 0 && lo === 0)) {
        throw badRequest("INVALID_LOCATION");
      }
      if (await db.hasActiveGeneralSos(req.user!.id)) {
        throw conflict("GENERAL_SOS_ALREADY_ACTIVE");
      }
      // Pengaman anti-penyalahgunaan (Wella 2 Nov 2026): maks 3 SOS
      // umum per 24 jam bergeser + jeda 10 menit antar kirim. Batas
      // harian dihitung dari SEMUA kiriman (termasuk yang dibatalkan)
      // supaya tidak bisa diakali dengan kirim-batal-kirim.
      const since = new Date(Date.now() - GENERAL_SOS_WINDOW_MS);
      if (
        (await db.countGeneralSosSince(req.user!.id, since)) >=
        GENERAL_SOS_DAILY_LIMIT
      ) {
        throw tooMany("GENERAL_SOS_DAILY_LIMIT");
      }
      const lastSent = await db.latestGeneralSosCreatedAt(req.user!.id);
      if (
        lastSent &&
        Date.now() - lastSent.getTime() < GENERAL_SOS_COOLDOWN_MS
      ) {
        throw tooMany("GENERAL_SOS_COOLDOWN");
      }
      const sos = await db.createGeneralSos({
        senderId: req.user!.id,
        reason: reason as GeneralSosReason,
        level: GENERAL_SOS_LEVELS[reason as GeneralSosReason],
        lat: la,
        lon: lo,
      });
      const recipients = await selectNearbyVerifiedUsers(db, sos.senderId, sos.lat, sos.lon);
      let waRecipients: WaRecipient[] = [];
      if (db.recordDispatch(sos.id)) {
        const ids = recipients.map((x) => x.userId);
        io.toUsers(ids, "sos-bystander-alert", {
          generalSosId: sos.id,
          sosId: sos.id,
          tripId: null,
          userId: sos.senderId,
          senderName: sender.name,
          reason: sos.reason,
          lat: sos.lat,
          lon: sos.lon,
          level: sos.level,
          status: sos.status,
          bystanderUserIds: ids,
          bystanders: recipients.map((b) => ({
            userId: b.userId,
            distanceKm: Math.round(b.distanceKm * 100) / 100,
          })),
        });
        await Promise.all(
          ids.map((userId) =>
            db.notifyUser(userId, "GENERAL_SOS_ALERT", {
              tripId: null,
              refId: sos.id,
              actorName: sender.name,
            }),
          ),
        );
        // Toggle matriks Pengaturan SOS-WhatsApp diikuti sama seperti
        // SOS trip: mati = WA dilewati total, tanpa log kirim.
        const settings = await db.platformSettings();
        if (settings.notifSosWhatsapp) {
          waRecipients = await collectGeneralSosWaRecipients(db, recipients);
        }
        const waProvider = settings.whatsappProvider ?? "official";
        for (const recipient of waRecipients) {
          if (!whatsappProviderConfigured(waProvider)) {
            void db.logWaDispatch({
              sosId: sos.id,
              tripId: null,
              toPhone: recipient.phone,
              recipient: recipient.kind,
              status: "SKIPPED_UNCONFIGURED",
            });
            continue;
          }
          void sendWhatsappSosAlert(
            recipient.phone,
            waProvider,
            {
              senderName: sender.name,
              reason: sos.reason,
              lat: sos.lat,
              lon: sos.lon,
            },
          ).then((r) =>
            db.logWaDispatch({
              sosId: sos.id,
              tripId: null,
              toPhone: recipient.phone,
              recipient: recipient.kind,
              status: r.ok ? "SENT" : "FAILED",
              error: r.ok ? null : (r.detail ?? r.errorCode ?? "send-failed"),
            }),
          );
        }
        // M2 channel ketiga — push FCM ke Pengguna Sekitar
        // terverifikasi (resolusi penerima sama dengan in-app di
        // atas). Fail-soft, fire-and-forget. FCM satu-satunya jalur
        // (keputusan Wella 3 Nov 2026); tanpa setting penyedia.
        void sendSosPush(db, ids, {
          title: "GoBareng SOS",
          body: `SOS dari ${sender.name}: ${sos.reason}`,
          data: {
            sosId: sos.id,
            tripId: null,
            lat: sos.lat,
            lon: sos.lon,
          },
        });
      }
      res.status(201).json({
        data: {
          sos: await serialize(sos, req.user!.id),
          recipients: recipients.map((b) => ({
            userId: b.userId,
            distanceKm: Math.round(b.distanceKm * 100) / 100,
          })),
          waRecipients: waRecipients.map((x) => x.phone),
        },
      });
    })().catch(next);
  });

  r.get("/:id", (req, res, next) => {
    (async () => {
      const sos = await db.generalSosById(param(req, "id"));
      if (!sos) return next(notFound("SOS_NOT_FOUND"));
      if (!(await canView(sos, req.user!.id))) {
        return next(forbidden("GENERAL_SOS_NOT_ALLOWED"));
      }
      res.json({ data: { sos: await serialize(sos, req.user!.id) } });
    })().catch(next);
  });

  r.patch("/:id/respond", (req, res, next) => {
    (async () => {
      const sos = await db.generalSosById(param(req, "id"));
      if (!sos) return next(notFound("SOS_NOT_FOUND"));
      if (sos.senderId === req.user!.id) {
        return next(forbidden("GENERAL_SOS_NOT_ALLOWED"));
      }
      if (!(await canView(sos, req.user!.id))) {
        return next(forbidden("GENERAL_SOS_NOT_ALLOWED"));
      }
      if ((CLOSED as readonly string[]).includes(sos.status)) {
        return next(conflict("GENERAL_SOS_CLOSED"));
      }
      const { action } = req.body ?? {};
      if (action === "GOING") {
        await db.addGeneralSosResponder(sos.id, req.user!.id);
        io.toUsers([sos.senderId], "general-sos-respond", {
          generalSosId: sos.id,
          byUserId: req.user!.id,
          responderCount: await db.generalSosResponderCount(sos.id),
        });
      } else if (action === "IGNORE") {
        // Abaikan = tidak dihitung sebagai responder; tandai notifikasi
        // alertnya sudah dibaca supaya tidak menggantung di inbox.
        const notes = await db.prisma.notification.findMany({
          where: { userId: req.user!.id, refId: sos.id, kind: "GENERAL_SOS_ALERT" },
        });
        await Promise.all(
          notes.map((n) => db.markNotificationRead(n.id)),
        );
      } else {
        throw badRequest("INVALID_PAYLOAD");
      }
      const fresh = (await db.generalSosById(sos.id)) ?? sos;
      res.json({ data: { sos: await serialize(fresh, req.user!.id) } });
    })().catch(next);
  });

  const close = (status: GeneralSos["status"]) => {
    return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
      (async () => {
        const sos = await db.generalSosById(param(req, "id"));
        if (!sos) return next(notFound("SOS_NOT_FOUND"));
        if (sos.senderId !== req.user!.id) {
          return next(forbidden("SENDER_ONLY"));
        }
        if ((CLOSED as readonly string[]).includes(sos.status)) {
          return next(conflict("GENERAL_SOS_CLOSED"));
        }
        const updated = (await db.updateGeneralSosStatus(sos.id, status)) ?? sos;
        // Penerima penutup = semua yang dulu menerima alert (jejaknya
        // baris notifikasi GENERAL_SOS_ALERT).
        const alertNotes = await db.prisma.notification.findMany({
          where: { refId: sos.id, kind: "GENERAL_SOS_ALERT" },
          select: { userId: true },
        });
        await closeFanout(updated, alertNotes, status);
        res.json({ data: { sos: await serialize(updated, req.user!.id) } });
      })().catch(next);
    };
  };

  r.patch("/:id/cancel", close("CANCELLED"));
  r.patch("/:id/resolve", close("RESOLVED"));

  // Laporkan SOS palsu/iseng — hanya penerima (bukan pengirim sendiri,
  // bukan orang asing). Satu laporan per pelapor per SOS. Laporan
  // dicatat untuk ditindak admin (daftar + flag di /admin; suspend
  // lewat PATCH /admin/members/:id/suspend yang sudah ada). Tidak ada
  // pemblokiran otomatis: ambang + banding butuh keputusan Wella.
  r.post("/:id/report", (req, res, next) => {
    (async () => {
      const sos = await db.generalSosById(param(req, "id"));
      if (!sos) return next(notFound("SOS_NOT_FOUND"));
      if (req.user!.id === sos.senderId) {
        return next(forbidden("GENERAL_SOS_REPORT_NOT_ALLOWED"));
      }
      if (!(await canView(sos, req.user!.id))) {
        return next(forbidden("GENERAL_SOS_NOT_ALLOWED"));
      }
      if (await db.generalSosReportByPair(sos.id, req.user!.id)) {
        return next(conflict("GENERAL_SOS_ALREADY_REPORTED"));
      }
      const report = await db.createGeneralSosReport(sos.id, req.user!.id);
      res.status(201).json({ data: { report } });
    })().catch(next);
  });

  return r;
}
