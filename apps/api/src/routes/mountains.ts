// Mountains — kontrak §10 (A-5). Katalog gunung + jalur untuk wizard
// buat trip; sumber kebenaran pindah dari katalog klien mobile
// (apps/mobile/src/utils/mountains.ts) ke DB (seed di seed-mountains.ts).
// POI crowdsourced (routes/:routeId/pois) menyusul — butuh data trip
// nyata, dicatat di kontrak sebagai belum diimplementasi.
//
// Tabel Gunung (1 Nov 2026): GET tetap untuk semua peran login;
// PATCH + DELETE admin-only (requireAdmin, seperti /admin/*).
// Field edit mengikuti struktur nama_gunung.json: lokasi, provinsi,
// ketinggian, kesulitan, tipe vulkanik, gambar, deskripsi, koordinat,
// plus status app isActive (aksi Nonaktifkan/Aktifkan).
import { Router } from "express";
import { param, requireAdmin, requireAuth } from "../auth.js";
import type { Db } from "../db.js";
import { badRequest as badReq, notFound as notFound2 } from "../errors.js";
import {
  deleteOldMountainImage,
  mountainImageUpload,
  mountainImageUrl,
  saveMountainImageFile,
} from "../uploads.js";

const DIFFICULTY_KEYS = [
  "wizard.diffBeginner",
  "wizard.diffIntermediate",
  "wizard.diffAdvanced",
] as const;

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function mountainsRouter(db: Db): Router {
  const r = Router();
  r.use(requireAuth);

  // ---- Usulan gunung & jalur buatan user (antre persetujuan admin).
  // Rute-rute ini HARUS didaftarkan sebelum GET /:id, kalau tidak
  // "proposals" ditangkap sebagai id gunung.
  function validCoord(v: unknown, min: number, max: number): number | null {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return null;
    return v;
  }
  function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(bLat - aLat);
    const dLon = rad(bLon - aLon);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  r.post("/proposals", (req, res, next) => {
    (async () => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const location = typeof body.location === "string" ? body.location.trim() : "";
      const lat = validCoord(body.lat, -90, 90);
      const lon = validCoord(body.lon, -180, 180);
      if (!name || name.length > 100 || !location || lat === null || lon === null) {
        throw badReq("INVALID_PAYLOAD");
      }
      let elevationM: number | null = null;
      if (body.elevationM !== undefined && body.elevationM !== null) {
        if (!isNum(body.elevationM) || body.elevationM <= 0 || !Number.isInteger(body.elevationM)) {
          throw badReq("INVALID_PAYLOAD");
        }
        elevationM = body.elevationM;
      }
      const proposal = await db.createMountainProposal(req.user!.id, {
        name,
        location,
        lat,
        lon,
        elevationM,
      });
      res.status(201).json({ data: { proposal } });
    })().catch(next);
  });

  r.get("/proposals/mine", (req, res, next) => {
    (async () => {
      const [mountains, routes] = await Promise.all([
        db.listMyMountainProposals(req.user!.id),
        db.listMyRouteProposals(req.user!.id),
      ]);
      res.json({ data: { mountains, routes } });
    })().catch(next);
  });

  r.get("/proposals", requireAdmin, (_req, res, next) => {
    (async () => {
      const { mountains, routes } = await db.listProposals();
      const catalog = await db.listMountains();
      const dupName = (name: string) =>
        catalog.some((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase());
      const dupNear = (lat: number, lon: number) =>
        catalog.some(
          (m) =>
            m.lat !== null &&
            m.lat !== undefined &&
            m.lon !== null &&
            m.lon !== undefined &&
            haversineKm(lat, lon, m.lat, m.lon) <= 2,
        );
      const withWarnings = (p: Record<string, unknown>) => ({
        ...p,
        duplicateName: dupName(String(p.name ?? "")),
        duplicateNearby:
          typeof p.lat === "number" && typeof p.lon === "number"
            ? dupNear(p.lat, p.lon)
            : false,
      });
      const routesWithWarnings = await Promise.all(
        routes.map(async (p) => {
          const detail = await db.mountainById(p.mountainId);
          const sameNameRoute = (detail?.routes ?? []).some(
            (rt) =>
              String((rt as { name?: unknown }).name ?? "")
                .trim()
                .toLowerCase() === p.name.trim().toLowerCase(),
          );
          return { ...p, duplicateName: sameNameRoute, duplicateNearby: false };
        }),
      );
      res.json({
        data: { mountains: mountains.map(withWarnings), routes: routesWithWarnings },
      });
    })().catch(next);
  });

  r.post("/proposals/:id/approve", requireAdmin, (req, res, next) => {
    (async () => {
      const kind = req.query.kind === "route" ? "route" : "mountain";
      const made =
        kind === "route"
          ? await db.approveRouteProposal(param(req, "id"))
          : await db.approveMountainProposal(param(req, "id"));
      if (!made) throw notFound2();
      res.json({ data: { approved: made } });
    })().catch(next);
  });

  r.post("/proposals/:id/reject", requireAdmin, (req, res, next) => {
    (async () => {
      const kind = req.query.kind === "route" ? "route" : "mountain";
      const body = (req.body ?? {}) as Record<string, unknown>;
      const reason =
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim().slice(0, 300)
          : null;
      const rejected = await db.rejectProposal(kind, param(req, "id"), reason);
      if (!rejected) throw notFound2();
      res.json({ data: { proposal: rejected } });
    })().catch(next);
  });

  r.post("/:id/route-proposals", (req, res, next) => {
    (async () => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const posts = body.checkpoints;
      if (!name || name.length > 100 || !Array.isArray(posts) || posts.length < 1 || posts.length > 30) {
        throw badReq("INVALID_PAYLOAD");
      }
      const parsed: { name: string; lat: number; lon: number; isGathering: boolean }[] = [];
      for (const p of posts) {
        if (!p || typeof p !== "object" || Array.isArray(p)) throw badReq("INVALID_PAYLOAD");
        const o = p as Record<string, unknown>;
        const pName = typeof o.name === "string" ? o.name.trim() : "";
        const lat = validCoord(o.lat, -90, 90);
        const lon = validCoord(o.lon, -180, 180);
        if (!pName || pName.length > 100 || lat === null || lon === null) {
          throw badReq("INVALID_PAYLOAD");
        }
        parsed.push({ name: pName, lat, lon, isGathering: o.isGathering === true });
      }
      // Aturan keras: checkpoint PERTAMA harus titik kumpul awal di
      // kaki gunung. Tanpa itu usulan ditolak (400), bukan diperbaiki
      // diam-diam — user harus menandai sendiri titik kumpulnya.
      if (!parsed[0].isGathering) throw badReq("INVALID_PAYLOAD");
      const normalized = parsed.map((p, i) => ({ ...p, isGathering: i === 0 }));
      const mountain = await db.mountainById(param(req, "id"));
      if (!mountain) throw notFound2();
      const proposal = await db.createRouteProposal(
        req.user!.id,
        param(req, "id"),
        name,
        normalized,
      );
      res.status(201).json({ data: { proposal } });
    })().catch(next);
  });

  r.get("/", (_req, res, next) => {
    (async () => {
      res.json({ data: { mountains: await db.listMountains() } });
    })().catch(next);
  });

  r.get("/:id", (req, res, next) => {
    (async () => {
      const mountain = await db.mountainById(param(req, "id"));
      if (!mountain) throw notFound2();
      res.json({ data: { mountain } });
    })().catch(next);
  });

  r.get("/:id/routes", (req, res, next) => {
    (async () => {
      const mountain = await db.mountainById(param(req, "id"));
      if (!mountain) throw notFound2();
      res.json({ data: { routes: mountain.routes } });
    })().catch(next);
  });

  r.get("/:id/routes/:routeId", (req, res, next) => {
    (async () => {
      const route = await db.mountainRoute(param(req, "id"), param(req, "routeId"));
      if (!route) throw notFound2();
      res.json({ data: { route } });
    })().catch(next);
  });

  // Jalur (admin-only): tambah / edit / hapus, termasuk daftar pos.
  // Validasi mengikuti gaya PATCH gunung: angka harus finite,
  // jarak & estimasi > 0, gain >= 0 dan bulat; posts harus array
  // (isinya dinormalisasi + dilengkapi Puncak di db).
  function routePayload(body: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) throw badReq("INVALID_PAYLOAD");
      out.name = body.name.trim();
    }
    if (body.meetingPoint !== undefined) {
      if (typeof body.meetingPoint !== "string" || !body.meetingPoint.trim()) throw badReq("INVALID_PAYLOAD");
      out.meetingPoint = body.meetingPoint.trim();
    }
    if (body.distanceKm !== undefined) {
      if (!isNum(body.distanceKm) || body.distanceKm <= 0) throw badReq("INVALID_PAYLOAD");
      out.distanceKm = body.distanceKm;
    }
    if (body.gainM !== undefined) {
      if (!isNum(body.gainM) || body.gainM < 0 || !Number.isInteger(body.gainM)) throw badReq("INVALID_PAYLOAD");
      out.gainM = body.gainM;
    }
    if (body.estHours !== undefined) {
      if (!isNum(body.estHours) || body.estHours <= 0) throw badReq("INVALID_PAYLOAD");
      out.estHours = body.estHours;
    }
    if (body.recommended !== undefined) {
      if (typeof body.recommended !== "boolean") throw badReq("INVALID_PAYLOAD");
      out.recommended = body.recommended;
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") throw badReq("INVALID_PAYLOAD");
      out.isActive = body.isActive;
    }
    if (body.posts !== undefined) {
      if (!Array.isArray(body.posts)) throw badReq("INVALID_PAYLOAD");
      // Tambahan A (1 Nov 2026): pos boleh string polos atau objek
      // { name, lat?, lon? }. Koordinat: lat -90..90, lon -180..180;
      // ''/null = kosong; pasangan harus lengkap (satu saja = 400).
      const coord = (v: unknown, min: number, max: number): number | null => {
        if (v === undefined || v === null || v === "") return null;
        if (typeof v !== "number" || !Number.isFinite(v)) throw badReq("INVALID_PAYLOAD");
        if (v < min || v > max) throw badReq("INVALID_PAYLOAD");
        return v;
      };
      for (const p of body.posts) {
        if (typeof p === "string") continue;
        if (!p || typeof p !== "object" || Array.isArray(p)) throw badReq("INVALID_PAYLOAD");
        const o = p as Record<string, unknown>;
        if (typeof o.name !== "string" || !o.name.trim()) throw badReq("INVALID_PAYLOAD");
        const lat = coord(o.lat, -90, 90);
        const lon = coord(o.lon, -180, 180);
        if ((lat === null) !== (lon === null)) throw badReq("INVALID_PAYLOAD");
      }
    }
    return out;
  }

  r.post("/:id/routes", requireAdmin, (req, res, next) => {
    (async () => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      for (const k of ["name", "meetingPoint", "distanceKm", "gainM", "estHours"]) {
        if (body[k] === undefined) throw badReq("INVALID_PAYLOAD");
      }
      const data = routePayload(body);
      const route = await db.createMountainRoute(
        param(req, "id"),
        data as {
          name: string;
          meetingPoint: string;
          distanceKm: number;
          gainM: number;
          estHours: number;
          recommended?: boolean;
        },
        body.posts,
      );
      if (!route) throw notFound2();
      res.json({ data: { route } });
    })().catch(next);
  });

  r.patch("/:id/routes/:routeId", requireAdmin, (req, res, next) => {
    (async () => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch = routePayload(body);
      const route = await db.updateMountainRoute(
        param(req, "id"),
        param(req, "routeId"),
        patch,
        body.posts,
      );
      if (!route) throw notFound2();
      res.json({ data: { route } });
    })().catch(next);
  });

  r.delete("/:id/routes/:routeId", requireAdmin, (req, res, next) => {
    (async () => {
      const ok = await db.deleteMountainRoute(param(req, "id"), param(req, "routeId"));
      if (!ok) throw notFound2();
      res.json({ data: { deleted: true } });
    })().catch(next);
  });

  r.patch("/:id", requireAdmin, (req, res, next) => {
    (async () => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim()) throw badReq("INVALID_PAYLOAD");
        patch.name = body.name.trim();
      }
      if (body.elevationM !== undefined) {
        if (!isNum(body.elevationM) || body.elevationM <= 0) throw badReq("INVALID_PAYLOAD");
        patch.elevationM = body.elevationM;
      }
      if (body.location !== undefined) {
        if (typeof body.location !== "string" || !body.location.trim()) throw badReq("INVALID_PAYLOAD");
        patch.location = body.location.trim();
      }
      if (body.province !== undefined) {
        if (typeof body.province !== "string") throw badReq("INVALID_PAYLOAD");
        patch.province = body.province.trim();
      }
      if (body.difficultyKey !== undefined) {
        // '' = kesulitan belum ditentukan (impor katalog tanpa data
        // kesulitan); tetap valid supaya baris impor bisa diedit.
        if (
          body.difficultyKey !== "" &&
          !(DIFFICULTY_KEYS as readonly string[]).includes(body.difficultyKey as string)
        ) {
          throw badReq("INVALID_PAYLOAD");
        }
        patch.difficultyKey = body.difficultyKey;
      }
      if (body.imageUrl !== undefined) {
        if (body.imageUrl !== null && typeof body.imageUrl !== "string") throw badReq("INVALID_PAYLOAD");
        patch.imageUrl = body.imageUrl;
      }
      if (body.volcanoActive !== undefined) {
        if (typeof body.volcanoActive !== "boolean") throw badReq("INVALID_PAYLOAD");
        patch.volcanoActive = body.volcanoActive;
      }
      if (body.isActive !== undefined) {
        if (typeof body.isActive !== "boolean") throw badReq("INVALID_PAYLOAD");
        patch.isActive = body.isActive;
      }
      if (body.description !== undefined) {
        if (body.description !== null && typeof body.description !== "string") throw badReq("INVALID_PAYLOAD");
        patch.description = body.description;
      }
      if (body.lat !== undefined) {
        if (body.lat !== null && !isNum(body.lat)) throw badReq("INVALID_PAYLOAD");
        patch.lat = body.lat;
      }
      if (body.lon !== undefined) {
        if (body.lon !== null && !isNum(body.lon)) throw badReq("INVALID_PAYLOAD");
        patch.lon = body.lon;
      }
      const existing = await db.mountainById(param(req, "id"));
      if (!existing) throw notFound2();
      const mountain = await db.updateMountain(param(req, "id"), patch);
      res.json({ data: { mountain } });
    })().catch(next);
  });

  // Upload gambar gunung (admin-only): multipart field "image"
  // (jpg/png/webp/gif, maks 5 MB). File disimpan di disk API dan
  // disajikan di /uploads/mountains/*; imageUrl gunung diperbarui ke
  // URL absolut hasil upload, file upload lama gunung itu dihapus.
  r.post("/:id/image", requireAdmin, (req, res, next) => {
    mountainImageUpload.single("image")(req, res, (err) => {
      if (err) return next(badReq("INVALID_IMAGE"));
      (async () => {
        const file = (
          req as typeof req & {
            file?: { buffer: Uint8Array; mimetype: string };
          }
        ).file;
        const existing = await db.mountainById(param(req, "id"));
        if (!existing) throw notFound2();
        if (!file) throw badReq("INVALID_IMAGE");
        const saved = saveMountainImageFile(param(req, "id"), file);
        deleteOldMountainImage(existing.imageUrl);
        const imageUrl = mountainImageUrl(req, saved.filename);
        const mountain = await db.updateMountain(param(req, "id"), { imageUrl });
        res.json({ data: { mountain } });
      })().catch(next);
    });
  });

  r.delete("/:id", requireAdmin, (req, res, next) => {
    (async () => {
      const existing = await db.mountainById(param(req, "id"));
      if (!existing) throw notFound2();
      await db.deleteMountain(param(req, "id"));
      res.json({ data: { deleted: true } });
    })().catch(next);
  });

  return r;
}
