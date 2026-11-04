// Adaptor katalog gunung API -> bentuk katalog wizard.
// Wizard buat trip memakai API §10 (katalog MDPL shifted di server)
// sebagai satu-satunya sumber; katalog statis dihapus 3 Nov 2026
// (perintah "jangan ada yang palsu"), jadi tidak ada lagi fallback
// ke data contoh saat API gagal.
// Format angka memakai gaya Indonesia (titik ribuan, koma desimal).
import type {
  Mountain as ApiMountain,
  MountainDetail as ApiMountainDetail,
  MountainRoute as ApiMountainRoute,
} from "./mountains-api";
import type { Mountain, MountainRoute } from "./mountains";

function idNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatElevation(elevationM: number): string {
  return `${idNumber(elevationM)} mdpl`;
}

export function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null) return "—";
  return `${distanceKm.toString().replace(".", ",")} km`;
}

export function formatGain(gainM: number | null): string {
  if (gainM === null) return "—";
  return `+${idNumber(gainM)} m`;
}

export function formatDuration(estHours: number | null): string {
  if (estHours === null) return "—";
  if (estHours < 24) return `${estHours.toString().replace(".", ",")} jam`;
  const days = Math.floor(estHours / 24);
  const rest = estHours % 24;
  return rest === 0 ? `${days} hari` : `${days} hari ${rest} jam`;
}

export function apiRouteToCatalog(r: ApiMountainRoute): MountainRoute {
  return {
    id: r.id,
    name: r.name,
    meetingPoint: r.meetingPoint,
    distance: formatDistance(r.distanceKm),
    gain: formatGain(r.gainM),
    duration: formatDuration(r.estHours),
    recommended: r.recommended,
  };
}

export function apiMountainToCatalog(m: ApiMountainDetail): Mountain {
  return {
    id: m.id,
    name: m.name,
    elevation: formatElevation(m.elevationM),
    location: m.location,
    difficultyKey: m.difficultyKey || "wizard.diffBeginner",
    imageUrl: m.imageUrl ?? null,
    routes: m.routes.map(apiRouteToCatalog),
  };
}

export function apiMountainListToCatalog(m: ApiMountain): Mountain {
  return {
    id: m.id,
    name: m.name,
    elevation: formatElevation(m.elevationM),
    location: m.location,
    difficultyKey: m.difficultyKey || "wizard.diffBeginner",
    imageUrl: m.imageUrl ?? null,
    routes: [],
  };
}
