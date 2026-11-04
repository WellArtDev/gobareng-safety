// Push token registration (M2, FCM saja) — HP mendaftarkan token
// device native saat login / app start / token refresh.
// Satu token per user; daftar ulang menimpa.
import { Router } from "express";
import { requireAuth } from "../auth.js";
import type { Db } from "../db.js";
import { badRequest } from "../errors.js";
import { normalizeDeviceTokenPayload } from "../push.js";

export function pushTokensRouter(db: Db): Router {
  const r = Router();
  r.use(requireAuth);

  r.post("/", (req, res, next) => {
    (async () => {
      let deviceToken: string;
      try {
        deviceToken = normalizeDeviceTokenPayload(
          (req.body ?? {}) as Record<string, unknown>,
        ).deviceToken;
      } catch {
        throw badRequest("INVALID_PAYLOAD");
      }
      await db.upsertPushToken(req.user!.id, deviceToken);
      res.json({ data: { registered: true } });
    })().catch(next);
  });

  return r;
}
