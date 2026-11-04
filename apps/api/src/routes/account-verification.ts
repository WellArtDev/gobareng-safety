// Verifikasi akun dua kanal — endpoint. Terpisah dari verifikasi
// organizer (tidak ada baca/tulis isVerified / OrganizerVerification di
// sini). GET /email/verify sengaja publik (klik dari email, bisa dalam
// keadaan belum login di browser) dan me-mount TANPA maintenance gate
// seperti /auth — link sekali pakai + kedaluwarsa tidak boleh digagalkan
// maintenance. Endpoint lain memakai requireAuth.
import { Router } from "express";
import {
  requestEmailLink,
  requestWhatsappCode,
  verificationStatus,
  verifyEmailLink,
  verifyWhatsappCode,
} from "../account-verification.js";
import { requireAuth } from "../auth.js";
import type { Db } from "../db.js";
import { unauthorized } from "../errors.js";

function page(title: string, body: string): string {
  return (
    `<!doctype html><html lang="id"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title}</title></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#111">` +
    `<h1 style="font-size:22px">${title}</h1><p>${body}</p>` +
    `<p style="color:#666">Kamu bisa kembali ke aplikasi GoBareng.</p>` +
    `</body></html>`
  );
}

const FAIL_TEXT: Record<string, string> = {
  INVALID: "Link verifikasi tidak valid.",
  USED: "Link verifikasi sudah dipakai.",
  EXPIRED:
    "Link verifikasi sudah kedaluwarsa (berlaku 24 jam). Minta link baru dari aplikasi GoBareng.",
  MISMATCH:
    "Link ini dibuat untuk alamat email lama yang sudah diganti. Minta link baru dari aplikasi GoBareng.",
};

// Host publik untuk link email: dari header yang diteruskan proxy
// produksi (X-Forwarded-*), fallback ke Host request langsung.
function publicBaseUrl(req: {
  get: (name: string) => string | undefined;
  protocol: string;
}): string {
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  return `${proto}://${host}`;
}

export function accountVerificationRouter(db: Db): Router {
  const r = Router();

  r.get("/status", requireAuth, (req, res, next) => {
    (async () => {
      const user = await db.userById(req.user!.id);
      if (!user) throw unauthorized();
      res.json({ data: verificationStatus(user) });
    })().catch(next);
  });

  r.post("/email/request", requireAuth, (req, res, next) => {
    (async () => {
      const user = await db.userById(req.user!.id);
      if (!user) throw unauthorized();
      const result = await requestEmailLink(
        db,
        user,
        publicBaseUrl(req),
      );
      res.json({ data: result });
    })().catch(next);
  });

  r.get("/email/verify", (req, res, next) => {
    (async () => {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      const result = token
        ? await verifyEmailLink(db, token)
        : { ok: false as const, reason: "INVALID" as const };
      if (!result.ok) {
        res
          .status(200)
          .type("html")
          .send(
            page(
              "Verifikasi gagal",
              FAIL_TEXT[result.reason] ?? FAIL_TEXT.INVALID,
            ),
          );
        return;
      }
      const accountOk = result.user.accountVerifiedAt !== null;
      res
        .status(200)
        .type("html")
        .send(
          page(
            "Email terverifikasi",
            accountOk
              ? "Email kamu sudah terverifikasi dan akun kamu sekarang terverifikasi."
              : "Email kamu sudah terverifikasi. Satu langkah lagi: verifikasi WhatsApp dari aplikasi GoBareng.",
          ),
        );
    })().catch(next);
  });

  r.post("/whatsapp/request", requireAuth, (req, res, next) => {
    (async () => {
      const user = await db.userById(req.user!.id);
      if (!user) throw unauthorized();
      const settings = await db.platformSettings();
      const result = await requestWhatsappCode(db, user, settings);
      res.json({ data: result });
    })().catch(next);
  });

  r.post("/whatsapp/verify", requireAuth, (req, res, next) => {
    (async () => {
      const user = await db.userById(req.user!.id);
      if (!user) throw unauthorized();
      const code = (req.body ?? {}).code;
      const result = await verifyWhatsappCode(db, user, code);
      res.json({
        data: {
          phoneVerified: result.phoneVerified,
          accountVerified: result.accountVerified,
        },
      });
    })().catch(next);
  });

  return r;
}
