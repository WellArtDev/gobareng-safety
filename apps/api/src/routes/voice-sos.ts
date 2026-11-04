// AI-V — SOS suara. Alur: rekam di mobile -> POST /transcribe
// (STT provider sungguhan, bukan teks karangan) -> layar review
// menampilkan transkrip + alasan terdeteksi + lokasi -> POST /confirm.
// Confirm TIDAK punya jalur dispatch sendiri: ia memanggil persis
// blok pembuatan SOS yang sama dengan SOS biasa — trip (trips.ts:
// sos-trigger + bystander 2 km + WA Meta + notif dashboard + kanal
// Brevo ke leader) atau umum (general-sos.ts: Pengguna Sekitar
// terverifikasi 2 km + WA hanya ke ber-HP + guard anti-penyalahgunaan).
// Pemilihan trip vs umum dibuat klien dari trip ACTIVE pengguna
// (sama seperti layar sos-pick); server hanya memvalidasi tripId yang
// dikirim. Transkrip TIDAK disimpan (tidak ada kolomnya di skema SOS
// — menambah kolom = migrasi skema bersama, di luar scope satu fitur
// ini); transkrip hanya tampil di layar review sebelum konfirmasi.
import { Router } from "express";
import { requireAuth } from "../auth.js";
import {
  collectGeneralSosWaRecipients,
  collectSosWaRecipients,
  selectBystanders,
  selectNearbyVerifiedUsers,
  type WaRecipient,
} from "../dispatch.js";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../errors.js";
import { requireAiModule } from "../ai-modules.js";
import type { Db } from "../db.js";
import type { Realtime } from "../realtime.js";
import {
  GENERAL_SOS_COOLDOWN_MS,
  GENERAL_SOS_DAILY_LIMIT,
  GENERAL_SOS_LEVELS,
  GENERAL_SOS_REASONS,
  GENERAL_SOS_WINDOW_MS,
  SOS_LEVELS,
  SOS_REASONS,
  type GeneralSosReason,
  type SosReason,
  type TripType,
} from "../store.js";
import { transcribeAudio } from "../stt.js";
import {
  classifyWithMeta,
  detectGeneralReason,
  detectTripReason,
} from "../voice-sos.js";
import { sendWhatsappSosAlert, whatsappProviderConfigured } from "../whatsapp.js";
import { dispatchNotificationChannels } from "../notify-channels.js";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function voiceSosRouter(db: Db, io: Realtime): Router {
  const r = Router();
  r.use(requireAuth);

  r.post("/transcribe", (req, res, next) => {
    (async () => {
      requireAiModule(await db.platformSettings(), "aiV");
      const { audioBase64, mimeType, kind, tripType } = req.body ?? {};
      if (kind !== "trip" && kind !== "general") {
        throw badRequest("INVALID_PAYLOAD");
      }
      let tripKind: TripType | null = null;
      if (kind === "trip") {
        if (tripType !== "HIKING" && tripType !== "TOURING") {
          throw badRequest("INVALID_PAYLOAD");
        }
        tripKind = tripType;
      }
      if (typeof audioBase64 !== "string" || audioBase64.length === 0) {
        throw new ApiError(400, "STT_AUDIO_INVALID");
      }
      const mime = typeof mimeType === "string" ? mimeType : "audio/m4a";
      const { transcript, model: sttModel } = await transcribeAudio(audioBase64, mime);
      // Klasifikasi: AI dulu (bila dikonfigurasi), keyword fallback bila
      // tidak. `model` hanya ada bila AI benar-benar mengklasifikasi —
      // klien menampilkan "Built with Muse Spark Open" hanya dari sini.
      const candidates =
        kind === "trip" ? SOS_REASONS[tripKind!] : GENERAL_SOS_REASONS;
      const ai = await classifyWithMeta(transcript, candidates);
      const detectedReason = ai
        ? ai.reason
        : kind === "trip"
          ? detectTripReason(transcript, tripKind!)
          : detectGeneralReason(transcript);
      res.json({
        data: {
          transcript,
          detectedReason,
          kind,
          model: ai ? ai.model : null,
          sttModel,
        },
      });
    })().catch(next);
  });

  r.post("/confirm", (req, res, next) => {
    (async () => {
      requireAiModule(await db.platformSettings(), "aiV");
      const { reason, lat, lon, tripId } = req.body ?? {};
      const la = num(lat);
      const lo = num(lon);
      if (typeof tripId === "string" && tripId) {
        // ---- SOS trip (jalur trips.ts POST /:id/sos) ----
        const trip = await db.tripById(tripId);
        if (!trip) return next(notFound("TRIP_NOT_FOUND"));
        if (!(await db.memberOf(trip.id, req.user!.id))) {
          throw forbidden("NOT_TRIP_MEMBER");
        }
        if (!SOS_REASONS[trip.type].includes(reason as SosReason)) {
          throw badRequest("SOS_REASON_INVALID_FOR_TRIP_TYPE");
        }
        if (la === null || lo === null) throw badRequest("INVALID_LOCATION");
        if (await db.hasActiveSos(trip.id, req.user!.id)) {
          throw conflict("SOS_ALREADY_ACTIVE");
        }
        const alert = await db.createSos({
          tripId: trip.id,
          senderId: req.user!.id,
          reason: reason as SosReason,
          level: SOS_LEVELS[reason as SosReason],
          lat: la,
          lon: lo,
        });
        io.toTrip(trip.id, "sos-trigger", {
          sosId: alert.id,
          tripId: trip.id,
          userId: alert.senderId,
          reason: alert.reason,
          lat: alert.lat,
          lon: alert.lon,
          level: alert.level,
          status: alert.status,
        });
        const bystanders = await selectBystanders(db, alert);
        let waRecipients: WaRecipient[] = [];
        if (db.recordDispatch(alert.id)) {
          const dispatched = bystanders.map((b) => b.userId);
          io.toUsers(dispatched, "sos-bystander-alert", {
            sosId: alert.id,
            tripId: trip.id,
            userId: alert.senderId,
            reason: alert.reason,
            lat: alert.lat,
            lon: alert.lon,
            level: alert.level,
            status: alert.status,
            bystanderUserIds: dispatched,
            bystanders: bystanders.map((b) => ({
              userId: b.userId,
              distanceKm: Math.round(b.distanceKm * 100) / 100,
            })),
          });
          const sosSettings = await db.platformSettings();
          if (sosSettings.notifSosWhatsapp) {
            waRecipients = await collectSosWaRecipients(db, alert, trip.leaderId, bystanders);
          }
          const waProvider = sosSettings.whatsappProvider ?? "official";
          const senderName =
            (await db.userById(alert.senderId))?.name ?? "Pengguna GoBareng";
          for (const recipient of waRecipients) {
            if (!whatsappProviderConfigured(waProvider)) {
              void db.logWaDispatch({
                sosId: alert.id,
                tripId: trip.id,
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
                senderName,
                reason: alert.reason,
                lat: alert.lat,
                lon: alert.lon,
              },
            ).then((r) =>
              db.logWaDispatch({
                sosId: alert.id,
                tripId: trip.id,
                toPhone: recipient.phone,
                recipient: recipient.kind,
                status: r.ok ? "SENT" : "FAILED",
                error: r.ok ? null : (r.detail ?? r.errorCode ?? "send-failed"),
              }),
            );
          }
        }
        await db.notifyDashboard("SOS_TRIGGERED", {
          tripId: trip.id,
          refId: alert.id,
          actorName: (await db.userById(alert.senderId))?.name ?? null,
        });
        {
          const leader = await db.userById(trip.leaderId);
          const sosSettings2 = await db.platformSettings();
          void dispatchNotificationChannels(sosSettings2, "sos", {
            subject: "GoBareng SOS: bantuan dibutuhkan",
            message: `SOS di trip ${trip.name}: ${alert.reason}. Lokasi ${alert.lat}, ${alert.lon}.`,
            emails: leader ? [leader.email] : [],
            phones: leader?.phone ? [leader.phone] : [],
            skipWhatsapp: true,
          });
        }
        res.status(201).json({
          data: { kind: "trip", sos: alert, waRecipients: waRecipients.map((x) => x.phone) },
        });
        return;
      }
      // ---- SOS umum (jalur general-sos.ts POST /) ----
      const sender = await db.userById(req.user!.id);
      // Gate: organizer-verified (isVerified) ATAU account-verified dua
      // kanal — salah satu lolos; datanya tetap terpisah.
      if (!sender?.isVerified && !sender?.accountVerifiedAt) {
        throw forbidden("GENERAL_SOS_UNVERIFIED_SENDER");
      }
      if (!GENERAL_SOS_REASONS.includes(reason as GeneralSosReason)) {
        throw badRequest("GENERAL_SOS_REASON_INVALID");
      }
      if (la === null || lo === null || (la === 0 && lo === 0)) {
        throw badRequest("INVALID_LOCATION");
      }
      if (await db.hasActiveGeneralSos(req.user!.id)) {
        throw conflict("GENERAL_SOS_ALREADY_ACTIVE");
      }
      const since = new Date(Date.now() - GENERAL_SOS_WINDOW_MS);
      if ((await db.countGeneralSosSince(req.user!.id, since)) >= GENERAL_SOS_DAILY_LIMIT) {
        throw new ApiError(429, "GENERAL_SOS_DAILY_LIMIT");
      }
      const lastSent = await db.latestGeneralSosCreatedAt(req.user!.id);
      if (lastSent && Date.now() - lastSent.getTime() < GENERAL_SOS_COOLDOWN_MS) {
        throw new ApiError(429, "GENERAL_SOS_COOLDOWN");
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
      }
      res.status(201).json({
        data: {
          kind: "general",
          sos: { ...sos, tripId: null },
          recipients: recipients.map((b) => ({
            userId: b.userId,
            distanceKm: Math.round(b.distanceKm * 100) / 100,
          })),
          waRecipients: waRecipients.map((x) => x.phone),
        },
      });
    })().catch(next);
  });

  return r;
}
