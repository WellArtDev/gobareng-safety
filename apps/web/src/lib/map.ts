import type { Location, Mountain, SosAlert, TripRole } from './types';
import { checkpointKind, checkpointMarkerColor } from './route-checkpoint-type';

const ROLE_COLORS: Record<TripRole, string> = {
	LEADER: '#f5c518',
	SWEEPER: '#f78308',
	MEDIC: '#ffffff',
	MEMBER: '#268c4a'
};

/** Warna marker SOS: merah, selalu berkedip (konvensi yang sama di semua peta). */
export const SOS_COLOR = '#e11d48';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * SOS aktif (bukan RESOLVED/CANCELLED) per pengirim; alert pertama
 * menang bila satu pengirim punya beberapa SOS aktif. Murni, dites
 * unit — dipakai setData untuk mewarnai marker pengirimnya sendiri.
 */
export function activeSosBySender(sos: SosAlert[]): Map<string, SosAlert> {
	const bySender = new Map<string, SosAlert>();
	for (const alert of sos) {
		if (alert.status === 'RESOLVED' || alert.status === 'CANCELLED') continue;
		if (!bySender.has(alert.senderId)) bySender.set(alert.senderId, alert);
	}
	return bySender;
}

/**
 * Gaya marker satu anggota: pengirim SOS aktif jadi merah berkedip,
 * yang lain tetap warna role-nya (LEADER emas, MEMBER hijau, dst).
 */
export function memberMarkerStyle(
	role: TripRole,
	sosAlert: SosAlert | null
): { color: string; pulse: boolean } {
	if (sosAlert) return { color: SOS_COLOR, pulse: true };
	return { color: ROLE_COLORS[role], pulse: false };
}

function formatSosTime(createdAt: string): string {
	const d = new Date(createdAt);
	if (Number.isNaN(d.getTime())) return createdAt;
	return d.toLocaleString('id-ID', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
}

/**
 * Isi popup marker anggota: nama + role, ditambah baris SOS (alasan +
 * waktu) bila anggota itu pengirim SOS aktif. Nama kosong/null =
 * tampil role saja (atau 'SOS' untuk marker SOS fallback tanpa nama).
 * Semua teks di-escape; murni, dites unit.
 */
export function buildMemberPopupHtml(
	name: string | null,
	role: TripRole,
	sosAlert: SosAlert | null
): string {
	const displayName = name?.trim() ? name : null;
	const head = displayName ? `<b>${escapeHtml(displayName)}</b>` : `<b>${sosAlert ? 'SOS' : escapeHtml(role)}</b>`;
	const lines = [head];
	if (displayName) lines.push(escapeHtml(role));
	if (sosAlert) {
		lines.push(`⚠ SOS: ${escapeHtml(sosAlert.reason)}`);
		lines.push(escapeHtml(formatSosTime(sosAlert.createdAt)));
	}
	return lines.join('<br>');
}

// One numbered trip pin on the overview map (file-10 .pin): numbered
// circle with the trip's 1-based number; clicking selects the trip.
// Warna pin dibedakan per jenis trip (2 Nov 2026): hijau brand untuk trip
// AKTIF, teal brand untuk trip AKAN DATANG. Merah SOS sengaja tidak
// dipakai supaya pin trip tidak disangka SOS. Bentuk pin (lingkaran
// bernomor 30px, border putih) membedakannya dari dot checkpoint/anggota.
export type TripPinKind = 'ACTIVE' | 'UPCOMING';

export const TRIP_PIN_COLORS: Record<TripPinKind, string> = {
	ACTIVE: '#268c4a',
	UPCOMING: '#108b93'
};

export function tripPinColor(kind: TripPinKind): string {
	return TRIP_PIN_COLORS[kind];
}

export interface TripPin {
	tripId: string;
	lat: number;
	lon: number;
	number: number;
	selected: boolean;
	kind: TripPinKind;
}

// Pos/checkpoint satu jalur (dari places.json MDPL shifted, via API).
// tags kosong = pos admin manual (tampil sebagai Pos).
export interface RouteCheckpoint {
	lat: number;
	lon: number;
	name: string;
	tags?: string[];
	isTarget?: boolean;
}

export interface MapHandle {
	// names (opsional, argumen ke-5): userId -> nama tampil. Tanpa
	// nama, popup marker hanya menampilkan role (atau 'SOS' untuk
	// marker SOS fallback). Pemanggil yang punya nama wajib
	// mengopernya supaya klik titik ketahuan milik siapa.
	setData: (
		locations: Location[],
		roles: Map<string, TripRole>,
		sos: SosAlert[],
		fit?: boolean,
		names?: Map<string, string>
	) => void;
	setPins: (pins: TripPin[], onPick: (tripId: string) => void) => void;
	// Fokus satu kali ke titik trip terpilih (klik trip di menu/pin):
	// geser kamera ke titik itu; zoom yang sudah diperbesar user
	// dipertahankan, tapi minimal zoom 14 supaya titiknya terlihat.
	focusPoint: (point: { lat: number; lon: number }) => void;
	// Titik gunung ala muncak: satu marker per gunung yang punya
	// koordinat; klik membuka popup nama + ketinggian + jumlah jalur.
	setMountains: (
		mountains: Mountain[],
		labels: { elevationUnit: string; trails: string }
	) => void;
	// Track satu jalur (gaya GoBareng sendiri: polyline teal, bukan
	// gaya MDPL) + pos/checkpoint-nya; dipakai modal detail jalur.
	// labels = nama jenis untuk popup marker (dari i18n pemanggil).
	setRouteTrack: (
		track: number[][][] | null,
		checkpoints: RouteCheckpoint[],
		labels: { post: string; camp: string; peak: string }
	) => void;
	destroy: () => void;
}

// Leaflet is loaded lazily in the browser only (no SSR import), so the
// dashboard page can render server-side without a window object.
//
// Switcher gaya peta: semua peta dashboard dibuat lewat createMap ini,
// jadi tombol Standar/Satelit di sini otomatis ada di semua peta.
// Default = gaya yang sekarang (tileUrl pemanggil = Standar); Satelit =
// citra Esri World Imagery. Label lewat pemanggil (i18n) supaya tidak
// ada string user-facing yang hardcode di sini.
export async function createMap(
	el: HTMLElement,
	tileUrl: string,
	styleLabels: { standard: string; satellite: string } = {
		standard: 'Standar',
		satellite: 'Satelit'
	}
): Promise<MapHandle> {
	const L = await import('leaflet');
	await import('leaflet/dist/leaflet.css');
	// Initial view = the full Indonesia extent, like the file-10
	// screenshot (Wella, 21:33 WIB): the whole archipelago visible
	// when the dashboard first opens. Trip focus happens only when
	// the user explicitly picks a trip (see setData's `fit` flag).
	const map = L.map(el).fitBounds([
		[-11, 95],
		[6, 141]
	]);
	const standardLayer = L.tileLayer(tileUrl, { attribution: '© OpenStreetMap' }).addTo(map);
	const satelliteLayer = L.tileLayer(
		'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
		{ attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics' }
	);
	type MapStyle = 'standard' | 'satellite';
	let activeStyle: MapStyle = 'standard';
	const styleButtons = new Map<MapStyle, HTMLButtonElement>();
	function paintButtons() {
		for (const [style, btn] of styleButtons) {
			const active = style === activeStyle;
			btn.setAttribute('aria-pressed', active ? 'true' : 'false');
			btn.style.background = active ? '#0f766e' : '#fff';
			btn.style.color = active ? '#fff' : '#111';
			btn.style.fontWeight = active ? '700' : '400';
		}
	}
	function setStyle(style: MapStyle) {
		if (style === activeStyle) return;
		if (style === 'satellite') {
			map.removeLayer(standardLayer);
			satelliteLayer.addTo(map);
		} else {
			map.removeLayer(satelliteLayer);
			standardLayer.addTo(map);
		}
		activeStyle = style;
		paintButtons();
	}
	// Overlay DOM biasa (bukan L.control: tipenya tidak memadai di
	// @types/leaflet versi ini) di pojok kanan atas kontainer peta.
	const styleBox = document.createElement('div');
	styleBox.style.position = 'absolute';
	styleBox.style.top = '10px';
	styleBox.style.right = '10px';
	styleBox.style.zIndex = '1000';
	styleBox.style.display = 'flex';
	styleBox.style.background = '#fff';
	styleBox.style.border = '2px solid rgba(0,0,0,0.2)';
	styleBox.style.borderRadius = '8px';
	styleBox.style.overflow = 'hidden';
	styleBox.style.backgroundClip = 'padding-box';
	styleBox.addEventListener('click', (e) => e.stopPropagation());
	for (const [style, label] of [
		['standard', styleLabels.standard],
		['satellite', styleLabels.satellite]
	] as const) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.textContent = label;
		btn.style.border = '0';
		btn.style.padding = '7px 12px';
		btn.style.cursor = 'pointer';
		btn.style.font = 'inherit';
		btn.style.fontSize = '13px';
		btn.onclick = () => setStyle(style);
		styleButtons.set(style, btn);
		styleBox.appendChild(btn);
	}
	paintButtons();
	map.getContainer().appendChild(styleBox);
	const layer = L.layerGroup().addTo(map);
	const pinLayer = L.layerGroup().addTo(map);
	const mountainLayer = L.layerGroup().addTo(map);
	const routeLayer = L.layerGroup().addTo(map);

	// File-10 numbered trip pin: numbered circle, white border; base
	// colour follows the trip kind (green = active, teal = upcoming),
	// orange and slightly larger when selected (selected overrides kind).
	function pinIcon(number: number, selected: boolean, kind: TripPinKind): L.DivIcon {
		const bg = selected ? '#f97316' : tripPinColor(kind);
		const scale = selected ? 'transform:scale(1.15);' : '';
		return L.divIcon({
			className: '',
			html: `<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:${bg};color:#fff;font:800 12px system-ui,sans-serif;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.25);${scale}">${number}</span>`,
			iconSize: [30, 30]
		});
	}

	// Role colours are brand/semantic and must not change: gold leader,
	// orange sweeper, white medic, green member, pulsing red SOS.
	function dot(color: string, pulse: boolean): L.DivIcon {
		const size = pulse ? 22 : 20;
		return L.divIcon({
			className: '',
			html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.3), 0 2px 6px rgba(0,0,0,.35);${pulse ? 'animation:gb-pulse 1.2s infinite;' : ''}"></span>`,
			iconSize: [size, size]
		});
	}

	// Mountain marker: the GoBareng pin logo itself (transparent PNG,
	// no text, no circle) — its bottom tip points at the location.
	function mountainIcon(): L.Icon {
		return L.icon({
			iconUrl: '/mountain-pin.png',
			iconSize: [30, 42],
			iconAnchor: [15, 42]
		});
	}

	return {
		setData(locations, roles, sos, fit = true, names) {
			layer.clearLayers();
			const points: Array<[number, number]> = [];
			const locatedUserIds = new Set(locations.map((l) => l.userId));
			const sosBySender = activeSosBySender(sos);
			for (const loc of locations) {
				const role = roles.get(loc.userId) ?? 'MEMBER';
				const alert = sosBySender.get(loc.userId) ?? null;
				const style = memberMarkerStyle(role, alert);
				L.marker([loc.lat, loc.lon], {
					icon: dot(style.color, style.pulse),
					zIndexOffset: alert ? 1000 : 0
				})
					.bindPopup(buildMemberPopupHtml(names?.get(loc.userId) ?? null, role, alert))
					.addTo(layer);
				points.push([loc.lat, loc.lon]);
			}
			// Fallback: SOS aktif yang pengirimnya tidak punya baris
			// lokasi (tetap harus terlihat). Pengirim yang sudah
			// punya marker tidak lagi digandakan titik merahnya:
			// markernya sendiri sudah merah berkedip + berpopup SOS.
			for (const alert of sosBySender.values()) {
				if (locatedUserIds.has(alert.senderId)) continue;
				const role = roles.get(alert.senderId) ?? 'MEMBER';
				L.marker([alert.lat, alert.lon], {
					icon: dot(SOS_COLOR, true),
					zIndexOffset: 1000
				})
					.bindPopup(
						buildMemberPopupHtml(
							alert.senderName ?? names?.get(alert.senderId) ?? null,
							role,
							alert
						)
					)
					.addTo(layer);
				points.push([alert.lat, alert.lon]);
			}
			// fit=false keeps the initial Indonesia view (or the current
			// view): markers still render, the camera does not move.
			if (fit && points.length > 0) map.fitBounds(points, { padding: [40, 40] });
		},
		setPins(pins, onPick) {
			pinLayer.clearLayers();
			for (const pin of pins) {
				L.marker([pin.lat, pin.lon], {
					icon: pinIcon(pin.number, pin.selected, pin.kind),
					zIndexOffset: pin.selected ? 1000 : 0
				})
					.on('click', () => onPick(pin.tripId))
					.addTo(pinLayer);
			}
		},
		focusPoint(point) {
			map.setView([point.lat, point.lon], Math.max(map.getZoom(), 14));
		},
		setMountains(mountains, labels) {
			mountainLayer.clearLayers();
			for (const m of mountains) {
				if (m.lat == null || m.lon == null) continue;
				L.marker([m.lat, m.lon], { icon: mountainIcon() })
					.bindPopup(
						`<b>${escapeHtml(m.name)}</b><br>${m.elevationM} ${labels.elevationUnit} • ${m.routeCount} ${labels.trails}`
					)
					.addTo(mountainLayer);
			}
		},
		setRouteTrack(track, checkpoints, labels) {
			routeLayer.clearLayers();
			const points: Array<[number, number]> = [];
			// Track = MultiLineString koordinat [lon, lat, elev?].
			if (track) {
				for (const line of track) {
					const pts = line
						.filter((c) => Array.isArray(c) && c.length >= 2)
						.map((c) => [c[1], c[0]] as [number, number]);
					if (pts.length > 1) {
						L.polyline(pts, { color: '#108b93', weight: 4, opacity: 0.9 }).addTo(routeLayer);
						points.push(...pts);
					}
				}
			}
			for (const cp of checkpoints) {
				// Warna per jenis: Pos hijau, Titik kemah oranye,
				// Puncak emas; popup menyebut nama + jenisnya.
				const kind = checkpointKind(cp.tags, cp.isTarget);
				const kindLabel =
					kind === 'peak' ? labels.peak : kind === 'camp' ? labels.camp : labels.post;
				L.marker([cp.lat, cp.lon], { icon: dot(checkpointMarkerColor(kind), false) })
					.bindPopup(`<b>${escapeHtml(cp.name)}</b><br>${escapeHtml(kindLabel)}`)
					.addTo(routeLayer);
				points.push([cp.lat, cp.lon]);
			}
			if (points.length > 0) map.fitBounds(points, { padding: [30, 30] });
		},
		destroy() {
			styleBox.remove();
			map.remove();
		}
	};
}
