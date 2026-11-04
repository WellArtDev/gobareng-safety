// HTML peta Leaflet untuk menandai checkpoint jalur berurutan di
// WebView (dipakai layar Buat Jalur). Beda dengan leafletMapHtml
// (1 pin): peta ini menampung BANYAK pin bernomor sesuai urutan.
// Ketuk peta kirim {type:"pick",lat,lon} ke React Native; RN memanggil
// setRoutePins([[lat,lon],...]) lewat injectedJavaScript tiap daftar
// checkpoint berubah (tanpa reload WebView).
export function routeMapHtml(lat: number, lon: number, zoom = 13): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;padding:0}
.pin{background:#108b93;color:#fff;border-radius:50%;width:26px;height:26px;
display:flex;align-items:center;justify-content:center;
font:700 12px sans-serif;border:2px solid #fff;
box-shadow:0 1px 4px rgba(0,0,0,.4)}
.pin-first{background:#f78308}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map("map").setView([${lat}, ${lon}], ${zoom});
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);
var markers = [];
// Pindah pusat peta ke hasil pencarian lokasi (tanpa menambah pin):
// dipakai layar Buat Jalur saat user memilih hasil search.
window.setMapCenter = function(la, lo) {
  map.setView([la, lo], 14);
};
window.setRoutePins = function(pins) {
  markers.forEach(function(m) { map.removeLayer(m); });
  markers = pins.map(function(p, i) {
    var icon = L.divIcon({
      className: "",
      html: '<div class="pin' + (i === 0 ? ' pin-first' : '') + '">' + (i + 1) + '</div>',
      iconSize: [26, 26], iconAnchor: [13, 13],
    });
    return L.marker([p[0], p[1]], { icon: icon }).addTo(map);
  });
  if (pins.length > 0) {
    var last = pins[pins.length - 1];
    map.setView([last[0], last[1]], map.getZoom());
  }
};
map.on("click", function(e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: "pick", lat: e.latlng.lat, lon: e.latlng.lng,
  }));
});
</script></body></html>`;
}
