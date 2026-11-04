// JWT auth (jsonwebtoken, verified signature — never a decoded-only stub).
// Passwords hashed with Bun.password (bcrypt). Secrets come from env only.
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { ApiError, forbidden, notFound, unauthorized } from "./errors.js";
import type { Db } from "./db.js";
import type { Trip, User, StaffRole } from "./store.js";

export interface AuthUser {
  id: string;
  isAdmin: boolean;
  // Role hint from the JWT claim (may be absent on pre-RBAC tokens).
  // Authorization never trusts this alone — see requireRole and
  // isDashboardRole, which read the role from the store.
  role?: StaffRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      trip?: Trip;
    }
  }
}

export function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

// A-2: access token pendek — 15 menit (sebelumnya 7 hari, temuan W-1).
// Sesi panjang hidup lewat refresh token rotasi (routes/auth.ts).
// Kontrak-baca: ACCESS_TOKEN_TTL 15m hanya sesi API; sesi juri magic link
// dipangkas ke tenggat pengumuman bila kurang dari 15 menit.
export const ACCESS_TOKEN_TTL = "15m";

export function signToken(user: User): string {
  return jwt.sign(
    { sub: user.id, isAdmin: user.isAdmin, role: user.role },
    config.jwtSecret,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

// Varian dengan masa berlaku eksplisit (detik) — dipakai sesi magic
// link juri yang harus mati tepat di tenggat pengumuman, bukan 15 menit
// penuh bila tenggat lebih dekat (mis. refresh 5 menit sebelum tenggat).
export function signTokenWithExpiry(user: User, expiresInSeconds: number): string {
  return jwt.sign(
    { sub: user.id, isAdmin: user.isAdmin, role: user.role },
    config.jwtSecret,
    { expiresIn: Math.max(1, Math.floor(expiresInSeconds)) },
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      sub?: string;
      isAdmin?: boolean;
      role?: StaffRole;
    };
    if (typeof payload.sub !== "string") return next(unauthorized());
    req.user = {
      id: payload.sub,
      isAdmin: payload.isAdmin === true,
      role: payload.role,
    };
    return next();
  } catch {
    return next(unauthorized("INVALID_TOKEN"));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized());
  if (!req.user.isAdmin) return next(forbidden("ADMIN_ONLY"));
  return next();
}

/**
 * DB-backed role gate. The caller's role is read from the user row,
 * never from the JWT claim: a pre-RBAC token (no role claim) still
 * authorizes correctly via the DB fallback, and a forged claim cannot
 * escalate. Unknown user → unauthorized (the account may have been
 * deleted); known user with the wrong role → forbidden.
 */
// SET-6: maintenance mode — saat aktif, semua endpoint member ditutup
// 503 MAINTENANCE_MODE. Yang tetap jalan: /health, /auth (admin harus
// bisa login untuk mematikan mode), dan akun berperan dashboard
// (admin | command_center, dibaca dari DB seperti requireRole).
export function maintenanceGate(db: Db) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (async () => {
      const settings = await db.platformSettings();
      if (!settings.maintenanceMode) return next();
      // Gate dipasang SEBELUM router (sebelum requireAuth), jadi token
      // dibaca sendiri di sini — toleran: token rusak/absen cukup jatuh
      // ke 503, endpoint-nya sendiri tetap menegakkan auth.
      const header = req.headers.authorization ?? "";
      const raw = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (raw) {
        try {
          const payload = jwt.verify(raw, config.jwtSecret) as { sub?: string };
          if (typeof payload.sub === "string") {
            const user = await db.userById(payload.sub);
            if (user && (user.role === "admin" || user.role === "command_center")) {
              return next();
            }
          }
        } catch {
          // Token tidak valid — jatuh ke 503 di bawah.
        }
      }
      next(new ApiError(503, "MAINTENANCE_MODE"));
    })().catch(next);
  };
}

export function requireRole(db: Db, ...roles: StaffRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    db.roleOf(req.user.id)
      .then((role) => {
        if (role === null) return next(unauthorized());
        if (!roles.includes(role)) return next(forbidden("ADMIN_ONLY"));
        return next();
      })
      .catch(next);
  };
}

/**
 * Load trip + membership. Attach req.trip; 404 TRIP_NOT_FOUND ketika
 * trip tidak ada (kontrak §19), 403 NOT_TRIP_MEMBER / LEADER_ONLY
 * hanya untuk masalah keanggotaan/peran.
 * allowAdminRead (M3F, extended by RBAC): dashboard roles (admin +
 * command_center) may READ a trip they are not a member of
 * (posko dashboard oversight). It is a read-only bypass and must
 * ONLY be passed on GET routes — writes keep strict member/leader rules,
 * and non-dashboard behavior is identical with or without it.
 */
export function tripGuard(db: Db, needLeader = false, allowAdminRead = false) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (async () => {
      const trip = await db.tripById(param(req, "id"));
      if (!trip) return next(notFound("TRIP_NOT_FOUND"));
      if (allowAdminRead && (await db.isDashboardRole(req.user?.id))) {
        req.trip = trip;
        return next();
      }
      const member = req.user ? await db.memberOf(trip.id, req.user.id) : null;
      if (!member) return next(forbidden("NOT_TRIP_MEMBER"));
      if (needLeader && member.role !== "LEADER" && trip.leaderId !== req.user?.id) {
        return next(forbidden("LEADER_ONLY"));
      }
      req.trip = trip;
      return next();
    })().catch(next);
  };
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
