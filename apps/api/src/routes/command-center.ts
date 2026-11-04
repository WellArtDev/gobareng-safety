// Command center (CC-1..CC-3, keputusan Wella 28 Okt 2026): the
// separate safety dashboard that watches EVERY active trip and every
// member on it. Account-gated: dashboard roles only (admin |
// command_center via requireRole — DB-backed, never the JWT claim).
// Regular users get 403 ADMIN_ONLY like other dashboard endpoints.
import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import type { Db } from "../db.js";
// AI-P: SOS di overview posko diperkaya foto + deskripsi AI.
import { withSosPhotos } from "../sos-photos-serialize.js";

export function commandCenterRouter(db: Db): Router {
  const r = Router();
  r.use(requireAuth, requireRole(db, "admin", "command_center"));

  // Cross-trip overview: every ACTIVE trip with member positions
  // (latest per member, null when none) and its not-yet-closed SOS.
  // One call paints the whole command-center map.
  r.get("/overview", (_req, res, next) => {
    (async () => {
      const activeTrips = await db.listActiveTrips();
      const trips = await Promise.all(
        activeTrips.map(async (trip) => {
          const [positions, sosRows] = await Promise.all([
            db.tripPositions(trip.id),
            db.activeSosOfTrip(trip.id),
          ]);
          const sos = await Promise.all(
            sosRows.map((s) => withSosPhotos(db, "TRIP", s)),
          );
          return { trip, positions, sos };
        }),
      );
      res.json({ data: { trips } });
    })().catch(next);
  });

  return r;
}
