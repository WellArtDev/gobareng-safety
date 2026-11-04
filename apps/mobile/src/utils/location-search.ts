// Cari lokasi untuk wizard touring — Nominatim (OSM, gratis, tanpa API
// key), sejalan dengan basemap OpenFreeMap/OSM yang dipakai GoBareng.
// Semua parsing dipusatkan di sini supaya bisa dites tanpa jaringan.
export interface LocationResult {
  name: string;
  lat: number;
  lon: number;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

function toCoord(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function parseLocationResults(json: unknown): LocationResult[] {
  if (!Array.isArray(json)) return [];
  const out: LocationResult[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const rec = item as {
      display_name?: unknown;
      lat?: unknown;
      lon?: unknown;
    };
    if (typeof rec.display_name !== "string" || !rec.display_name.trim()) {
      continue;
    }
    const lat = toCoord(rec.lat);
    const lon = toCoord(rec.lon);
    if (lat === null || lon === null) continue;
    out.push({ name: rec.display_name, lat, lon });
  }
  return out;
}

// Varian detail: membedakan "tidak ada hasil" (failed=false) dari
// "permintaan gagal" (failed=true, mis. jaringan / rate-limit Nominatim),
// supaya layar bisa menampilkan pesan error sendiri, bukan no-results.
export interface SearchLocationsResult {
  results: LocationResult[];
  failed: boolean;
}

export async function searchLocationsDetailed(
  query: string,
): Promise<SearchLocationsResult> {
  const q = query.trim();
  if (!q) return { results: [], failed: false };
  try {
    const res = await fetch(
      `${NOMINATIM_URL}/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return { results: [], failed: true };
    return { results: parseLocationResults(await res.json()), failed: false };
  } catch {
    return { results: [], failed: true };
  }
}

export async function searchLocations(query: string): Promise<LocationResult[]> {
  return (await searchLocationsDetailed(query)).results;
}

// Nama tampilan untuk titik yang dipilih (ketuk peta / lokasi saya):
// nama reverse-geocode bila ada, koordinat mentah sebagai fallback.
export function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function resolvePickedName(
  reverseName: string | null,
  lat: number,
  lon: number,
): string {
  return reverseName ?? formatCoords(lat, lon);
}

export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { display_name?: unknown };
    return typeof json.display_name === "string" ? json.display_name : null;
  } catch {
    return null;
  }
}

// HTML peta Leaflet untuk WebView: OSM raster + 1 pin. Ketuk peta kirim
// {type:"pick",lat,lon} ke React Native; RN memanggil setMapPin(lat,lon)
// lewat injectedJavaScript saat pilihan berubah (tanpa reload WebView).
// setMapPin TIDAK menyentuh zoom: panTo mempertahankan zoom aktif
// pengguna (dulu setView hardcode 14 memaksa zoom kembali tiap ketuk).
export function leafletMapHtml(lat: number, lon: number, zoom = 13): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;padding:0}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map("map").setView([${lat}, ${lon}], ${zoom});
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);
var marker = L.marker([${lat}, ${lon}]).addTo(map);
window.setMapPin = function(la, lo) {
  marker.setLatLng([la, lo]);
  map.panTo([la, lo]);
};
map.on("click", function(e) {
  marker.setLatLng(e.latlng);
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: "pick", lat: e.latlng.lat, lon: e.latlng.lng,
  }));
});
</script></body></html>`;
}
