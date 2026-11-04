// HTML peta Leaflet untuk layar detail jalur (WebView, statis —
// dibangun sekali dari data route, tanpa injectedJavaScript).
// Struktur mengikuti leafletMapHtml (location-search.ts): CSS/JS
// Leaflet 1.9.4 dari unpkg + tile OSM yang SAMA
// (https://tile.openstreetmap.org/{z}/{x}/{y}.png, seperti web) —
// TIDAK ada sumber tile baru, jadi tidak ada versi cache tile yang
// perlu dinaikkan (lihat utils/osm-tiles.ts).
//
// Garis: track server (MultiLineString, koordinat [lon, lat, elev?])
// bila ada; bila tidak ada, garis fallback lewat checkpoint
// berurutan. Marker checkpoint berwarna per jenis (cermin web) +
// popup nama + jenis. Legenda tiga jenis menempel di bawah peta.
import {
  checkpointKind,
  checkpointMarkerColor,
  type CheckpointKind,
} from "./route-checkpoint-kind";

export interface RouteDetailMapCheckpoint {
  name: string;
  order: number;
  lat: number;
  lon: number;
  tags: string[];
  isTarget: boolean;
}

export interface RouteDetailMapLabels {
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

// JSON aman disisipkan ke <script>: escape penutup script + kutip
// HTML supaya nama checkpoint tidak bisa merusak halaman.
function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function kindLabel(kind: CheckpointKind, labels: RouteDetailMapLabels): string {
  return kind === "peak" ? labels.peak : kind === "camp" ? labels.camp : labels.post;
}

// Track valid = garis dengan >= 2 titik; garis 1 titik bukan polyline.
function trackLines(track: number[][][] | null): Array<Array<[number, number]>> {
  if (!track) return [];
  const lines: Array<Array<[number, number]>> = [];
  for (const line of track) {
    if (!Array.isArray(line)) continue;
    const pts: Array<[number, number]> = [];
    for (const c of line) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const lon = c[0];
      const lat = c[1];
      if (typeof lat !== "number" || typeof lon !== "number") continue;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      pts.push([lat, lon]);
    }
    if (pts.length > 1) lines.push(pts);
  }
  return lines;
}

export function routeDetailMapHtml(args: {
  track: number[][][] | null;
  checkpoints: RouteDetailMapCheckpoint[];
  labels: RouteDetailMapLabels;
  zoom?: number;
}): string {
  const { track, labels } = args;
  const checkpoints = [...args.checkpoints].sort((a, b) => a.order - b.order);
  const lines = trackLines(track);
  const fallback =
    lines.length === 0 && checkpoints.length > 1
      ? [checkpoints.map((c) => [c.lat, c.lon] as [number, number])]
      : [];
  const polylines = lines.length > 0 ? lines : fallback;
  const markers = checkpoints.map((c) => {
    const kind = checkpointKind(c.tags, c.isTarget);
    return {
      lat: c.lat,
      lon: c.lon,
      color: checkpointMarkerColor(kind),
      name: c.name,
      kind: kindLabel(kind, labels),
    };
  });
  const center: [number, number] =
    polylines[0]?.[0] ??
    (markers[0] ? [markers[0].lat, markers[0].lon] : [-6.2, 106.8]);
  const zoom = args.zoom ?? 13;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;padding:0}
.dot{width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5)}
.legend{position:absolute;left:8px;bottom:8px;z-index:1000;background:#fff;border-radius:8px;padding:6px 10px;font:12px sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.3);display:flex;gap:12px}
.legend span{display:flex;align-items:center;gap:5px}
.legend i{width:12px;height:12px;border-radius:50%;display:inline-block}</style></head>
<body><div id="map"></div>
<div class="legend"><span><i style="background:#268c4a"></i>${escapeHtml(labels.post)}</span><span><i style="background:#f78308"></i>${escapeHtml(labels.camp)}</span><span><i style="background:#f5c518"></i>${escapeHtml(labels.peak)}</span></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map("map").setView([${center[0]}, ${center[1]}], ${zoom});
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);
var polylines = ${safeJson(polylines)};
polylines.forEach(function(pts) {
  L.polyline(pts, { color: "#108b93", weight: 4, opacity: 0.9 }).addTo(map);
});
var markers = ${safeJson(markers)};
var points = [];
polylines.forEach(function(pts) { points.push.apply(points, pts); });
markers.forEach(function(m) {
  var icon = L.divIcon({ className: "",
    html: '<div class="dot" style="background:' + m.color + '"></div>',
    iconSize: [18, 18], iconAnchor: [9, 9] });
  L.marker([m.lat, m.lon], { icon: icon })
    .bindPopup("<b>" + m.name + "</b><br>" + m.kind).addTo(map);
  points.push([m.lat, m.lon]);
});
if (points.length > 0) map.fitBounds(points, { padding: [30, 30] });
</script></body></html>`;
}
