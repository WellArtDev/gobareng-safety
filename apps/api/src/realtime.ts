// Socket.IO realtime — contract §11. JWT auth on handshake, trip rooms.
// A-6: Redis adapter aktif saat REDIS_URL diset — broadcast menjangkau
// semua instance (kontrak §11 "wajib dari hari pertama" multi-instance).
// Tanpa REDIS_URL (tes lokal / single instance) jatuh ke adapter
// in-memory dengan peringatan. Target per-user memakai room user:<id>,
// bukan map socket in-memory — map tidak terlihat lintas instance.
import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { config } from "./config.js";
import type { Db } from "./db.js";

export interface Realtime {
  toTrip(tripId: string, event: string, payload: unknown): void;
  // Targeted emit to specific connected users (bystander dispatch, M2).
  // Users with no live socket simply receive nothing — never an error.
  toUsers(userIds: string[], event: string, payload: unknown): void;
}

export function createRealtime(http: HttpServer, db: Db): Realtime {
  const io = new Server(http, { cors: { origin: config.corsOrigins } });

  // A-6: Redis adapter bila REDIS_URL diset. Koneksi berjalan async di
  // belakang — sampai tersambung, broadcast memakai adapter in-memory
  // (perilaku lama), lalu otomatis pindah saat adapter terpasang.
  if (config.redisUrl) {
    const pub = createClient({ url: config.redisUrl });
    const sub = pub.duplicate();
    // Tanpa handler error, kegagalan Redis meledakkan proses — realtime
    // harus fail-soft: REST tetap sumber kebenaran (kontrak §11 F2).
    pub.on("error", (e) => console.error("[realtime] redis pub error:", e.message));
    sub.on("error", (e) => console.error("[realtime] redis sub error:", e.message));
    void Promise.all([pub.connect(), sub.connect()])
      .then(() => {
        io.adapter(createAdapter(pub, sub));
        console.log("[realtime] Redis adapter attached");
      })
      .catch((e: Error) => {
        console.error(
          `[realtime] Redis adapter DISABLED (connect failed: ${e.message}) — single-instance only`,
        );
      });
  } else {
    console.warn("[realtime] REDIS_URL unset — in-memory adapter (single instance only)");
  }

  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? "";
    if (!token) return next(new Error("UNAUTHORIZED"));
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { sub?: string };
      if (typeof payload.sub !== "string") return next(new Error("UNAUTHORIZED"));
      socket.data.userId = payload.sub;
      return next();
    } catch {
      return next(new Error("INVALID_TOKEN"));
    }
  });

  io.on("connection", (socket) => {
    // A-6: tiap socket masuk room user:<id> — target per-user (toUsers)
    // kini berjalan lewat adapter, jadi menjangkau socket di instance
    // lain; map socket in-memory yang lama tidak lintas instance.
    const userId = socket.data.userId as string;
    void socket.join(`user:${userId}`);
    socket.on("join-trip", (body: { tripId?: string }) => {
      const tripId = body?.tripId;
      if (typeof tripId !== "string") return;
      // Mirror of the REST read bypass (auth.ts tripGuard, RBAC §14b):
      // dashboard roles monitor every trip's live room from posko;
      // everyone else must be a trip member. Without this, the web
      // dashboard silently received no live broadcasts for trips the
      // admin is not a member of.
      const userId = socket.data.userId as string;
      void (async () => {
        if ((await db.memberOf(tripId, userId)) || (await db.isDashboardRole(userId))) {
          socket.join(`trip:${tripId}`);
        }
      })();
    });
    socket.on("leave-trip", (body: { tripId?: string }) => {
      if (typeof body?.tripId === "string") socket.leave(`trip:${body.tripId}`);
    });
    // Deliberately NO client->server location-update / sos-trigger forwarding:
    // REST is the source of truth in F2 (validated, stored, then broadcast
    // by the server). Forwarding raw client events would bypass validation.
    // Contract §11 client->server events are therefore REST-backed in F2.
  });

  return {
    toTrip(tripId: string, event: string, payload: unknown): void {
      io.to(`trip:${tripId}`).emit(event, payload);
    },
    toUsers(userIds: string[], event: string, payload: unknown): void {
      for (const userId of userIds) {
        io.to(`user:${userId}`).emit(event, payload);
      }
    },
  };
}
