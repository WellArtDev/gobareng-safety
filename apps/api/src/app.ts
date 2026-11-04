// Express app factory (no listen here — index.ts owns the HTTP server
// so Socket.IO can share it). A-1: Prisma-backed Db replaces the F2
// in-memory store; `prisma migrate deploy` runs in the deploy pipeline,
// NOT here (see infra/docker-compose.yml + README).
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";
import { maintenanceGate, slugify } from "./auth.js";
import { Db } from "./db.js";
import { ApiError } from "./errors.js";
import { createRealtime, type Realtime } from "./realtime.js";
import { seedMountains } from "./seed-mountains.js";
import { uploadsDir } from "./uploads.js";
import { authRouter } from "./routes/auth.js";
import { accountVerificationRouter } from "./routes/account-verification.js";
import { adminRouter } from "./routes/admin.js";
import { mountainsRouter } from "./routes/mountains.js";
import { glimmerRouter } from "./routes/glimmer.js";
import { communitiesRouter } from "./routes/communities.js";
import { commandCenterRouter } from "./routes/command-center.js";
import { notificationsRouter } from "./routes/notifications.js";
import { pushTokensRouter } from "./routes/push-tokens.js";
import { reportsRouter } from "./routes/reports.js";
import { sharedRouter } from "./routes/shared.js";
import { usersRouter } from "./routes/users.js";
import { weatherRouter } from "./routes/weather.js";
import { tripsRouter } from "./routes/trips.js";
import { generalSosRouter } from "./routes/general-sos.js";
import { voiceSosRouter } from "./routes/voice-sos.js";
import { sosPhotosRouter } from "./routes/sos-photos.js";
import type { Server as HttpServer } from "node:http";

export function createApp(db = new Db()): {
  app: express.Express;
  attachRealtime: (http: HttpServer) => Realtime;
  // Selesai saat seed admin (kalau aktif) sudah masuk DB. index.ts
  // menunggu ini sebelum listen, jadi tidak ada request yang bisa datang
  // sebelum seed selesai. Sengaja Promise, bukan top-level await: container
  // fork Bun di PM2 memuat entry lewat require() dan menolak modul TLA.
  ready: Promise<void>;
} {
  // Admin seed dari env (lihat config.ts). Idempotent: hanya dibuat kalau
  // BELUM ADA admin sama sekali; restart tidak membuat duplikat dan
  // tidak mengubah password akun yang sudah ada. Perubahan 1 Nov 2026:
  // dulu seed membuat admin baru bila email env tidak ditemukan — itu
  // menciptakan admin kedua dengan email lama setelah admin mengganti
  // emailnya lewat PATCH /me. Sekarang ada admin mana pun = skip.
  const ready = (async () => {
    if (config.adminEmail && config.adminPassword && !(await db.hasAnyAdmin())) {
      const existing = await db.userByEmail(config.adminEmail);
      if (!existing) {
        const name = config.adminName.trim() || "Admin";
        await db.createUser({
          email: config.adminEmail,
          name,
          slug: await db.uniqueSlug(slugify(name) || "admin"),
          // Seed admin login pakai OTP (seperti semua peran) — tidak
          // ada lagi password yang disimpan. ADMIN_PASSWORD tetap
          // disyaratkan sebagai saklar aktif seed (perilaku lama),
          // tapi nilainya tidak pernah di-hash/disimpan.
          passwordHash: null,
          phone: null,
          isAdmin: true,
          role: "admin",
          isVerified: true,
        });
        console.log(`[api] admin seeded: ${config.adminEmail}`);
      }
    }
    // A-5 §10: katalog gunung selalu tersedia (upsert idempotent).
    await seedMountains(db);
  })();
  // Holder shared with tripsRouter: routes call holder.toTrip, and
  // attachRealtime fills the holder with the real Socket.IO broadcaster.
  // Before attach, broadcasts are no-ops (server not listening yet).
  const realtimeHolder: Realtime = { toTrip: () => undefined, toUsers: () => undefined };
  const app = express();
  app.use(cors({ origin: config.corsOrigins }));
  // AI-V: rekaman suara (base64) melebihi limit JSON global — parser
  // khusus rute ini jalan duluan; parser global melewatinya (req._body).
  app.use("/api/v1/voice-sos", express.json({ limit: "15mb" }));
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => res.json({ data: { ok: true, service: "gobareng-api" } }));
  app.get("/api/v1/health", (_req, res) => res.json({ data: { ok: true, service: "gobareng-api" } }));

  // Gambar upload katalog gunung — publik, tanpa gate (sama seperti
  // aset login yang dipakai seed); file yang tidak ada jatuh ke 404.
  // Allowlist publik /uploads: mountains/ (katalog, seed + upload
  // admin), avatars/ (foto profil user), qris/ (gambar QRIS Pro),
  // sos/ (foto SOS, nama file acak tak tertebak). Di luar itu TIDAK
  // ada yang disajikan — KTP privat di identity-documents/ sengaja di
  // luar uploadsDir supaya tak pernah bisa diakses lewat URL.
  app.use("/uploads", express.static(uploadsDir));

  // SET-6: maintenance mode menutup endpoint member dengan 503.
  // /auth bebas gate supaya admin bisa login untuk mematikan mode;
  // /admin + /command-center lolos via cek peran di dalam gate.
  const gate = maintenanceGate(db);
  app.use("/api/v1/auth", authRouter(db));
  // Tanpa maintenance gate seperti /auth: link email sekali pakai +
  // kedaluwarsa tidak boleh digagalkan maintenance.
  app.use("/api/v1/account-verification", accountVerificationRouter(db));
  app.use("/api/v1/trip-groups", gate, tripsRouter(db, realtimeHolder));
  app.use("/api/v1/admin", adminRouter(db));
  app.use("/api/v1/communities", gate, communitiesRouter(db));
  app.use("/api/v1/mountains", gate, mountainsRouter(db));
  app.use("/api/v1/command-center", commandCenterRouter(db));
  app.use("/api/v1/notifications", gate, notificationsRouter(db));
  app.use("/api/v1/push-tokens", gate, pushTokensRouter(db));
  app.use("/api/v1/sos-general", gate, generalSosRouter(db, realtimeHolder));
  app.use("/api/v1/voice-sos", gate, voiceSosRouter(db, realtimeHolder));
  app.use("/api/v1/sos-photos", gate, sosPhotosRouter(db));
  app.use("/api/v1/reports", gate, reportsRouter(db));
  app.use("/api/v1", sharedRouter(db));
  app.use("/api/v1", gate, usersRouter(db));
  app.use("/api/v1/weather", gate, weatherRouter());
  app.use("/api/v1/ai", gate, glimmerRouter(db));

  app.use((_req, _res, next) => next(new ApiError(404, "NOT_FOUND")));
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });

  return {
    app,
    ready,
    attachRealtime(http: HttpServer): Realtime {
      const realtime = createRealtime(http, db);
      Object.assign(realtimeHolder, realtime);
      return realtime;
    },
  };
}
