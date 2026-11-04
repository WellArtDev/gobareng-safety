// Logika pilih lokasi lewat peta saat buat trip — dipakai bersama
// hiking + touring (form yang sama). Dua hal yang dulu hilang di
// jalur hiking: (1) kembali dari layar peta harus membawa SEMUA field
// form, termasuk mountainId/routeId, kalau tidak form hiking kehilangan
// gunungnya; (2) pusat peta untuk hiking sebaiknya gunungnya, bukan
// GPS perangkat atau Jakarta.
export interface CreateFormLocationParams {
  // Semua nilai string supaya bisa diteruskan apa adanya sebagai
  // params expo-router (butuh index signature).
  [key: string]: string;
  tripType: string;
  mountainId: string;
  routeId: string;
  name: string;
  date: string;
  time: string;
  meet: string;
  tujuan: string;
  tujuanLat: string;
  tujuanLon: string;
  tikumLat: string;
  tikumLon: string;
  desc: string;
  quota: string;
}

export interface PickedLocation {
  name: string;
  lat: number;
  lon: number;
}

export function applyPickedLocation(
  form: CreateFormLocationParams,
  field: "tikum" | "tujuan",
  picked: PickedLocation,
): CreateFormLocationParams {
  const next = { ...form };
  if (field === "tikum") {
    next.meet = picked.name;
    next.tikumLat = String(picked.lat);
    next.tikumLon = String(picked.lon);
  } else {
    next.tujuan = picked.name;
    next.tujuanLat = String(picked.lat);
    next.tujuanLon = String(picked.lon);
  }
  return next;
}

export interface MapPickerCenterInput {
  selected: PickedLocation | null;
  mountain: { lat: number; lon: number } | null;
  device: { lat: number; lon: number } | null;
  fallback: { lat: number; lon: number };
}

export function resolveMapPickerCenter(
  input: MapPickerCenterInput,
): { lat: number; lon: number } {
  if (input.selected) return { lat: input.selected.lat, lon: input.selected.lon };
  if (input.mountain) return input.mountain;
  if (input.device) return input.device;
  return input.fallback;
}
