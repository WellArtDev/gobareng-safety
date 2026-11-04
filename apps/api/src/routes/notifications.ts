// Notification routes — contract §9 (in-app list, unread count, mark
// read). Notifications are rows written by other routes (SOS trigger,
// checkpoint check-in, new verification request); the server sends
// codes only — the client maps `kind` to i18n keys. A-1: Prisma-backed.
import { Router } from "express";
import { param, requireAuth } from "../auth.js";
import type { Db } from "../db.js";
import { notFound } from "../errors.js";

export function notificationsRouter(db: Db): Router {
  const r = Router();
  r.use(requireAuth);

  r.get("/", (req, res, next) => {
    (async () => {
      res.json({ data: { notifications: await db.userNotifications(req.user!.id) } });
    })().catch(next);
  });

  r.get("/unread-count", (req, res, next) => {
    (async () => {
      res.json({ data: { count: await db.unreadNotificationCount(req.user!.id) } });
    })().catch(next);
  });

  r.patch("/read-all", (req, res, next) => {
    (async () => {
      await db.markAllNotificationsRead(req.user!.id);
      res.json({ data: { read: true } });
    })().catch(next);
  });

  r.patch("/:id/read", (req, res, next) => {
    (async () => {
      const n = await db.notificationById(param(req, "id"));
      if (!n || n.userId !== req.user!.id) throw notFound("NOT_FOUND");
      const updated = n.readAt ? n : ((await db.markNotificationRead(n.id)) ?? n);
      res.json({ data: { notification: updated } });
    })().catch(next);
  });

  return r;
}
