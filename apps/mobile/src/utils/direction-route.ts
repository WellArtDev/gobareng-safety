// Direction in-app (3 Nov 2026): geometri rute + klien OSRM publik.
// Yang dikirim ke router HANYA koordinat asal (posisi member saat itu)
// dan tujuan (checkpoint/tujuan trip) — tidak ada data katalog mentah.
// Tanpa API key, tanpa fallback Google Maps.
import type { Attendance, Trip } from "./trips-api";
import { directionTarget, type DirectionTarget } from "./trip-direction";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Maneuver {
  type: string;
  modifier?: string;
}

export interface NavStep {
  maneuver: Maneuver;
  roadName: string;
  distanceM: number;
  location: LatLon;
}

export interface RouteResult {
  coords: LatLon[];
  distanceM: number;
  durationS: number;
  steps: NavStep[];
}

const EARTH_R = 6371000;

export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

// Proyeksi equirectangular lokal (akurat untuk jarak rute jalan kaki /
// berkendara; segmen OSRM pendek). Dipakai untuk jarak titik-ke-segmen.
function toLocal(p: LatLon, origin: LatLon): { x: number; y: number } {
  const scale = (Math.PI / 180) * EARTH_R;
  return {
    x: (p.lon - origin.lon) * Math.cos((origin.lat * Math.PI) / 180) * scale,
    y: (p.lat - origin.lat) * scale,
  };
}

function segmentProjection(
  p: LatLon,
  a: LatLon,
  b: LatLon,
): { t: number; distanceM: number; point: LatLon } {
  const pa = toLocal(p, a);
  const pb = toLocal(b, a);
  const lenSq = pb.x * pb.x + pb.y * pb.y;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (pa.x * pb.x + pa.y * pb.y) / lenSq));
  const point = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  return { t, distanceM: haversineM(p, point), point };
}

export function distanceToSegmentM(p: LatLon, a: LatLon, b: LatLon): number {
  return segmentProjection(p, a, b).distanceM;
}

export function nearestOnRoute(
  p: LatLon,
  coords: LatLon[],
): { index: number; distanceM: number } {
  let best = { index: 0, distanceM: Number.POSITIVE_INFINITY };
  for (let i = 0; i + 1 < coords.length; i += 1) {
    const d = segmentProjection(p, coords[i], coords[i + 1]).distanceM;
    if (d < best.distanceM) best = { index: i, distanceM: d };
  }
  return best;
}

export function isOffRoute(p: LatLon, coords: LatLon[], thresholdM = 60): boolean {
  if (coords.length < 2) return true;
  return nearestOnRoute(p, coords).distanceM > thresholdM;
}

// Langkah aktif = langkah terakhir yang titik awalnya sudah dilewati.
// Kemajuan posisi = indeks segmen + fraksi proyeksi (0..n-1); titik
// awal langkah = verteks rute terdekat dari lokasi langkah itu.
function progressOf(p: LatLon, coords: LatLon[]): number {
  if (coords.length < 2) return 0;
  let best = { index: 0, t: 0, distanceM: Number.POSITIVE_INFINITY };
  for (let i = 0; i + 1 < coords.length; i += 1) {
    const proj = segmentProjection(p, coords[i], coords[i + 1]);
    if (proj.distanceM < best.distanceM) {
      best = { index: i, t: proj.t, distanceM: proj.distanceM };
    }
  }
  return best.index + best.t;
}

function nearestVertexIndex(p: LatLon, coords: LatLon[]): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  coords.forEach((c, i) => {
    const d = haversineM(p, c);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function currentStepIndex(route: RouteResult, position: LatLon): number {
  if (route.steps.length === 0 || route.coords.length < 2) return -1;
  const progress = progressOf(position, route.coords);
  let current = 0;
  route.steps.forEach((step, i) => {
    if (nearestVertexIndex(step.location, route.coords) <= progress) current = i;
  });
  return current;
}

// Sisa jarak dari proyeksi posisi ke ujung rute.
export function remainingDistanceM(route: RouteResult, position: LatLon): number {
  if (route.coords.length < 2) return 0;
  let best = { index: 0, point: route.coords[0], distanceM: Number.POSITIVE_INFINITY };
  for (let i = 0; i + 1 < route.coords.length; i += 1) {
    const proj = segmentProjection(position, route.coords[i], route.coords[i + 1]);
    if (proj.distanceM < best.distanceM) {
      best = { index: i, point: proj.point, distanceM: proj.distanceM };
    }
  }
  let rest = haversineM(best.point, route.coords[best.index + 1]);
  for (let j = best.index + 1; j + 1 < route.coords.length; j += 1) {
    rest += haversineM(route.coords[j], route.coords[j + 1]);
  }
  return rest;
}

export function navStepKey(maneuver: Maneuver): string {
  const type = maneuver.type;
  const mod = maneuver.modifier ?? "";
  if (type === "depart") return "direction.depart";
  if (type === "arrive") return "direction.arrive";
  if (type === "roundabout" || type === "rotary") return "direction.roundabout";
  if (type === "turn") {
    if (mod === "left") return "direction.turnLeft";
    if (mod === "right") return "direction.turnRight";
    if (mod === "slight left") return "direction.slightLeft";
    if (mod === "slight right") return "direction.slightRight";
    if (mod === "sharp left") return "direction.sharpLeft";
    if (mod === "sharp right") return "direction.sharpRight";
    if (mod === "uturn") return "direction.uturn";
  }
  return "direction.continue";
}

export function formatDistance(m: number, decimalSep: "," | "."): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace(".", decimalSep)} km`;
}

// Target direction mengikuti status check-in (aturan pemilik 17:03):
// sebelum check-in -> entry yang diketuk (checkpoint / titik kumpul);
// sesudah check-in (DEPARTED) -> tujuan trip bila ada koordinatnya,
// bila tidak tetap entry. Entry meeting mendelegasikan ke directionTarget.
export type DirectionEntry =
  | { kind: "meeting" }
  | { kind: "checkpoint"; lat: number; lon: number; label: string };

export function entryDirectionTarget(
  trip: Trip,
  attendance: Attendance | null,
  entry: DirectionEntry,
): DirectionTarget | null {
  if (
    attendance === "DEPARTED" &&
    trip.destinationLat !== null &&
    trip.destinationLat !== undefined &&
    trip.destinationLon !== null &&
    trip.destinationLon !== undefined
  ) {
    return {
      lat: trip.destinationLat,
      lon: trip.destinationLon,
      label: trip.destination ?? "Tujuan trip",
    };
  }
  if (entry.kind === "checkpoint") {
    return { lat: entry.lat, lon: entry.lon, label: entry.label };
  }
  return directionTarget(trip, attendance);
}

export class RouteFetchError extends Error {
  kind: "network" | "no-route";
  constructor(kind: "network" | "no-route") {
    super(kind);
    this.kind = kind;
  }
}

function isFinitePair(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

export async function fetchOsrmRoute(
  from: LatLon,
  to: LatLon,
  fetchFn: typeof fetch = fetch,
): Promise<RouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lon},${from.lat};${to.lon},${to.lat}` +
    `?overview=full&geometries=geojson&steps=true`;
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch {
    throw new RouteFetchError("network");
  }
  if (!res.ok) throw new RouteFetchError("network");
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new RouteFetchError("network");
  }
  const first = (json as { routes?: unknown[] }).routes?.[0] as
    | {
        distance?: unknown;
        duration?: unknown;
        geometry?: { coordinates?: unknown };
        legs?: Array<{ steps?: Array<Record<string, unknown>> }>;
      }
    | undefined;
  if (!first || typeof first.distance !== "number" || typeof first.duration !== "number") {
    throw new RouteFetchError("no-route");
  }
  const rawCoords = first.geometry?.coordinates;
  if (!Array.isArray(rawCoords) || rawCoords.length < 2 || !rawCoords.every(isFinitePair)) {
    throw new RouteFetchError("no-route");
  }
  const coords = (rawCoords as [number, number][]).map(([lon, lat]) => ({ lat, lon }));
  const steps: NavStep[] = (first.legs ?? []).flatMap((leg) =>
    (leg.steps ?? []).flatMap((s) => {
      const man = s.maneuver as { type?: unknown; modifier?: unknown } | undefined;
      const loc = s.location as unknown;
      if (typeof man?.type !== "string" || !isFinitePair(loc)) return [];
      return [
        {
          maneuver: {
            type: man.type,
            ...(typeof man.modifier === "string" ? { modifier: man.modifier } : {}),
          },
          roadName: typeof s.name === "string" ? s.name : "",
          distanceM: typeof s.distance === "number" ? s.distance : 0,
          location: { lat: (loc as [number, number])[1], lon: (loc as [number, number])[0] },
        },
      ];
    }),
  );
  return { coords, distanceM: first.distance, durationS: first.duration, steps };
}
