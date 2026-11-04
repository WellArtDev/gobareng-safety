// Member-facing report submission (feeds the file-10 Moderasi page).
// Any signed-in user may report content; admins triage via /admin/reports.
// Reason/target strings are user data rendered as-is by the dashboard —
// never server-side UI text (contract §19).
import { Router } from "express";
import { requireAuth } from "../auth.js";
import type { Db } from "../db.js";
import { badRequest } from "../errors.js";

export function reportsRouter(db: Db): Router {
  const r = Router();
  r.use(requireAuth);

  r.post("/", (req, res, next) => {
    (async () => {
      const { targetType, targetId, reason } = req.body ?? {};
      if (typeof targetType !== "string" || !targetType.trim()) {
        throw badRequest("INVALID_PAYLOAD");
      }
      if (typeof reason !== "string" || !reason.trim()) {
        throw badRequest("INVALID_PAYLOAD");
      }
      const report = await db.createReport({
        reporterId: req.user!.id,
        targetType: targetType.trim().slice(0, 60),
        targetId: typeof targetId === "string" ? targetId : null,
        reason: reason.trim().slice(0, 500),
      });
      res.status(201).json({ data: { report } });
    })().catch(next);
  });

  return r;
}
