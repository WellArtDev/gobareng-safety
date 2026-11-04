// HTML peta Leaflet untuk layar Direction (dipakai WebView, pola sama
// dengan route-map-html): RN memanggil window.setDirection(route, pos,
// target, follow) lewat injectedJavaScript tiap rute/posisi berubah
// (tanpa reload WebView). route = [[lat,lon]...], pos = [lat,lon]|null,
// target = [lat,lon]. follow=true (mode belokan) membuat peta mengikuti
// posisi; follow=false (mode garis rute) fitBounds ulang SATU KALI
// pada transisi follow -> tidak-follow (perbaikan 4 Nov 2026: fitted
// sekali-di-awal membuat peta mentok di zoom ikuti-posisi saat balik
// ke garis rute). invalidateSize setelah load memperbaiki peta abu-abu
// saat WebView di ScrollView mengukur #map = 0 pada init awal.
export function directionMapHtml(lat: number, lon: number, zoom = 14): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;padding:0}
.dot{width:18px;height:18px;border-radius:50%;background:#2563eb;
border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5)}
.pin{width:22px;height:22px;border-radius:50% 50% 50% 0;
background:#f5c518;border:2px solid #fff;transform:rotate(-45deg);
box-shadow:0 1px 5px rgba(0,0,0,.5)}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map("map").setView([${lat}, ${lon}], ${zoom});
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);
var routeLine = null, posMarker = null, targetMarker = null, fitted = false, lastFollow = false;
window.setDirection = function(route, pos, target, follow) {
  if (routeLine) map.removeLayer(routeLine);
  if (route && route.length > 1) {
    routeLine = L.polyline(route, { color: "#108b93", weight: 5 }).addTo(map);
    // Refit pada: pemuatan pertama, DAN transisi keluar dari mode
    // follow (belokan -> garis rute). Bukan pada setiap update
    // posisi, supaya user tetap bisa menggeser/zoom manual di mode rute.
    if (!fitted || (lastFollow && !follow)) {
      map.invalidateSize();
      map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
      fitted = true;
    }
  }
  lastFollow = !!follow;
  if (target) {
    var icon = L.divIcon({ className: "", html: '<div class="pin"></div>',
      iconSize: [22, 22], iconAnchor: [11, 22] });
    if (targetMarker) targetMarker.setLatLng(target);
    else targetMarker = L.marker(target, { icon: icon }).addTo(map);
  }
  if (pos) {
    var dot = L.divIcon({ className: "", html: '<div class="dot"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9] });
    if (posMarker) posMarker.setLatLng(pos);
    else posMarker = L.marker(pos, { icon: dot }).addTo(map);
    if (follow) map.setView(pos, Math.max(map.getZoom(), 16));
  }
};
setTimeout(function() { map.invalidateSize(); }, 100);
setTimeout(function() { map.invalidateSize(); }, 500);
</script></body></html>`;
}
