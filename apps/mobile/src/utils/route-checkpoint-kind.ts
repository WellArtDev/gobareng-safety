// Jenis checkpoint jalur — CERMIN PERSIS web
// (apps/web/src/lib/route-checkpoint-type.ts): tiga keranjang saja
// supaya legenda tetap ringkas; tag MDPL lain (Basecamp, Shelter,
// WaterSource, Gate, dll.) digolongkan Pos. Precedence: Puncak menang
// atas CampArea, isTarget admin juga dihitung Puncak.
export type CheckpointKind = "post" | "camp" | "peak";

export function checkpointKind(
  tags: string[] | null | undefined,
  isTarget?: boolean,
): CheckpointKind {
  if (isTarget) return "peak";
  const list = tags ?? [];
  if (list.includes("Peak")) return "peak";
  if (list.includes("CampArea")) return "camp";
  return "post";
}

// Hijau Pos = warna lama; oranye = brand GoBareng; emas = warna role
// LEADER yang sudah ada (bukan merah SOS #e11d48).
export function checkpointMarkerColor(kind: CheckpointKind): string {
  if (kind === "peak") return "#f5c518";
  if (kind === "camp") return "#f78308";
  return "#268c4a";
}

// Satu checkpoint berkoordinat dari endpoint detail jalur
// (GET /mountains/:id/routes/:routeId).
export interface RouteCheckpoint {
  name: string;
  order: number;
  lat: number;
  lon: number;
  elevationM: number | null;
  autoCheckpoint: boolean;
  isTarget: boolean;
  tags: string[];
  isGathering: boolean;
}

export interface RouteCheckpointRow {
  name: string;
  checkpoint: RouteCheckpoint | null;
  kind: CheckpointKind;
}

// Baris daftar detail jalur — cermin logika modal Lihat Jalur web:
// SEMUA posts (nama) berurutan, digabung dengan checkpoint
// berkoordinat berdasarkan order. Pos manual tanpa koordinat tetap
// tampil sebagai baris nama saja (checkpoint null, kind post),
// bukan hilang dari daftar.
export function buildRouteCheckpointRows(
  posts: string[],
  checkpoints: RouteCheckpoint[],
): RouteCheckpointRow[] {
  const byOrder = new Map(checkpoints.map((c) => [c.order, c]));
  return posts.map((name, i) => {
    const checkpoint = byOrder.get(i) ?? null;
    return {
      name,
      checkpoint,
      kind: checkpointKind(checkpoint?.tags, checkpoint?.isTarget),
    };
  });
}
