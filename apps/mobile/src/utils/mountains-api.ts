// Klien katalog gunung — kontrak §10 (A-5): daftar gunung + detail
// gunung beserta jalurnya. Sumber kebenaran = DB server (API seed
// otomatis tiap boot); katalog statis utils/mountains.ts hanya dipakai
// wizard buat trip dan tidak dipakai layar ini.
import { apiRequest } from "./api-client";
import type { RouteCheckpoint } from "./route-checkpoint-kind";

export interface MountainRoutePost {
  lat: number | null;
  lon: number | null;
  isGathering?: boolean;
}

export interface MountainRoute {
  id: string;
  mountainId: string;
  name: string;
  meetingPoint: string;
  // Dikirim server (mountainById) tapi belum dipakai klien sampai
  // cuaca tujuan: pos jalur untuk fallback koordinat gunung.
  posts?: MountainRoutePost[];
  // null = unknown (catalog import); render as an em dash, never 0.
  distanceKm: number | null;
  gainM: number | null;
  estHours: number | null;
  recommended: boolean;
}

export interface Mountain {
  id: string;
  name: string;
  elevationM: number;
  location: string;
  difficultyKey: string;
  // Foto katalog (Wikimedia Commons, diisi admin); null = belum ada
  // foto -> kartu wizard menampilkan kotak warna fallback.
  imageUrl: string | null;
}

export interface MountainDetail extends Mountain {
  // Dikirim server (mountainById, spread baris Mountain + routeCount);
  // tidak ada perubahan API untuk PR ini — semua field ini sudah
  // dikirim GET /mountains/:id sejak awal.
  // province "" = tidak diisi di DB -> blok info menyembunyikannya.
  province: string;
  // description null/kosong = tidak ada deskripsi -> tidak dirender,
  // jangan pernah mengarang deskripsi.
  description: string | null;
  // true = ditandai gunung api aktif di DB. false tidak dirender
  // sebagai "tidak aktif" (nilai default skema, bukan status terverifikasi).
  volcanoActive: boolean;
  // Jumlah jalur dari relasi routes di DB (bukan kolom tersimpan).
  routeCount: number;
  // Dikirim server (mountainById, seed MDPL dari titik awal track);
  // null = gunung tanpa koordinat -> cuaca disembunyikan (fail-soft).
  lat: number | null;
  lon: number | null;
  routes: MountainRoute[];
}

export async function fetchMountains(): Promise<Mountain[]> {
  const data = await apiRequest<{ mountains: Mountain[] }>("/mountains");
  return data.mountains;
}

export async function fetchMountain(mountainId: string): Promise<MountainDetail> {
  const data = await apiRequest<{ mountain: MountainDetail }>(
    `/mountains/${mountainId}`,
  );
  return data.mountain;
}

// Detail satu jalur — bentuk ASLI server (endpoint yang sama dipakai
// web, GET /mountains/:id/routes/:routeId). PERHATIAN: ini TIDAK
// sama dengan MountainRoute di atas — server mengirim posts sebagai
// array NAMA (string), dan objek berkoordinat hidup di checkpoints
// (difilter server: hanya pos yang punya lat/lon). Jangan pakai
// MountainRoutePost (bentuk lama yang tidak dikirim server) untuk
// layar ini.
export interface MountainRouteDetail {
  id: string;
  mountainId: string;
  name: string;
  meetingPoint: string;
  distanceKm: number | null;
  gainM: number | null;
  estHours: number | null;
  recommended: boolean;
  // MultiLineString [lon, lat, elev?]; null = jalur belum punya track.
  track: number[][][] | null;
  posts: string[];
  checkpoints: RouteCheckpoint[];
}

export async function fetchMountainRoute(
  mountainId: string,
  routeId: string,
): Promise<MountainRouteDetail> {
  const data = await apiRequest<{ route: MountainRouteDetail }>(
    `/mountains/${mountainId}/routes/${routeId}`,
  );
  return data.route;
}
