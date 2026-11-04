// Validasi form tambah checkpoint manual (Detail Trip, leader).
// Mengembalikan null untuk input tak valid — form menampilkan error,
// bukan mengirim koordinat palsu ke server.
export interface CheckpointInput {
  name: string;
  lat: number;
  lon: number;
}

export function parseCheckpointCoords(
  name: string,
  latText: string,
  lonText: string,
): CheckpointInput | null {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  // Number("") === 0 — string kosong harus ditolak eksplisit.
  if (latText.trim() === "" || lonText.trim() === "") return null;
  const lat = Number(latText);
  const lon = Number(lonText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { name: trimmedName, lat, lon };
}
