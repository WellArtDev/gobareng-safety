// HTML peta Leaflet untuk seksi checkpoint detail trip (pengganti
// daftar "lat, lon ›" — laporan HP 3 Nov 2026). Gaya mengikuti peta
// detail jalur PR #199: marker berwarna per jenis + legenda, kontrol
// zoom Leaflet bawaan, dan toggle layer Standar (OSM) / Satelit
// (Esri World Imagery). Ketuk marker TIDAK membuka Direction
// langsung: ia mengirim {type:"select", index} ke React Native, dan
// RN menampilkan panel nama + koordinat + tombol Direction DI BAWAH
// peta. Koordinat hanya ada sebagai data marker, bukan teks link.
import {
  checkpointMarkerColor,
  type CheckpointKind,
} from "./route-checkpoint-kind";

// TripCheckpoint API tidak membawa tags/isTarget (beda dengan
// checkpoint jalur): jenis hanya bisa diturunkan dari nama, secara
// deterministik dan jujur — "Puncak" -> emas, "Kemah"/"Camp" ->
// oranye, sisanya Pos hijau. Bukan tebakan koordinat.
export function tripCheckpointKindFromName(name: string): CheckpointKind {
  const n = name.toLowerCase();
  if (n.includes("puncak") || n.includes("peak")) return "peak";
  if (n.includes("kemah") || n.includes("camp")) return "camp";
  return "post";
}

export interface TripCheckpointMapPoint {
  name: string;
  lat: number;
  lon: number;
  kind: CheckpointKind;
}

export interface TripCheckpointMapLabels {
  post: string;
  camp: string;
  peak: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function tripCheckpointMapHtml(args: {
  points: TripCheckpointMapPoint[];
  labels: TripCheckpointMapLabels;
  zoom?: number;
}): string {
  const { labels } = args;
  const points = args.points.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon),
  );
  const markers = points.map((p, i) => ({
    index: i,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    color: checkpointMarkerColor(p.kind),
  }));
  const center: [number, number] = markers[0]
    ? [markers[0].lat, markers[0].lon]
    : [-6.2, 106.8];
  const zoom = args.zoom ?? 13;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;padding:0}
.dot{width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5)}
.legend{position:absolute;left:8px;bottom:8px;z-index:1000;background:#fff;border-radius:8px;padding:6px 10px;font:12px sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.3);display:flex;gap:12px}
.legend span{display:flex;align-items:center;gap:5px}
.legend i{width:12px;height:12px;border-radius:50%;display:inline-block}
.tiles{position:absolute;right:8px;top:8px;z-index:1000;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 5px rgba(0,0,0,.3);display:flex}
.tiles button{border:0;background:#fff;padding:7px 10px;font:700 12px sans-serif;cursor:pointer}
.tiles button.active{background:#108b93;color:#fff}</style></head>
<body><div id="map"></div>
<div class="legend"><span><i style="background:#268c4a"></i>${escapeHtml(labels.post)}</span><span><i style="background:#f78308"></i>${escapeHtml(labels.camp)}</span><span><i style="background:#f5c518"></i>${escapeHtml(labels.peak)}</span></div>
<div class="tiles"><button id="btn-std" class="active" onclick="window.setTileStyle('standard')">Standar</button><button id="btn-sat" onclick="window.setTileStyle('satellite')">Satelit</button></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map("map").setView([${center[0]}, ${center[1]}], ${zoom});
var standard = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
});
var satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19, attribution: "Tiles &copy; Esri",
});
standard.addTo(map);
window.setTileStyle = function(style) {
  if (style === "satellite") {
    map.removeLayer(standard); satellite.addTo(map);
    document.getElementById("btn-sat").className = "active";
    document.getElementById("btn-std").className = "";
  } else {
    map.removeLayer(satellite); standard.addTo(map);
    document.getElementById("btn-std").className = "active";
    document.getElementById("btn-sat").className = "";
  }
  setTimeout(function() { map.invalidateSize(); }, 50);
};
var markers = ${safeJson(markers)};
var points = [];
markers.forEach(function(m) {
  var icon = L.divIcon({ className: "",
    html: '<div class="dot" style="background:' + m.color + '"></div>',
    iconSize: [18, 18], iconAnchor: [9, 9] });
  L.marker([m.lat, m.lon], { icon: icon }).addTo(map)
    .on("click", function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "select", index: m.index }));
    });
  points.push([m.lat, m.lon]);
});
if (points.length > 0) map.fitBounds(points, { padding: [30, 30] });
// WebView di dalam ScrollView sering mengukur #map = 0 saat Leaflet
// pertama init (peta abu-abu, hanya kontrol + atribusi yang tampil —
// laporan Direction 3 Nov 2026): paksa ukur ulang setelah layout.
setTimeout(function() { map.invalidateSize(); }, 100);
setTimeout(function() { map.invalidateSize(); }, 500);
</script></body></html>`;
}
