// AI-P — SOS foto: lampiran foto SOS trip maupun SOS umum + analisis
// vision AI + baca foto per SOS.
//
// Alur: pengirim SOS (hanya pengirim, sender-only) mengunggah satu
// foto per request (field "photo", pola multer uploads.ts: images
// only, maks 5 MB) ke SOS yang sudah terkirim. Foto disimpan dulu
// (status PENDING), lalu vision dicoba SEKALI secara fail-soft:
// berhasil = AVAILABLE + deskripsi + model; tidak terkonfigurasi atau
// upstream gagal = UNAVAILABLE + deskripsi null (SOS + foto tetap
// jalan, klien menampilkan "belum tersedia" — tidak ada deskripsi
// karangan di jalur mana pun). POST /:id/analyze mengulang analisis
// untuk foto yang sama (mis. setelah vision dikonfigurasi).
//
// Baca mengikuti guard detail SOS yang sudah ada: SOS trip boleh
// dibaca pengirim, anggota trip, atau peran dashboard; SOS umum boleh
// dibaca pengirim, responder, atau penerima alert. Kode error dikirim
// sebagai kode (pola §19), klien memetakan ke i18n.
import { Router } from "express";
import { join } from "node:path";
import { describeSosPhoto } from "../ai-vision.js";
import { requireAiModule } from "../ai-modules.js";
import { param, requireAuth } from "../auth.js";
import type { Db } from "../db.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import {
  serializeSosPhoto,
  photosForSos,
  type SosPhotoView,
} from "../sos-photos-serialize.js";
import {
  saveSosPhotoFile,
  sosPhotoUpload,
  sosPhotoUrl,
  sosUploadsDir,
} from "../uploads.js";

type SosKind = "TRIP" | "GENERAL";

function isKind(v: unknown): v is SosKind {
  return v === "TRIP" || v === "GENERAL";
}

export function sosPhotosRouter(db: Db): Router {
  const r = Router();
  r.use(requireAuth);

  // Kembalikan SOS (trip/umum) + alasan untuk konteks vision; null
  // bila tidak ada. Dipakai attach + baca + analisis.
  async function resolveSos(kind: SosKind, sosId: string) {
    if (kind === "TRIP") {
      const sos = await db.sosById(sosId);
      return sos ? { senderId: sos.senderId, reason: sos.reason, tripId: sos.tripId } : null;
    }
    const sos = await db.generalSosById(sosId);
    return sos ? { senderId: sos.senderId, reason: sos.reason, tripId: null as string | null } : null;
  }

  async function canView(
    kind: SosKind,
    sos: { senderId: string; tripId: string | null },
    sosId: string,
    viewerId: string,
  ): Promise<boolean> {
    if (sos.senderId === viewerId) return true;
    if (kind === "TRIP") {
      if (await db.isDashboardRole(viewerId)) return true;
      const members = await db.tripMembers(sos.tripId as string);
      return members.some((m) => m.userId === viewerId);
    }
    if (await db.generalSosHasResponder(sosId, viewerId)) return true;
    return db.hasGeneralSosAlertNotification(sosId, viewerId);
  }

  async function analyzePhoto(
    photo: { id: string; photoFilename: string; kind: SosKind; reason: string },
  ): Promise<SosPhotoView> {
    try {
      const result = await describeSosPhoto(join(sosUploadsDir, photo.photoFilename), {
        kind: photo.kind,
        reason: photo.reason,
      });
      const updated = await db.prisma.sosPhoto.update({
        where: { id: photo.id },
        data: {
          aiDescription: result.description,
          aiModel: result.model,
          aiStatus: "AVAILABLE",
        },
      });
      return serializeSosPhoto(updated);
    } catch {
      // Fail-soft (pola ai.ts): vision mati bukan alasan foto/SOS gagal.
      const updated = await db.prisma.sosPhoto.update({
        where: { id: photo.id },
        data: { aiDescription: null, aiModel: null, aiStatus: "UNAVAILABLE" },
      });
      return serializeSosPhoto(updated);
    }
  }

  r.post("/", (req, res, next) => {
    sosPhotoUpload.single("photo")(req, res, (err) => {
      if (err) return next(badRequest("INVALID_IMAGE"));
      (async () => {
        requireAiModule(await db.platformSettings(), "aiP");
        const body = (req.body ?? {}) as Record<string, unknown>;
        const kind = body.kind;
        const sosId = body.sosId;
        if (!isKind(kind) || typeof sosId !== "string" || !sosId) {
          throw badRequest("INVALID_PAYLOAD");
        }
        const file = (
          req as typeof req & { file?: { buffer: Uint8Array; mimetype: string } }
        ).file;
        if (!file) throw badRequest("INVALID_IMAGE");
        const sos = await resolveSos(kind, sosId);
        if (!sos) return next(notFound("SOS_NOT_FOUND"));
        // Sender-only: hanya pengirim SOS yang boleh melampirkan foto
        // ke SOS-nya (leader/penerima melihat lewat detail, bukan
        // menambah foto orang lain).
        if (sos.senderId !== req.user!.id) {
          return next(forbidden("SOS_PHOTO_NOT_ALLOWED"));
        }
        const saved = saveSosPhotoFile(file);
        const created = await db.prisma.sosPhoto.create({
          data: {
            kind,
            sosId,
            senderId: req.user!.id,
            photoUrl: sosPhotoUrl(req, saved.filename),
            photoFilename: saved.filename,
            aiStatus: "PENDING",
          },
        });
        const photo = await analyzePhoto({
          id: created.id,
          photoFilename: created.photoFilename,
          kind,
          reason: sos.reason,
        });
        res.status(201).json({ data: { photo } });
      })().catch(next);
    });
  });

  r.get("/:kind/:sosId", (req, res, next) => {
    (async () => {
      requireAiModule(await db.platformSettings(), "aiP");
      const kind = param(req, "kind");
      if (!isKind(kind)) throw badRequest("INVALID_PAYLOAD");
      const sosId = param(req, "sosId");
      const sos = await resolveSos(kind, sosId);
      if (!sos) return next(notFound("SOS_NOT_FOUND"));
      if (!(await canView(kind, sos, sosId, req.user!.id))) {
        return next(forbidden("SOS_PHOTO_NOT_ALLOWED"));
      }
      res.json({ data: { photos: await photosForSos(db, kind, sosId) } });
    })().catch(next);
  });

  r.post("/:id/analyze", (req, res, next) => {
    (async () => {
      requireAiModule(await db.platformSettings(), "aiP");
      const photo = await db.prisma.sosPhoto.findUnique({
        where: { id: param(req, "id") },
      });
      if (!photo) return next(notFound("SOS_NOT_FOUND"));
      if (photo.senderId !== req.user!.id) {
        return next(forbidden("SOS_PHOTO_NOT_ALLOWED"));
      }
      const sos = await resolveSos(photo.kind as SosKind, photo.sosId);
      const analyzed = await analyzePhoto({
        id: photo.id,
        photoFilename: photo.photoFilename,
        kind: photo.kind as SosKind,
        reason: sos?.reason ?? "LAINNYA",
      });
      res.json({ data: { photo: analyzed } });
    })().catch(next);
  });

  return r;
}
