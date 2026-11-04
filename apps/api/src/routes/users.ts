// Public profile route — mobile public-profile screen (31-screen mockup).
// Shows only what the privacy policy allows on a public profile: name,
// verification status, aggregate stats, and finished-trip history.
// Email, phone, live location, and ongoing trips NEVER appear here.
import { Router } from "express";
import { requireAuth } from "../auth.js";
import type { Db } from "../db.js";
import { notFound } from "../errors.js";

export function usersRouter(db: Db): Router {
  const r = Router();

  r.get("/users/:slug/profile", requireAuth, (req, res, next) => {
    (async () => {
      const slug = typeof req.params.slug === "string" ? req.params.slug : "";
      const user = await db.userBySlug(slug);
      if (!user) throw notFound("USER_NOT_FOUND");
      const memberships = await db.tripsOfUser(user.id);
      const finished = memberships.filter((t) => t.status === "CLOSED");
      res.json({
        data: {
          profile: {
            id: user.id,
            name: user.name,
            slug: user.slug,
            isVerified: user.isVerified,
            stats: {
              totalTrips: memberships.length,
              finishedTrips: finished.length,
            },
            finishedTrips: finished.map((t) => ({
              id: t.id,
              name: t.name,
              type: t.type,
              date: t.date,
            })),
          },
        },
      });
    })().catch(next);
  });

  // A-5 §13: daftar rating seorang organizer + rata-rata.
  r.get("/users/:id/ratings", requireAuth, (req, res, next) => {
    (async () => {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const user = await db.userById(id);
      if (!user) throw notFound("USER_NOT_FOUND");
      res.json({ data: await db.ratingsOf(id) });
    })().catch(next);
  });

  // A-5 §4: SOS lintas-trip milik user.
  // my-alerts = SOS yang saya terima (trip saya, pengirim orang lain);
  // stats = hitungan kirim/aktif/selesai/terima.
  r.get("/sos/my-alerts", requireAuth, (req, res, next) => {
    (async () => {
      res.json({ data: { alerts: await db.sosReceivedBy(req.user!.id) } });
    })().catch(next);
  });

  r.get("/sos/stats", requireAuth, (req, res, next) => {
    (async () => {
      res.json({ data: { stats: await db.sosStats(req.user!.id) } });
    })().catch(next);
  });

  return r;
}
