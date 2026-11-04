// M6 live-tracking alerts — pure evaluation logic for
// GET /trip-groups/:id/member-alerts (server-side, computed on read).
//
// Design (stateless, no alert table):
// - The endpoint derives alerts from stored Location rows on every read,
//   so a member appears at most once per alert type per response — that
//   IS the anti-flood rule (1/member/event): while a condition persists
//   the same single row is returned, and a new row only reappears after
//   the condition clears and then re-qualifies.
// - NO_MOVEMENT vs signal loss are partitioned by freshness: the window
//   is anchored at the member's latest accepted position, and that latest
//   position must itself be fresh (not older than the signal-loss
//   threshold). A stationary member who keeps sending updates is fresh,
//   so it gets NO_MOVEMENT and never signal loss; a silent member has a
//   stale latest position, so it gets signal loss and never NO_MOVEMENT.
//   The window length intentionally equals config.signalLossMinutes so
//   the partition stays exact if the threshold ever changes (PRD locks
//   both at 10 minutes today).
// - OFF_ROUTE needs 2 CONSECUTIVE accepted positions beyond 100 m from
//   the checkpoint polyline (checkpoints in createdAt order — the
//   Checkpoint model has no ordering field). No checkpoints means the
//   alert is inapplicable, never raised.
// - Distances use the haversine formula for point-to-point and an
//   equirectangular projection for point-to-segment; at the 25 m /
//   100 m scales involved the projection error is centimetres.
import { config } from "./config.js";

// GPS drift guard: positions within this radius of the window's first
// position count as "the same place" (spec §1).
export const SAME_PLACE_RADIUS_M = 25;
// Off-route threshold (spec §2).
export const OFF_ROUTE_DISTANCE_M = 100;
// Consecutive off-route updates required before firing (spec §2).
export const OFF_ROUTE_CONSECUTIVE = 2;

const EARTH_RADIUS_M = 6_371_000;

export type AlertPoint = { lat: number; lon: number };
export type AlertPosition = AlertPoint & { ts: string };

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function pointToSegmentMeters(p: AlertPoint, a: AlertPoint, b: AlertPoint): number {
  // Equirectangular projection around the segment midpoint.
  const lat0 = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const toXY = (pt: AlertPoint) => ({
    x: EARTH_RADIUS_M * ((pt.lon * Math.PI) / 180) * Math.cos(lat0),
    y: EARTH_RADIUS_M * ((pt.lat * Math.PI) / 180),
  });
  const px = toXY(p);
  const ax = toXY(a);
  const bx = toXY(b);
  const dx = bx.x - ax.x;
  const dy = bx.y - ax.y;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px.x - ax.x) * dx + (px.y - ax.y) * dy) / lenSq));
  const cx = ax.x + t * dx;
  const cy = ax.y + t * dy;
  return Math.hypot(px.x - cx, px.y - cy);
}

// Distance from a point to the checkpoint polyline, or null when the
// trip has no checkpoints (off-route inapplicable).
export function distanceToPolylineMeters(
  p: AlertPoint,
  checkpoints: AlertPoint[],
): number | null {
  if (checkpoints.length === 0) return null;
  if (checkpoints.length === 1) {
    return haversineMeters(p.lat, p.lon, checkpoints[0]!.lat, checkpoints[0]!.lon);
  }
  let best = Infinity;
  for (let i = 0; i + 1 < checkpoints.length; i++) {
    best = Math.min(best, pointToSegmentMeters(p, checkpoints[i]!, checkpoints[i + 1]!));
  }
  return best;
}

// True when the member's accepted positions spanning >= the window all
// lie within SAME_PLACE_RADIUS_M of the window's first position.
// `positions` may be in any order; the window is the span ending at the
// latest position, and the latest position must be fresh (see header).
export function isNoMovement(positions: AlertPosition[], nowMs: number): boolean {
  if (positions.length < 2) return false;
  const windowMs = config.signalLossMinutes * 60_000;
  const sorted = [...positions].sort((x, y) => Date.parse(x.ts) - Date.parse(y.ts));
  const latest = sorted[sorted.length - 1]!;
  const latestMs = Date.parse(latest.ts);
  // Stale latest = signal-loss territory, never NO_MOVEMENT.
  if (nowMs - latestMs > windowMs) return false;
  const window = sorted.filter((l) => Date.parse(l.ts) >= latestMs - windowMs);
  const first = window[0]!;
  // The window must actually span >= the full window, so a member who
  // just joined does not instantly alert.
  if (latestMs - Date.parse(first.ts) < windowMs) return false;
  return window.every(
    (l) => haversineMeters(first.lat, first.lon, l.lat, l.lon) <= SAME_PLACE_RADIUS_M,
  );
}

// True when the last OFF_ROUTE_CONSECUTIVE accepted positions are all
// beyond OFF_ROUTE_DISTANCE_M from the polyline. Fewer positions, or no
// checkpoints, never fires.
export function isOffRoute(
  lastPositions: AlertPoint[],
  checkpoints: AlertPoint[],
): boolean {
  if (lastPositions.length < OFF_ROUTE_CONSECUTIVE) return false;
  const tail = lastPositions.slice(-OFF_ROUTE_CONSECUTIVE);
  return tail.every((p) => {
    const d = distanceToPolylineMeters(p, checkpoints);
    return d !== null && d > OFF_ROUTE_DISTANCE_M;
  });
}
