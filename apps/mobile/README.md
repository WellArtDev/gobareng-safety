# GoBareng Mobile — `apps/mobile`

> M1 selesai: buat trip + peta live + status anggota. F1 = scaffold saja.
> Wiring live pra-M2: posisi live dari API F2 + Socket.IO (fallback demo
> bila backend tidak terjangkau).
> Beacon DI-HOLD (perintah Wella, 26 Okt 2026): jangan dikerjakan, jangan
> diumumkan.
>
> M1 done: create trip + live map + member status. F1 was scaffold only.
> Pre-M2 live wiring: live positions from the F2 API + Socket.IO (demo
> fallback when the backend is unreachable).
> Beacon is ON HOLD (Wella's order, 26 Oct 2026): do not build it, do not
> announce it.

## Stack / Stack

- Expo SDK 58 (template `default@sdk-58`), React Native 0.88, React 19.3.0
  (versi yang dipin SDK 58 / the version pinned by SDK 58).
- Expo Router (file-based routing, `src/app/`).
- TypeScript ketat / strict TypeScript.

## Struktur / Structure

```text
apps/mobile/
  app.json            # nama, slug, scheme, plugin expo-router + expo-location
  package.json        # dependensi SDK 58
  package-lock.json   # kunci versi dependensi / dependency lockfile
  tsconfig.json       # alias @/* -> ./src/*
  .gitignore          # node_modules, .expo, dist, /ios, /android
  src/
    app/
      _layout.tsx     # Stack + LanguageProvider + impor tugas lokasi latar
      index.tsx       # beranda + tautan ke /trips dan /trips/new
      trips/
        index.tsx     # rute -> TripsScreen (daftar trip)
        new.tsx       # rute -> NewTripScreen (form buat trip)
        [id].tsx      # rute -> TripLiveScreen (peta live + status)
    components/
      live-map.tsx    # peta tile OSM + marker warna baku + legenda
    hooks/
      use-live-positions.ts  # tick demo ADAPTIF M5 (interval per tipe trip)
      use-live-trip.ts       # orkestrasi live-vs-demo (wiring pra-M2)
      use-adaptive-tracking.ts # GPS foreground adaptif + POST posisi (M5)
    i18n/
      id.ts           # kamus Bahasa Indonesia (default)
      en.ts           # kamus English (bertipe Translations dari id.ts)
      index.tsx       # LanguageProvider + useTranslation + t(key)
    screens/
      trips/
        trip-list.tsx # daftar trip + tautan ke detail
        new-trip.tsx  # form buat trip (nama, tipe, tanggal, titik kumpul)
        trip-live.tsx # meta trip + peta live + daftar anggota/status
    utils/
      trip-store.ts   # tipe Trip/Member, store demo, createTrip, posisi demo
      live-api.ts     # klien REST F2 (trip/anggota/posisi, kontrak §3)
      live-socket.ts  # klien Socket.IO F2 (join-trip, broadcast posisi)
      tracking-interval.ts # resolver interval adaptif M5 (fungsi murni)
      tracking-task.ts     # tugas lokasi latar M5 (defineTask module scope)
```

Rute hanya di `src/app/` — jangan taruh komponen, tipe, atau utilitas di
sana. Kode bersama tinggal di `src/` (misalnya `src/i18n/`).
Routes live only in `src/app/` — never co-locate components, types, or
utilities there. Shared code lives in `src/` (for example `src/i18n/`).

## i18n — fondasi / i18n foundation

Aturan repo (`docs/CONTRIBUTING.md`, bagian Bahasa/i18n): SEMUA teks
user-facing WAJIB lewat translation key — JANGAN hardcode teks di
layar/kode. Bahasa default: Indonesia. Switcher ID/EN ada di Settings
(kartu nanti, bukan F1).
Repo rule (`docs/CONTRIBUTING.md`, Bahasa/i18n section): ALL user-facing
strings MUST go through translation keys — NEVER hardcode text in
screens/code. Default language: Indonesian. The ID/EN switcher lives in
Settings (a later card, not F1).

```tsx
import { useTranslation } from "@/i18n";

const { locale, setLocale, t } = useTranslation();
t("home.subtitle"); // "Aplikasi pendamping keamanan perjalanan." / "A travel safety companion app."
```

Menambah bahasa = tambah satu file terjemahan (misalnya `src/i18n/fr.ts`,
bertipe `Translations`) lalu daftarkan di `dictionaries` di
`src/i18n/index.tsx` — kode layar tidak berubah. Kunci yang ada di `id.ts`
tapi belum ada di bahasa lain = type error (karena `en` bertipe
`Translations`), jadi kamus yang tidak lengkap ketahuan saat typecheck.
Adding a language = add one translation file (for example `src/i18n/fr.ts`,
typed as `Translations`) and register it in `dictionaries` in
`src/i18n/index.tsx` — screen code does not change. A key present in `id.ts`
but missing in another language = a type error (because `en` is typed as
`Translations`), so incomplete dictionaries fail typecheck.

## M1 — buat trip + peta live + status anggota / M1 — create trip + live map + member status

Yang dibangun (sesuai AC kanban-detail M1):
What was built (per kanban-detail M1 AC):

- Buat trip (nama, tipe HIKING/TOURING, tanggal, titik kumpul) — trip baru
  muncul di daftar (`src/screens/trips/new-trip.tsx` +
  `src/screens/trips/trip-list.tsx`, rute `/trips/new` dan `/trips`).
  Create a trip (name, HIKING/TOURING type, date, meeting point) — the new
  trip appears in the list.
- Peta live semua anggota dengan warna baku: hijau anggota, emas leader,
  oranye sweeper, putih + palang merah medic, merah berkedip SOS
  (`src/components/live-map.tsx`). Peta memakai tile OpenStreetMap GRATIS
  lewat `Image` standar — tanpa modul native peta, tanpa kunci API — jadi
  bisa diverifikasi lewat export web maupun dev build. Satu-satunya tempat
  URL tile dibuat adalah `osmTileUrl()` — titik pasang cache tile lokal
  nanti.
  Live map of all members with standard colors: green member, gold leader,
  orange sweeper, white + red cross medic, blinking red SOS. The map uses
  FREE OpenStreetMap tiles through the standard `Image` component — no
  native map module, no API key — so it verifies on both web export and
  dev builds. Tile URLs are built in exactly one place, `osmTileUrl()` —
  the plug point for a local tile cache later.
- Posisi anggota diperbarui berkala (tick demo ADAPTIF M5:
  `use-live-positions.ts` memakai resolver interval — hiking 60 dtk,
  touring 15–30 dtk — bukan lagi tick tetap 5 detik) dan status anggota
  terlihat: aman / berjalan / menuju pos
  (`src/screens/trips/trip-live.tsx`, rute `/trips/[id]`).
  Member positions update periodically (M5 ADAPTIVE demo tick:
  `use-live-positions.ts` uses the interval resolver — hiking 60s,
  touring 15–30s — no longer a fixed 5-second tick) and member status
  is visible: safe / walking / heading to post.
- Semua teks user-facing lewat key i18n (`trips.*` di `id.ts`/`en.ts`),
  default Indonesia, tanpa hardcode.
  All user-facing text goes through i18n keys, default Indonesian, no
  hardcoding.

Data demo (sampai backend F2 ada): satu trip demo "Pendakian Gunung Prau"
dengan 5 anggota yang bergerak di jalur demo; posisi berubah lewat update
immutable agar selalu me-render ulang. Trip yang dibuat pengguna berpusat
di area demo sampai ada geocoding backend (F2) dan belum punya anggota
(flow gabung = backend, F2).
Demo data (until the F2 backend exists): one demo trip "Pendakian Gunung
Prau" with 5 members moving along a demo route; positions change through
immutable updates so they always re-render. User-created trips center on
the demo area until backend geocoding exists (F2) and have no members yet
(join flow = backend, F2).

Yang SENGAJA tidak ada di M1 (kartu lain):
Deliberately NOT in M1 (other cards):

- Alur SOS (tombol tahan, broadcast, sirene, morse) = M2. Warna SOS di
  peta hanya skema warna marker, bukan fitur SOS.
  SOS flow (hold button, broadcast, siren, morse) = M2. The SOS color on
  the map is only a marker-color scheme, not an SOS feature.
- Checkpoint CRUD + check-in + headcount akhir = M4. Titik kumpul di M1
  adalah data pembuatan trip, bukan checkpoint.
  Checkpoint CRUD + check-in + final headcount = M4. The meeting point in
  M1 is trip-creation data, not a checkpoint.
- GPS adaptif (interval hiking 60 detik, touring 15–30 detik, diam = jeda,
  baterai lemah = 3–5 menit) = M5. M5 mengganti nilai tick di
  `use-live-positions.ts` tanpa mengubah peta.
  Adaptive GPS = M5. M5 replaces the tick value in `use-live-positions.ts`
  without changing the map.
- Switcher bahasa di layar Settings = kartu Settings nanti (AC F1 sudah
  diamendemen: fondasi i18n cukup untuk F1).
  Language switcher in the Settings screen = a later Settings card (F1 AC
  was amended: the i18n foundation suffices for F1).
- Cache tile offline = lanjutan; titik pasangnya `osmTileUrl()`.
  Offline tile cache = follow-up; its plug point is `osmTileUrl()`.

## Wiring posisi live (pra-M2) / Live position wiring (pre-M2)

Instruksi the project lead (DM 06:25, 27 Okt 2026): sambungkan posisi live M1 ke
API F2 + Socket.IO SEBELUM M2, supaya demo benar-benar live (bukan
tick demo).
the project lead's instruction (DM 06:25, 27 Oct 2026): wire M1 live positions to
the F2 API + Socket.IO BEFORE M2, so the demo is truly live (not the
demo tick).

Yang di-wiring / What is wired:

- REST F2 (kontrak §3, `src/utils/live-api.ts`): `GET /trip-groups/:id`
  + `GET /trip-groups/:id/members` + `GET /trip-groups/:id/locations`
  untuk posisi awal; respons `{ data }` / `{ error: { code } }` dipetakan
  ke fallback demo, bukan error screen.
  F2 REST (contract §3, `src/utils/live-api.ts`): `GET /trip-groups/:id`
  + `GET /trip-groups/:id/members` + `GET /trip-groups/:id/locations`
  for initial positions; `{ data }` / `{ error: { code } }` responses
  map to the demo fallback, not an error screen.
- Socket.IO F2 (kontrak §11, `src/utils/live-socket.ts`): auth handshake
  JWT, `join-trip`/`leave-trip`, broadcast server -> klien
  `location-update` -> posisi peta. Klien TIDAK mengirim location-update
  lewat socket (F2 sengaja menolaknya; REST sumber kebenaran).
  F2 Socket.IO (contract §11, `src/utils/live-socket.ts`): JWT handshake
  auth, `join-trip`/`leave-trip`, server -> client `location-update`
  broadcasts -> map positions. The client NEVER sends location-update
  over the socket (F2 deliberately refuses it; REST is the source of
  truth).
- Layar trip (`src/hooks/use-live-trip.ts` + `src/screens/trips/trip-live.tsx`):
  mode live (badge "Live dari server") atau demo (badge "Demo lokal").
  Tanpa token, server mati, token kedaluwarsa, atau trip bukan milik
  server -> demo, peta + status anggota tetap jalan.
  Trip screen (`src/hooks/use-live-trip.ts` + `src/screens/trips/trip-live.tsx`):
  live mode ("Live from server" badge) or demo mode ("Local demo"
  badge). Without a token, with the server down, with an expired token,
  or with a non-server trip -> demo; map + member status keep working.
- Tick demo dijaga: anggota server tidak punya progress jalur demo, jadi
  `advanceDemoPositions` melewatinya (tanpa guard ini posisinya rusak).
  The demo tick is guarded: server members have no demo-route progress,
  so `advanceDemoPositions` skips them (without this guard their
  positions break).

Demo live (API lokal + posisi dari curl, tanpa layar login — layar
auth adalah kartu nanti):
Live demo (local API + positions via curl, no login screen — auth
screens are a later card):

```sh
cd apps/api && bun run dev   # API di :3000 (PORT), Socket.IO menempel
# Daftar + ambil token (JWT 7 hari):
curl -s -X POST localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@gobareng.app","name":"Demo","password":"demo1234"}'
# Buat trip (pakai token), join anggota lain, lalu POST posisi:
curl -s -X POST localhost:3000/api/v1/trip-groups/<TRIP_ID>/locations \
  -H "Authorization: Bearer <TOKEN>" -H 'Content-Type: application/json' \
  -d '{"lat":-7.2,"lon":109.91}'
```

```sh
# apps/mobile/.env.local (TIDAK PERNAH di-commit — .gitignore melarangnya):
EXPO_PUBLIC_API_URL=http://localhost:3000
# EXPO_PUBLIC_API_TOKEN DIHAPUS (W-1): token sesi datang dari layar
# login (/login) dan disimpan di expo-secure-store (native) /
# localStorage (web) — tidak pernah di-inline ke bundle.
# EXPO_PUBLIC_API_TOKEN is REMOVED (W-1): the session token comes from
# the login screen (/login) and is stored in expo-secure-store
# (native) / localStorage (web) — never inlined into the bundle.
# Masuk lewat layar login, lalu buka /trips/<TRIP_ID> — badge "Live
# dari server". Tanpa sesi/server -> badge "Demo lokal".
# Sign in on the login screen, then open /trips/<TRIP_ID> — "Live from
# server" badge. Without a session/server -> "Local demo" badge.
```

## W-1 — Layar login + expo-secure-store / W-1 — Login screen + expo-secure-store

- Layar `/login` (`src/screens/auth/login.tsx`): masuk atau daftar
  (kontrak §1), gaya mengikuti template kit mobile (primary `#18A957`,
  radius 12, splash menyediakan "Lanjut sebagai Tamu" = mode demo).
  The `/login` screen: sign in or register (contract §1), styled per
  the mobile template kit (primary `#18A957`, radius 12, with a
  "Continue as Guest" path = demo mode).
- Token sesi di `src/utils/auth-store.ts` (native: `expo-secure-store`,
  terenkripsi OS) dan `auth-store.web.ts` (web: localStorage) — pola
  pemisahan platform yang sama dengan outbox-store. `getApiToken()` di
  `live-api.ts` sekarang membaca sesi ini; `EXPO_PUBLIC_API_TOKEN`
  dihapus seluruhnya.
  The session token lives in `src/utils/auth-store.ts` (native:
  `expo-secure-store`, OS-encrypted) and `auth-store.web.ts` (web:
  localStorage) — the same platform-split pattern as outbox-store.
  `getApiToken()` in `live-api.ts` now reads this session; the
  `EXPO_PUBLIC_API_TOKEN` variable is removed entirely.
- Sesi dimuat sekali saat boot di `_layout.tsx` (sebelum layar pertama
  membaca token); beranda menampilkan "Masuk sebagai <nama>" + tombol
  Keluar, atau tombol Masuk bila tanpa sesi. Tanpa sesi, semua layar
  tetap jalan dalam mode demo (fallback lama tidak berubah).
  The session loads once at boot in `_layout.tsx` (before the first
  screen reads the token); home shows "Signed in as <name>" + a
  sign-out button, or a sign-in button without a session. Without a
  session every screen still runs in demo mode (the existing fallback
  is unchanged).

Yang SENGAJA tidak ada di wiring ini (kartu lain):
Deliberately NOT in this wiring (other cards):

- POST posisi sendiri = M5 (butuh GPS perangkat; hook ini hanya menerima).
  POST own position = M5 (needs device GPS; this hook only receives).
- Alur SOS = M2. Layar login/register = kartu nanti (demo pakai token env).
  SOS flow = M2. Login/register screens = a later card (demo uses an
  env token).
- Trip server tidak punya koordinat pusat (kontrak §2): pusat peta live
  diambil dari posisi anggota pertama, atau pusat demo bila belum ada.
  Server trips have no center coordinates (contract §2): the live map
  centers on the first member position, or the demo center if none yet.

## M2 — SOS 3-channel dengan alasan kontekstual / M2 — 3-channel SOS with contextual reasons

Yang dibangun (sesuai AC kanban-detail M2):
What was built (per kanban-detail M2 AC):

- Layar SOS trip (`src/screens/trips/trip-sos.tsx`, rute
  `/trips/sos?tripId=...`): pilih alasan kontekstual yang dibatasi tipe
  trip — HIKING: TERSESAT, CEDERA, MEDIS, LAINNYA; TOURING: MOTOR_RUSAK,
  BENSIN_HABIS, BAN_BOCOR, KECELAKAAN, CEDERA, MEDIS, LAINNYA (alasan
  touring tidak muncul di trip hiking dan sebaliknya) — lalu tahan
  tombol 3 detik untuk memicu SOS (kontrak §4: POST
  `/trip-groups/:id/sos {reason, lat, lon}`).
  Trip SOS screen: pick a type-restricted contextual reason — HIKING:
  TERSESAT, CEDERA, MEDIS, LAINNYA; TOURING: MOTOR_RUSAK, BENSIN_HABIS,
  BAN_BOCOR, KECELAKAAN, CEDERA, MEDIS, LAINNYA (touring reasons never
  appear on hiking trips and vice versa) — then hold the button for 3
  seconds to trigger SOS (contract §4: POST `/trip-groups/:id/sos
  {reason, lat, lon}`).
- SOS aktif: sirine + sinyal morse "...---..." selama SOS belum terminal.
  Sirine disintesis Web Audio (tanpa aset audio — push snapshot hanya
  menerima file UTF-8); sinyal morse dijadwalkan murni
  (`src/utils/morse.ts`) dan di web ditampilkan sebagai flash layar.
  Torch perangkat native menyusul lewat dev build (expo-camera
  enableTorch) tanpa mengubah penjadwal.
  Active SOS: siren + "...---..." morse signal while the SOS is not
  terminal. The siren is synthesized with Web Audio (no audio asset —
  snapshot pushes only accept UTF-8 files); the morse signal is a pure
  scheduler (`src/utils/morse.ts`) and shows as a screen flash on web.
  A native device torch follows via a dev build (expo-camera
  enableTorch) without changing the scheduler.
- SOS masuk terlihat di layar trip (`src/screens/trips/trip-live.tsx`,
  bagian "SOS masuk"): alasan + level (EMERGENCY: CEDERA/KECELAKAAN/
  MEDIS; URGENT: TERSESAT/MOTOR_RUSAK; HELP: sisanya — cermin kontrak
  §4, server yang berwenang) + lokasi + waktu + pengirim, diperbarui
  live lewat broadcast Socket.IO (`sos-trigger`, `sos-acknowledge`,
  dst.). Anggota dengan SOS aktif tampil sebagai SOS di peta (marker
  merah berkedip) dan daftar anggota.
  Incoming SOS shows on the trip screen ("SOS masuk" section): reason +
  level (EMERGENCY: CEDERA/KECELAKAAN/MEDIS; URGENT: TERSESAT/
  MOTOR_RUSAK; HELP: the rest — a mirror of contract §4, the server is
  authoritative) + location + time + sender, updated live via Socket.IO
  broadcasts. Members with an active SOS show as SOS on the map
  (blinking red marker) and in the member list.
- SOS bystander: server (PR #8, merge `3bbfd59`) mengirim event
  `sos-bystander-alert` ke pengguna dalam radius 2 km — bukan lewat
  trip room, tapi ke socket pengguna langsung, jadi sampai juga ke
  bukan-anggota trip. Mobile berlangganan event ini, menanam SOS-nya
  langsung dari payload broadcast (bystander bukan anggota trip, jadi
  GET daftar SOS trip ditolak server), dan menampilkannya di bagian
  "SOS di sekitar" layar trip — tanpa tombol aksi (server menolak aksi
  bystander). Event status (acknowledge/dll.) hanya disiarkan ke trip
  room, jadi status SOS bystander tidak diperbarui live — itu batas
  server, bukan mobile.
  Bystander SOS: the server (PR #8, merge `3bbfd59`) sends the
  `sos-bystander-alert` event to users within 2 km — not via the trip
  room, but to the user's own socket, so it also reaches non-members.
  Mobile subscribes to this event, seeds the SOS straight from the
  broadcast payload (bystanders are not trip members, so the trip SOS
  list GET is rejected by the server), and shows it in the trip
  screen's "SOS nearby" section — with no action buttons (the server
  rejects bystander actions). Status events (acknowledge, etc.) only
  broadcast to the trip room, so a bystander SOS status does not update
  live — a server-side limit, not a mobile one.
- Aksi SOS (kontrak §4): acknowledge, in-progress, resolve, false-alarm
  dari layar trip; cancel dari layar SOS pengirim. Penjaga peran ada di
  server (in-progress/resolve/false-alarm = LEADER, cancel = sender);
  server menolak aksi yang tidak berhak.
  SOS actions (contract §4): acknowledge, in-progress, resolve,
  false-alarm from the trip screen; cancel from the sender's SOS screen.
  Role guards live on the server (in-progress/resolve/false-alarm =
  LEADER, cancel = sender); the server rejects unauthorized actions.
- Mode demo: tanpa token/server/trip-bukan-milik-server, SOS tetap jalan
  sebagai SOS demo lokal (bukan error screen) — sirine + morse tetap
  jalan; badge "Demo lokal" vs "Live dari server" membedakan keduanya.
  Posisi pemicu SOS = pusat trip (posisi GPS sendiri baru ada di M5).
  Demo mode: without a token/server/non-server trip, SOS still works as
  a local demo SOS (not an error screen) — siren + morse still run;
  "Demo lokal" vs "Live dari server" badges tell them apart. The SOS
  trigger position is the trip center (own GPS positions only arrive
  with M5).

Yang SENGAJA tidak ada di M2 (kartu lain / pihak lain):
Deliberately NOT in M2 (other cards / other parties):

- Dispatch channel lanjutan SUDAH LIVE di server (PR #8, merge
  `3bbfd59`): push in-app ke bystander radius 2 km + WA — dan mobile
  menangani event `sos-bystander-alert`-nya (bagian "SOS di sekitar"
  di atas). Mobile TIDAK memegang kode/path WA apa pun. Keputusan WA
  terakhir (the project lead DM 07:06:30 AEDT 2026-10-27, dikonfirmasi final DM
  07:19:17 AEDT): WA bystander (bila ada) pakai Official WhatsApp
  Business Cloud API (Meta), BUKAN Wablas, fail-soft bila env tidak
  disetel, server-side.
  Downstream channel dispatch is LIVE on the server (PR #8, merge
  `3bbfd59`): in-app push to bystanders within 2 km + WA — and mobile
  handles its `sos-bystander-alert` event (the "SOS nearby" section
  above). Mobile holds NO WA code/path. Final WA decision (the project lead DM
  07:06:30 AEDT 2026-10-27, confirmed final DM 07:19:17 AEDT):
  bystander WA (if any) uses the Official WhatsApp Business Cloud API
  (Meta), NOT Wablas, fail-soft if env is unset, server-side.
- Socket global: socket mobile hanya hidup di layar trip (trip-live /
  trip-sos), jadi bystander yang tidak sedang membuka layar trip belum
  terhubung dan belum menerima alert. Socket global + layar
  login/register = kartu nanti (demo pakai token env).
  Global socket: the mobile socket only lives on trip screens
  (trip-live / trip-sos), so a bystander with no trip screen open is
  not connected and receives no alert yet. Global socket +
  login/register screens = a later card (demo uses an env token).
- POST posisi sendiri = M5 (butuh GPS perangkat). Checkpoint/check-in/
  headcount = M4. Layar login/register = kartu nanti (demo pakai token
  env).
  POST own position = M5 (needs device GPS). Checkpoint/check-in/
  headcount = M4. Login/register screens = a later card (demo uses an
  env token).
- Tidak ada framing medis/diagnosis di fitur apa pun: label alasan hanya
  nama alasan, tanpa saran medis.
  No medical/diagnosis framing on any feature: reason labels are just
  reason names, no medical advice.

## M4 — Checkpoint CRUD + check-in + headcount akhir / M4 — Checkpoint CRUD + check-in + final headcount

Yang dibangun (sesuai AC kanban-detail M4, kartu gabungan the team + the project lead —
bagian mobile; semua endpoint server sudah ada di main dari F2, jadi
tidak ada bagian yang menunggu the project lead):
What was built (per kanban-detail M4 AC, joint the team + the project lead card —
mobile part; all server endpoints already exist in main from F2, so no
part waits on the project lead):

- Layar checkpoint trip (`src/screens/trips/trip-checkpoints.tsx`, rute
  `/trips/checkpoints?tripId=...`, ditautkan dari layar trip):
  daftar checkpoint (nama + koordinat) + riwayat check-in per checkpoint
  (nama anggota + waktu) yang terlihat leader.
  Trip checkpoint screen (`src/screens/trips/trip-checkpoints.tsx`,
  route `/trips/checkpoints?tripId=...`, linked from the trip screen):
  checkpoint list (name + coordinates) + per-checkpoint check-in history
  (member name + time) visible to the leader.
- CRUD checkpoint (kontrak §6): tambah (nama + lat + lon, divalidasi
  angka), ubah inline, hapus dua-ketuk. Penjaga peran ada di server
  (CRUD = LEADER); seperti pola layar SOS, kontrol tampil untuk semua
  dan server menolak non-leader dengan 403 + pesan penolakan.
  Checkpoint CRUD (contract §6): create (name + lat + lon, numeric
  validated), inline edit, two-tap delete. Role guards live on the
  server (CRUD = LEADER); like the SOS screen pattern, controls render
  for everyone and the server refuses non-leaders with 403 + a refusal
  message.
- Check-in anggota di checkpoint (kontrak §6: POST .../checkpoints/:id/
  check-in): satu ketuk per checkpoint; check-in tercatat dan langsung
  terlihat di riwayat checkpoint itu.
  Member check-in at a checkpoint (contract §6: POST .../checkpoints/:id/
  check-in): one tap per checkpoint; the check-in is recorded and
  immediately visible in that checkpoint's history.
- Headcount akhir + penutupan trip (kontrak §17): layar menampilkan
  total vs terhitung + daftar anggota belum terhitung dari GET
  `/trip-groups/:id/headcount` ("terhitung" server = anggota DEPARTED
  via check-in meeting point §2). Tombol "Tutup trip" (LEADER) memanggil
  POST `/trip-groups/:id/close`: tanpa konfirmasi dan masih ada yang
  belum terhitung, server menolak 409 TRIP_HAS_UNACCOUNTED_MEMBERS —
  layar menampilkan daftar belum terhitung + tombol konfirmasi eksplisit
  (confirmUnaccounted: true). Trip tidak pernah ditutup diam-diam.
  Final headcount + trip close (contract §17): the screen shows total
  vs counted + the unaccounted member list from GET
  `/trip-groups/:id/headcount` (server "counted" = DEPARTED members via
  §2 meeting-point check-in). The "Close trip" button (LEADER) calls
  POST `/trip-groups/:id/close`: without confirmation and with members
  unaccounted, the server refuses with 409
  TRIP_HAS_UNACCOUNTED_MEMBERS — the screen shows the unaccounted list
  + an explicit confirm button (confirmUnaccounted: true). A trip never
  closes silently.
- Mode demo: tanpa token/server, checkpoint + check-in + headcount
  jalan lokal (checkpoint demo: Basecamp Patak Banteng, Pos 2, Puncak
  Prau). Headcount demo adalah PERKIRAAN yang didokumentasikan:
  "terhitung" = anggota yang sudah check-in di minimal satu checkpoint
  (anggota demo tidak punya status DEPARTED — check-in meeting point §2
  belum ada UI-nya di mobile); di mode live, headcount selalu dari
  server (DEPARTED). Check-in demo dicatat atas nama leader trip (di
  mode demo, pengguna aplikasi adalah leader).
  Demo mode: without a token/server, checkpoints + check-ins +
  headcount run locally (demo checkpoints: Patak Banteng Basecamp, Post
  2, Prau Summit). Demo headcount is a DOCUMENTED approximation:
  "counted" = members checked in at at least one checkpoint (demo
  members have no DEPARTED status — §2 meeting-point check-in has no
  mobile UI yet); in live mode, headcount always comes from the server
  (DEPARTED). Demo check-ins are recorded under the trip leader (in
  demo mode, the app user is the leader).

Yang SENGAJA tidak ada di M4 (kartu lain):
Deliberately NOT in M4 (other cards):

- Check-in meeting point (§2) + attendance-summary: endpoint server
  sudah ada, tapi belum ada UI-nya di mobile — headcount live tetap
  memakai angka DEPARTED server apa adanya.
  Meeting-point check-in (§2) + attendance-summary: the server
  endpoint exists, but there is no mobile UI for it yet — live
  headcount still uses the server DEPARTED numbers as-is.
- GPS adaptif = M5. Perubahan alur SOS = tidak ada (M2 selesai).
  Layar login/register = kartu nanti (demo pakai token env).
  Adaptive GPS = M5. SOS flow changes = none (M2 is done).
  Login/register screens = a later card (demo uses an env token).

## M5 — GPS adaptif (Adaptive GPS) — kartu ini / this card

- Interval posisi menyesuaikan konteks (kontrak §3, resolver
  `src/utils/tracking-interval.ts`): hiking 60 detik, touring 15–30
  detik (15 detik saat kecepatan >= 10 m/s atau tidak diketahui,
  30 detik saat lebih lambat), diam = pause kirim (bukan timer:
  watcher beralih ke filter jarak 25 m supaya gerakan terdeteksi
  lagi), baterai < 20% = 3 menit (ujung hemat dari rentang 3–5 menit;
  baterai rendah mengalahkan diam supaya perangkat yang diam tetap
  mengirim heartbeat 3 menit dan tidak dibaca M6 sebagai hilang
  sinyal).
  Position interval adapts to context (contract §3, resolver
  `src/utils/tracking-interval.ts`): hiking 60s, touring 15–30s
  (15s when speed >= 10 m/s or unknown, 30s when slower), still =
  pause sending (not a timer: the watcher switches to a 25 m
  distance filter so movement is detected again), battery < 20% =
  3 minutes (the saving end of the 3–5 min range; low battery beats
  still so a still device still sends a 3-minute heartbeat and is
  not read by M6 as signal loss).
- Mode live: posisi perangkat dibaca foreground lewat
  `expo-location` (`src/hooks/use-adaptive-tracking.ts`) dan di-POST
  ke REST F2 (`POST /trip-groups/:id/locations`, kontrak §3,
  `postServerLocation` di `src/utils/live-api.ts`); server
  memvalidasi + menyimpan + broadcast `location-update` ke room trip
  (M1/wiring tidak diubah). Izin lokasi ditolak = diam, peta tetap
  jalan dari broadcast anggota lain. Tanpa token/server = diam.
  Live mode: device position is read in the foreground via
  `expo-location` (`src/hooks/use-adaptive-tracking.ts`) and POSTed
  to F2 REST (`POST /trip-groups/:id/locations`, contract §3,
  `postServerLocation` in `src/utils/live-api.ts`); the server
  validates + stores + broadcasts `location-update` to the trip room
  (M1/wiring unchanged). Location permission denied = silent, the map
  keeps running on other members' broadcasts. No token/server =
  silent.
- Mode demo: tick demo memakai interval adaptif yang sama
  (`use-live-positions.ts` memakai resolver; demo selalu bergerak
  dan tanpa info baterai, jadi tick demo tidak pernah pause).
  Demo mode: the demo tick uses the same adaptive interval
  (`use-live-positions.ts` uses the resolver; the demo always moves
  and has no battery info, so the demo tick never pauses).
- Pelacakan latar (`src/utils/tracking-task.ts`, `defineTask` di
  module scope, diimpor root layout `src/app/_layout.tsx`): lokasi
  diteruskan ke REST F2 saat aplikasi di-background; Android pakai
  foreground service (`killServiceOnDestroy: false`) dengan
  notifikasi i18n (`tracking.notificationTitle` /
  `tracking.notificationBody`). Izin latar ditolak = foreground tetap
  jalan. Gap saat aplikasi di-force-close TIDAK bisa dipulihkan
  (catatan M5).
  Background tracking (`src/utils/tracking-task.ts`, `defineTask` at
  module scope, imported by the root layout `src/app/_layout.tsx`):
  locations keep flowing to F2 REST while the app is backgrounded;
  Android uses a foreground service (`killServiceOnDestroy: false`)
  with i18n notifications (`tracking.notificationTitle` /
  `tracking.notificationBody`). Background permission denied =
  foreground keeps running. Gaps while the app is force-closed
  CANNOT be recovered (M5 note).
- Dependensi baru (SDK 58, lewat `npx expo install`): `expo-location`,
  `expo-task-manager`, `expo-battery`; plugin `expo-location`
  ditambahkan ke `app.json`. React tetap 19.3.0 (pin SDK 58).
  New dependencies (SDK 58, via `npx expo install`): `expo-location`,
  `expo-task-manager`, `expo-battery`; the `expo-location` plugin is
  added to `app.json`. React stays 19.3.0 (SDK 58 pin).
- Alur SOS (M2) dan checkpoint/headcount (M4) TIDAK diubah; Beacon
  tetap DI-HOLD.
  The SOS flow (M2) and checkpoint/headcount (M4) are UNCHANGED;
  Beacon stays ON HOLD.

## Tes / Tests (W-2+W-4, TDD)

```sh
npm test            # bun test src/__tests__ — 33 tes
```

Suite (RED dulu, lalu config/kode GREEN — aturan TDD repo):

- `app-config.test.ts` — guard W-2 (purpose string expo-location wajib
  menyebut rombongan + SOS, tiga flag background true) + W-4 (eas.json
  profil development dev-client internal + production autoIncrement).
  Gagal bila config dihapus/salah bentuk.
- `tracking-interval.test.ts` — regresi M5 (hiking 60 dtk, touring
  15/30 dtk, diam = pause, baterai <20% = 3 menit, "baterai rendah
  mengalahkan diam", batas tepat 20% tidak hemat).
- `outbox-logic.test.ts` — regresi M7 (SOS sebelum posisi + FIFO,
  backoff 5/15/30/60/120 mentok 300 dtk, pemadatan >30 menit per trip,
  SOS tidak pernah dipadatkan, baris korup ditolak null).
- `member-alerts.test.ts` — regresi M6 (haversine, off-route muncul di
  update ke-2 dan bukan karena satu spike GPS, anti-banjir satu entri
  per kejadian, diam 11 menit vs hilang sinyal, gerak >25 m me-reset
  jam diam, off-route nonaktif bila <2 checkpoint).

Test dikecualikan dari tsconfig aplikasi (`src/__tests__` di-exclude);
runner = `bun test`, bukan tsc.
Tests are excluded from the app tsconfig (`src/__tests__` excluded);
the runner is `bun test`, not tsc.

## Perintah / Commands

```sh
cd apps/mobile
npm install
npx expo start        # bundler Metro
npm run android       # butuh development build / requires a development build
npm run ios           # butuh macOS + development build
npm run web           # bundle web statis / static web bundle
```

Catatan: Expo Go untuk SDK 58 belum tersedia di store saat scaffold ini
dibuat, jadi jalankan di development build, bukan Expo Go. Development
build dibuat lewat EAS (`eas build --profile development`) atau lokal via
`npx expo run:android` / `npx expo run:ios` setelah prebuild.
Note: Expo Go for SDK 58 was not in the stores when this scaffold was made,
so run on a development build, not Expo Go. Build one with EAS
(`eas build --profile development`) or locally via
`npx expo run:android` / `npx expo run:ios` after prebuild.

## Yang sengaja belum ada / Deliberately not here yet

- Ikon aplikasi, splash image, dan favicon: sengaja tidak ikut di F1 karena
  scaffold ini hanya berisi file teks (batas push connector). Ditambahkan
  di kartu berikutnya.
  App icon, splash image, and favicon: intentionally left out of F1 because
  this scaffold contains text files only (connector push limits). They will
  be added in a later card.
- Layar Settings + switcher bahasa dan fitur M7
  (M5–M6 selesai di kartu ini).
  Settings screen + language switcher, and M7 features
  (M5–M6 are done in this card).
- `.env` dan kunci API apa pun: JANGAN PERNAH di-commit. Pakai env var /
  secret store saja.
  Any `.env` file and any API key: NEVER commit them. Use env vars / a secret
  store only.

## Verifikasi F1 / F1 verification

- `npx tsc --noEmit` lolos (typecheck).
  `npx tsc --noEmit` passes (typecheck).
- `npx expo config --type public` lolos (konfigurasi valid).
  `npx expo config --type public` passes (valid config).
- `npx expo export --platform web` lolos (Metro me-resolve semua modul).
  `npx expo export --platform web` passes (Metro resolves all modules).
- Tidak ada string user-facing hardcode di `src/app/` — semua lewat `t(key)`.
  No hardcoded user-facing strings in `src/app/` — everything goes through
  `t(key)`.

## Verifikasi M1 / M1 verification

- `npx tsc --noEmit` lolos (typecheck, termasuk kamus `en` bertipe
  `Translations` — kunci `trips.*` yang hilang = type error).
  `npx tsc --noEmit` passes (typecheck, including the `en` dictionary typed
  as `Translations` — a missing `trips.*` key = type error).
- `npx expo config --type public` lolos (sdkVersion 58.0.0).
  `npx expo config --type public` passes (sdkVersion 58.0.0).
- `npx expo export --platform web` lolos (Metro me-resolve semua modul,
  termasuk rute `/trips`, `/trips/new`, `/trips/[id]`).
  `npx expo export --platform web` passes (Metro resolves all modules,
  including the `/trips`, `/trips/new`, `/trips/[id]` routes).
- Tidak ada string user-facing hardcode di file M1 baru — semua lewat
  `t(key)`; nama trip/anggota adalah data, bukan string UI.
  No hardcoded user-facing strings in the new M1 files — everything goes
  through `t(key)`; trip/member names are data, not UI strings.
- Tidak ada `.env` di `apps/mobile/`; tidak ada dependensi baru
  (`package.json` / `package-lock.json` tidak berubah).
  No `.env` in `apps/mobile/`; no new dependencies (`package.json` /
  `package-lock.json` unchanged).

## Verifikasi wiring live / Live wiring verification

- `npx tsc --noEmit` lolos (termasuk kamus `en` bertipe `Translations` —
  kunci `trips.loading` / `trips.sourceLive` / `trips.sourceDemo` yang
  hilang = type error).
  `npx tsc --noEmit` passes (including the `en` dictionary typed as
  `Translations` — a missing `trips.loading` / `trips.sourceLive` /
  `trips.sourceDemo` key = type error).
- `npx expo config --type public` lolos (sdkVersion 58.0.0, React 19.3.0).
  `npx expo config --type public` passes (sdkVersion 58.0.0, React 19.3.0).
- `npx expo export --platform web` lolos (Metro me-resolve `socket.io-client`
  + semua rute; tanpa token/server, export tetap jalan dalam mode demo).
  `npx expo export --platform web` passes (Metro resolves `socket.io-client`
  + all routes; without a token/server, the export still runs in demo mode).
- Dependensi baru: `socket.io-client` (JS murni, tanpa modul native —
  jalur verifikasi export web tetap jalan).
  New dependency: `socket.io-client` (pure JS, no native module — the web
  export verification path still works).

## Verifikasi M2 / M2 verification

- `npx tsc --noEmit` lolos (termasuk kamus `en` bertipe `Translations` —
  kunci `sos.*` yang hilang = type error).
  `npx tsc --noEmit` passes (including the `en` dictionary typed as
  `Translations` — a missing `sos.*` key = type error).
- `npx expo config --type public` lolos (sdkVersion 58.0.0, React 19.3.0).
  `npx expo config --type public` passes (sdkVersion 58.0.0, React 19.3.0).
- `npx expo export --platform web` lolos (Metro me-resolve semua modul,
  termasuk rute `/trips/sos`; tanpa token/server, export tetap jalan
  dalam mode demo).
  `npx expo export --platform web` passes (Metro resolves all modules,
  including the `/trips/sos` route; without a token/server, the export
  still runs in demo mode).
- Tidak ada string user-facing hardcode di file M2 baru — semua lewat
  `t(key)`; kode alasan SOS (TERSESAT, dst.) adalah data, bukan string UI.
  No hardcoded user-facing strings in the new M2 files — everything goes
  through `t(key)`; SOS reason codes (TERSESAT, etc.) are data, not UI
  strings.
- Tidak ada dependensi baru, tidak ada `.env` (`package.json` /
  `package-lock.json` tidak berubah).
  No new dependencies, no `.env` (`package.json` / `package-lock.json`
  unchanged).

## Verifikasi M4 / M4 verification

- `npx tsc --noEmit` lolos (termasuk kamus `en` bertipe `Translations` —
  kunci `checkpoints.*` yang hilang = type error).
  `npx tsc --noEmit` passes (including the `en` dictionary typed as
  `Translations` — a missing `checkpoints.*` key = type error).
- `npx expo config --type public` lolos (sdkVersion 58.0.0, React 19.3.0).
  `npx expo config --type public` passes (sdkVersion 58.0.0, React 19.3.0).
- `npx expo export --platform web` lolos (Metro me-resolve semua modul,
  termasuk rute baru `/trips/checkpoints`; tanpa token/server, export
  tetap jalan dalam mode demo).
  `npx expo export --platform web` passes (Metro resolves all modules,
  including the new `/trips/checkpoints` route; without a token/server,
  the export still runs in demo mode).
- Tidak ada string user-facing hardcode di file M4 baru — semua lewat
  `t(key)`; nama checkpoint/anggota adalah data, bukan string UI.
  No hardcoded user-facing strings in the new M4 files — everything goes
  through `t(key)`; checkpoint/member names are data, not UI strings.
- Tidak ada dependensi baru, tidak ada `.env` (`package.json` /
  `package-lock.json` tidak berubah).
  No new dependencies, no `.env` (`package.json` / `package-lock.json`
  unchanged).


## Verifikasi M5 / M5 verification

- `npx tsc --noEmit` lolos (termasuk kamus `en` bertipe `Translations` —
  kunci `tracking.*` yang hilang = type error; tipe opsi
  `expo-location`/`expo-task-manager` tervalidasi, mis. bentuk callback
  `defineTask` harus async).
  `npx tsc --noEmit` passes (including the `en` dictionary typed as
  `Translations` — a missing `tracking.*` key = type error; the
  `expo-location`/`expo-task-manager` option types are validated,
  e.g. the `defineTask` callback shape must be async).
- `npx expo config --type public` lolos (sdkVersion 58.0.0, React 19.3.0;
  plugin `expo-location` menyumbang izin Android
  ACCESS_COARSE_LOCATION + ACCESS_FINE_LOCATION).
  `npx expo config --type public` passes (sdkVersion 58.0.0, React 19.3.0;
  the `expo-location` plugin contributes the Android permissions
  ACCESS_COARSE_LOCATION + ACCESS_FINE_LOCATION).
- `npx expo export --platform web` lolos (Metro me-resolve modul native
  baru `expo-location`/`expo-task-manager`/`expo-battery` di bundle web;
  semua 8 rute statis ikut, termasuk `/trips/[id]`).
  `npx expo export --platform web` passes (Metro resolves the new native
  modules `expo-location`/`expo-task-manager`/`expo-battery` in the web
  bundle; all 8 static routes are included, including `/trips/[id]`).
- Logika resolver tervalidasi langsung: 9 kasus (hiking 60 dtk,
  touring cepat 15 dtk, touring lambat 30 dtk, touring tanpa kecepatan
  15 dtk, diam = pause, baterai rendah 3 menit incl. diam + baterai
  rendah, batas 20% tidak hemat) — semua lolos.
  Resolver logic validated directly: 9 cases (hiking 60s, touring fast
  15s, touring slow 30s, touring without speed 15s, still = pause,
  low battery 3 min incl. still + low battery, the 20% boundary not
  saving) — all pass.
- Tidak ada string user-facing hardcode di file M5 baru/berubah — semua
  lewat `t(key)` (kunci baru hanya `tracking.notificationTitle` /
  `tracking.notificationBody`, bentuknya identik di `id.ts`/`en.ts`).
  No hardcoded user-facing strings in the new/changed M5 files —
  everything goes through `t(key)` (the only new keys are
  `tracking.notificationTitle` / `tracking.notificationBody`, identical
  in shape in `id.ts`/`en.ts`).
- Dependensi baru: `expo-location`, `expo-task-manager`, `expo-battery`
  (SDK 58, lewat `npx expo install`); tidak ada `.env`.
  New dependencies: `expo-location`, `expo-task-manager`, `expo-battery`
  (SDK 58, via `npx expo install`); no `.env`.
- GPS perangkat TIDAK bisa dites dari VM ini — follow-up perangkat:
  (1) izin foreground + background di development build, (2) interval
  adaptif terlihat di peta live, (3) pause saat diam + lanjut saat
  bergerak 25 m, (4) notifikasi foreground service Android, (5) entri
  manifest izin latar (plugin hanya menyumbang izin
  coarse/fine di config).
  Device GPS CANNOT be tested from this VM — device follow-up:
  (1) foreground + background permission on a development build,
  (2) adaptive intervals visible on the live map, (3) pause while
  still + resume after 25 m of movement, (4) the Android foreground
  service notification, (5) the background-permission manifest entry
  (the plugin only contributes coarse/fine permissions in config).

## M6 — Deteksi diam / off-route (Still / off-route detection) — kartu ini / this card

- Parameter (keputusan the project lead, DM 09:40:28 AEDT 2026-10-27 — bukan
  tebakan; AC kanban-detail M6 tidak menyebut angkanya):
  diam lama = posisi tidak berubah signifikan selama >10 menit, dan
  hilang sinyal >10 menit memicu peringatan yang SAMA (disamakan
  dengan konstanta hilang sinyal kontrak §5, default >10 menit);
  off-route = polyline antar checkpoint berurutan di trip itu, jarak
  >100 m dari segmen terdekat, terkonfirmasi 2 update lokasi
  berturut-turut (bukan satu spike GPS); trip dengan <2 checkpoint =
  off-route tidak aktif (tidak ada acuan), hanya diam/sinyal yang
  jalan.
  Parameters (the project lead's decisions, DM 09:40:28 AEDT 2026-10-27 — not
  guesses; the kanban-detail M6 AC states no numbers):
  still = position not significantly changed for >10 min, and signal
  lost >10 min triggers the SAME warning (aligned with the contract
  §5 signal-lost constant, default >10 min);
  off-route = the polyline between the trip's sequential checkpoints,
  >100 m from the nearest segment, confirmed on 2 consecutive
  location updates (not a single GPS spike); a trip with <2
  checkpoints = off-route inactive (no reference), only still/signal
  detection runs.
- Peringatan ke leader, dua-duanya (keputusan the project lead): badge/marker
  khusus di peta live + daftar/banner peringatan di layar trip,
  supaya leader lihat tanpa buka peta. Deteksi jalan lokal di
  perangkat leader dari posisi live yang diterima (bukan GPS
  perangkat sendiri); M6 TIDAK mengirim ke server — kontrak hanya
  punya GET member-alerts, tanpa POST, jadi asumsi lokal benar;
  server-side member-alerts jadi follow-up terpisah, bukan di M6.
  Leader warnings, both (the project lead's decision): a special badge/marker
  on the live map + a warning list/banner on the trip screen, so the
  leader sees them without opening the map. Detection runs locally
  on the leader's device from received live positions (not the
  device's own GPS); M6 sends NOTHING to the server — the contract
  has GET member-alerts only, no POST, so the local-only assumption
  is correct; server-side member-alerts are a separate follow-up,
  not in M6.
- Anti-banjir (keputusan the project lead): satu peringatan per anggota per
  kejadian sampai pulih, tanpa cooldown timer tambahan. Pulih =
  kembali ke rute (<=100 m) / bergerak lagi / sinyal kembali; alert
  hilang, kejadian baru boleh memicu lagi. Selama kejadian masih
  aktif, peringatan tidak diulang meski update lokasi terus masuk.
  Daftar peringatan di layar hanya berisi satu entri per anggota per
  kind — entri yang sama bertahan selama kondisinya aktif.
  Anti-flood (the project lead's decision): one warning per member per incident
  until recovered, no extra cooldown timer. Recovered = back on
  route (<=100 m) / moving again / signal back; the alert clears and
  a new incident may trigger again. While an incident is still
  active, the warning is not repeated even as location updates keep
  arriving. The on-screen alert list holds one entry per member per
  kind — the same entry persists while its condition holds.
- Implementasi: `src/utils/member-alerts.ts` (fungsi murni: haversine
  + jarak titik-segmen + `evaluateMemberAlerts`; tanpa impor store
  supaya logikanya dites tanpa perangkat) dan
  `src/hooks/use-member-alerts.ts` (evaluasi ulang tiap 30 detik
  supaya peringatan diam/sinyal muncul walau tidak ada posisi baru
  yang masuk — anggota diam tidak mengirim update). Layar trip
  menampilkan seksi peringatan + badge "!" oranye di marker anggota
  off-route (warna marker baku M1 tidak diubah) + entri legenda
  off-route; layar trip memakai hook `useCheckpoints` supaya
  polyline acuan tersedia tanpa harus membuka layar checkpoint dulu
  (demo: seed lokal; live: REST — hook yang sama, bukan duplikat
  logika).
  Implementation: `src/utils/member-alerts.ts` (pure functions:
  haversine + point-to-segment distance + `evaluateMemberAlerts`; no
  store imports so the logic tests without a device) and
  `src/hooks/use-member-alerts.ts` (re-evaluates every 30s so
  still/signal warnings appear even when no new position arrives —
  a still member sends no updates). The trip screen shows the alert
  section + an orange "!" badge on off-route members' markers (the
  standard M1 marker colors are untouched) + an off-route legend
  entry; the trip screen uses the `useCheckpoints` hook so the
  reference polyline is available without opening the checkpoint
  screen first (demo: local seed; live: REST — the same hook, not
  duplicated logic).
- Pilihan implementasi yang DICATAT (bukan keputusan the project lead, supaya QC
  bisa menantang nilainya): gerakan "signifikan" = 25 m (dipinjam
  dari filter jarak pause M5, `PAUSED_DISTANCE_M`); penampakan
  pertama anggota dihitung sebagai update konfirmasi ke-1 off-route
  (posisi REST awal + 1 broadcast = 2 update berturut-turut — tanpa
  ini alert butuh 3 posisi); sinyal kembali setelah hilang >10 menit
  me-reset jam diam (kalau tidak, peringatan langsung muncul lagi
  sebagai "kejadian baru" padahal sinyal baru saja kembali).
  Documented implementation choices (NOT the project lead decisions, so QC can
  challenge them): "significant" movement = 25 m (borrowed from the
  M5 pause distance filter, `PAUSED_DISTANCE_M`); a member's first
  sighting counts as off-route confirmation update #1 (the initial
  REST position + 1 broadcast = 2 consecutive updates — without this
  an alert would need 3 positions); signal back after >10 min lost
  resets the still clock (otherwise the warning would instantly
  reappear as a "new incident" right after signal returns).
- Catatan demo: anggota demo bergerak di sepanjang jalur (tidak
  memicu diam); anggota demo yang sudah di puncak dan berhenti
  mengirim (Nadia, progress 1) memicu peringatan hilang sinyal
  setelah 10 menit aplikasi berjalan — itu perilaku yang benar,
  bukan false alarm (perangkatnya memang berhenti mengirim).
  Demo note: demo members move along the route (no still trigger);
  the demo member already at the summit who stops sending (Nadia,
  progress 1) triggers a signal-lost warning after 10 minutes of app
  runtime — that is correct behavior, not a false alarm (her device
  really stopped sending).
- Alur SOS (M2), checkpoint/headcount (M4), dan GPS adaptif (M5)
  TIDAK diubah; tanpa dependensi baru; Beacon tetap DI-HOLD.
  The SOS flow (M2), checkpoint/headcount (M4), and adaptive GPS
  (M5) are UNCHANGED; no new dependencies; Beacon stays ON HOLD.

## Verifikasi M6 / M6 verification

- `npx tsc --noEmit` lolos (termasuk kamus `en` bertipe `Translations`
  — kunci `alerts.*` + `trips.legend.offRoute` yang hilang = type
  error).
  `npx tsc --noEmit` passes (including the `en` dictionary typed as
  `Translations` — a missing `alerts.*` or `trips.legend.offRoute`
  key = type error).
- `npx expo config --type public` lolos (sdkVersion 58.0.0, React
  19.3.0 — pin SDK, tidak di-upgrade).
  `npx expo config --type public` passes (sdkVersion 58.0.0, React
  19.3.0 — SDK pin, not upgraded).
- `npx expo export --platform web` lolos (8 rute statis, termasuk
  `/trips/[id]` + `/trips/checkpoints`). Catatan: export sempat gagal
  sekali dengan `Cannot read properties of null (reading 'useState')`
  di `LanguageProvider` — penyebabnya symlink nyasar
  `node_modules/node_modules` -> copy M5 (Metro me-resolve React
  ganda); symlink itu dihapus (artefak working copy lokal, TIDAK
  ikut di-commit), export lolos. Preseden yang sama pernah terjadi
  di M2.
  `npx expo export --platform web` passes (8 static routes,
  including `/trips/[id]` + `/trips/checkpoints`). Note: export
  failed once with `Cannot read properties of null (reading
  'useState')` in `LanguageProvider` — caused by a stray
  `node_modules/node_modules` symlink -> the M5 copy (Metro
  resolving React twice); that symlink was deleted (a local working
  copy artifact, NOT committed) and export passed. The same
  precedent occurred in M2.
- Logika deteksi tervalidasi langsung (modul tanpa impor, compile +
  jalan di Node): haversine 0,001° lintang = 111,2 m; jarak ke
  polyline demo = 0 di checkpoint, >100 m di luar rute, null bila
  <2 checkpoint; off-route muncul di update ke-2 (bukan ke-1),
  satu entri saja selama off-route, hilang saat kembali ke rute;
  satu spike GPS di antara posisi on-route TIDAK memicu; diam 11
  menit posisi sama -> still (signalLost false); diam tanpa update
  11 menit -> still (signalLost true); sinyal kembali setelah gap
  >10 menit -> alert hilang, lalu diam 11 menit lagi -> still baru;
  bergerak >25 m me-reset anchor diam.
  Detection logic validated directly (import-free module, compiled +
  run in Node): haversine 0.001° latitude = 111.2 m; distance to the
  demo polyline = 0 at a checkpoint, >100 m off-route, null with <2
  checkpoints; off-route appears on the 2nd update (not the 1st),
  one entry only while off-route, clears on return to route; a
  single GPS spike between on-route positions does NOT trigger;
  11 min same-spot -> still (signalLost false); 11 min without
  updates -> still (signalLost true); signal back after a >10 min
  gap -> alert clears, then 11 more min still -> a new still alert;
  moving >25 m resets the still anchor.
- Tidak ada string user-facing hardcode di file M6 baru/berubah —
  semua lewat `t(key)` (kunci baru `alerts.*` +
  `trips.legend.offRoute`, bentuknya identik di `id.ts`/`en.ts`).
  No hardcoded user-facing strings in the new/changed M6 files —
  everything goes through `t(key)` (the new keys are `alerts.*` +
  `trips.legend.offRoute`, identical in shape in `id.ts`/`en.ts`).
- Perangkat TIDAK bisa dites dari VM ini — follow-up perangkat:
  peringatan diam/off-route terlihat di layar trip + badge "!" di
  peta live pada development build dengan posisi live nyata.
  Devices CANNOT be tested from this VM — device follow-up:
  still/off-route warnings visible on the trip screen + the "!"
  badge on the live map in a development build with real live
  positions.

## M7 — Store-and-forward saat sinyal lemah

- Antrean posisi + SOS (BUKAN checkpoint) — keputusan the project lead (DM
  11:01:54 AEDT 2026-10-27): posisi dan SOS yang gagal kirim masuk
  antrean lokal (expo-sqlite, persisten di perangkat) lalu dikirim
  otomatis begitu sinyal kembali; checkpoint tetap online-only
  dengan pesan offline yang jelas (checkpoints.errors.offline),
  karena retry buta bisa double check-in / menutup trip prematur.
  Queue for positions + SOS (NOT checkpoints) — the project lead's decision
  (DM 11:01:54 AEDT 2026-10-27): positions and SOS that fail to send
  enter a local queue (expo-sqlite, persisted on device) and are
  sent automatically once signal returns; checkpoints stay
  online-only with a clear offline message
  (checkpoints.errors.offline), because blind retries could double
  check-in / close a trip prematurely.
- Dedup sisi mobile: tiap item dibuat sekali dengan clientId stabil
  yang tersimpan bersama itemnya, tidak pernah dibuat ulang saat
  retry; item dihapus HANYA setelah server balas sukses (2xx).
  Dedup sisi server (kunci clientId) adalah follow-up the project lead, bukan
  blocker M7.
  Mobile-side dedup: each item is created once with a stable
  clientId stored with it, never recreated on retry; items are
  removed ONLY after a server success (2xx). Server-side dedup (a
  clientId key) is the project lead's follow-up, not an M7 blocker.
- Urutan: SOS prioritas (tertua dulu, semua SOS sebelum posisi),
  lalu posisi FIFO. SOS tidak pernah dibuang dan tidak ada expiry —
  di-retry sampai sukses dengan backoff (5/15/30/60/120 dtk, mentok
  300 dtk) dan status antreannya terlihat di layar SOS (badge
  antrean + keterangan; begitu terkirim, alert lokal diganti alert
  server). Posisi >30 menit saat sinyal kembali dipadatkan jadi
  satu posisi terbaru per trip (bukan dikirim semua, bukan dibuang
  semua); posisi <30 menit dikirim berurutan.
  Order: SOS priority (oldest first, all SOS before positions),
  then positions FIFO. SOS is never discarded and has no expiry —
  retried until success with backoff (5/15/30/60/120s, capped at
  300s) and its queue status is visible on the SOS screen (queue
  badge + note; once delivered, the local alert is replaced by the
  server alert). Positions >30 min old on reconnect are compacted
  to a single newest position per trip (not all sent, not all
  discarded); positions <30 min old are sent in order.
- Pemicu flush: layar trip/SOS dibuka, jaringan kembali online
  (expo-network), dan tick 60 detik sebagai jaring pengaman;
  flush menghormati nextRetryAt tiap item dan dijaga dari flush
  bersamaan. Token dibaca segar tiap flush, tidak pernah disimpan
  di antrean.
  Flush triggers: trip/SOS screen opened, network back online
  (expo-network), and a 60-second tick as a safety net; flush
  respects each item's nextRetryAt and is guarded against
  concurrent flushes. The token is read fresh on every flush,
  never stored in the queue.
- Penyimpanan per platform (fallback terdokumentasi): expo-sqlite
  untuk native; localStorage untuk web — karena `expo export
  --platform web` GAGAL dengan bundle sqlite (Metro tidak bisa
  me-resolve ./wa-sqlite/wa-sqlite.wasm dari worker web
  expo-sqlite). Metro memilih outbox-store.web.ts untuk web dan
  outbox-store.ts (sqlite) untuk native; outbox.ts tidak pernah
  mengimpor expo-sqlite langsung. Bila sqlite gagal dibuka (mis.
  konteks tugas latar) atau localStorage tidak tersedia, antrean
  jatuh ke memori dan tetap jalan selama aplikasi/halaman hidup;
  kegagalan penyimpanan tidak merusak layar. Dependensi baru:
  expo-sqlite ~58.0.14, expo-network ~58.0.4 (SDK 58, via
  `npx expo install`).
  Per-platform storage (documented fallback): expo-sqlite for
  native; localStorage for web — because `expo export --platform
  web` FAILED with the sqlite bundle (Metro cannot resolve
  ./wa-sqlite/wa-sqlite.wasm from expo-sqlite's web worker).
  Metro picks outbox-store.web.ts for web and outbox-store.ts
  (sqlite) for native; outbox.ts never imports expo-sqlite
  directly. If sqlite cannot be opened (e.g. a background-task
  context) or localStorage is unavailable, the queue falls back
  to memory and still works while the app/page lives; storage
  failures never break a screen. New dependencies: expo-sqlite
  ~58.0.14, expo-network ~58.0.4 (SDK 58, via `npx expo install`).
- Logika antrean tervalidasi langsung (modul tanpa impor, compile +
  jalan di Node): urutan SOS-sebelum-posisi + FIFO dalam jenis;
  pemadatan (ada posisi >30 menit -> hanya terbaru per trip yang
  bertahan; semua segar -> semua bertahan berurutan; SOS tidak
  pernah dipadatkan; pemadatan per trip independen); backoff
  5/15/30/60/120 dtk mentok 300 dtk; clientId unik per counter.
  Queue logic validated directly (import-free module, compiled +
  run in Node): SOS-before-positions order + FIFO within kind;
  compaction (any >30 min position -> only the newest per trip
  survives; all fresh -> all survive in order; SOS never
  compacted; compaction independent per trip); backoff
  5/15/30/60/120s capped at 300s; unique clientId per counter.
- Tidak ada string user-facing hardcode di file M7 baru/berubah —
  semua lewat `t(key)` (kunci baru `outbox.*` +
  `checkpoints.errors.offline`, bentuknya identik di `id.ts`/
  `en.ts`).
  No hardcoded user-facing strings in the new/changed M7 files —
  everything goes through `t(key)` (the new keys are `outbox.*` +
  `checkpoints.errors.offline`, identical in shape in `id.ts`/
  `en.ts`).
- Perangkat TIDAK bisa dites dari VM ini — follow-up perangkat:
  antrean SOS + flush otomatis pada development build dengan
  posisi live nyata dan mode pesawat on/off.
  Devices CANNOT be tested from this VM — device follow-up:
  SOS queue + automatic flush in a development build with real
  live positions and airplane mode on/off.

## H1 — Hardening + QA end-to-end (alur SOS → dashboard → WA)

Kartu H1 sisi mobile: audit hardening + verifikasi ujung-ke-ujung
sejauh yang bisa dites dari VM ini, tanpa mengubah alur SOS (M2),
checkpoint/headcount (M4), GPS adaptif (M5), deteksi (M6), atau
antrean (M7). Tidak ada perubahan kode di `src` — audit bersih,
jadi PR ini hanya dokumentasi: bagian H1 ini + koreksi 2 penyebutan
Wablas yang sudah basi di `docs/api-contract.md` (lihat bawah).
H1 mobile-side work: hardening audit + end-to-end verification as
far as testable from this VM, without changing the SOS (M2),
checkpoint/headcount (M4), adaptive GPS (M5), detection (M6), or
queue (M7) flows. No code changes in `src` — the audit came out
clean, so this PR is documentation only: this H1 section + fixing
2 stale Wablas mentions in `docs/api-contract.md` (see below).

- Audit secret: tidak ada file `.env` di tree mobile; tidak ada
  pola secret hardcode (kunci API/token/password) di `src`;
  `.gitignore` root (`.env`, `.env.*`) + mobile (`.env`,
  `.env*.local`, `dist/`, `*.pem`, `*.key`) melarangnya;
  `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_API_TOKEN` hanya dibaca via
  `readEnv` (token demo hanya di `.env.local`, tidak pernah
  di-commit); tidak ada `console.*` di `src` (token tidak pernah
  di-log); tidak ada `TODO`/`FIXME`/`Alert.alert` di `src`.
  Secret audit: no `.env` files in the mobile tree; no hardcoded
  secret patterns (API keys/tokens/passwords) in `src`; root
  (`.env`, `.env.*`) + mobile (`.env`, `.env*.local`, `dist/`,
  `*.pem`, `*.key`) gitignores forbid them; `EXPO_PUBLIC_API_URL`/
  `EXPO_PUBLIC_API_TOKEN` are only read via `readEnv` (the demo
  token lives only in `.env.local`, never committed); no
  `console.*` in `src` (tokens are never logged); no
  `TODO`/`FIXME`/`Alert.alert` in `src`.
- Audit Beacon: tidak ada kode Beacon di `src` — hanya catatan
  DI-HOLD di README ini. Alur SOS → dashboard → WA yang diuji
  tidak menyentuh Beacon.
  Beacon audit: no Beacon code in `src` — only ON HOLD notes in
  this README. The tested SOS → dashboard → WA flow touches no
  Beacon.
- Audit WA di mobile: tidak ada kode/path WA di `src` — hanya
  komentar di `sos-api.ts` yang menyatakan mobile TIDAK PERNAH
  mengirim WA/Wablas; pengiriman WA sepenuhnya server-side.
  Mobile WA audit: no WA code/path in `src` — only comments in
  `sos-api.ts` stating mobile NEVER sends WA/Wablas; WA sending
  is entirely server-side.
- Audit i18n + validasi + error: semua layar/komponen memakai
  `t(key)` (tidak ada string UI hardcode yang ditemukan);
  validasi input ada (tanggal trip regex
  `/^\d{4}-\d{2}-\d{2}$/`, lat/lon numerik di checkpoint, alasan
  SOS kontekstual per tipe trip + validasi server
  `SOS_REASON_INVALID_FOR_TRIP_TYPE`/`INVALID_LOCATION`);
  penanganan error ada (403 → pesan penolakan, 409
  `TRIP_HAS_UNACCOUNTED_MEMBERS` → konfirmasi eksplisit,
  pesan offline checkpoint yang jelas, fallback Demo lokal).
  i18n + validation + error audit: all screens/components use
  `t(key)` (no hardcoded UI strings found); input validation
  present (trip date regex `/^\d{4}-\d{2}-\d{2}$/`, numeric
  lat/lon for checkpoints, contextual SOS reasons per trip type
  + server validation `SOS_REASON_INVALID_FOR_TRIP_TYPE`/
  `INVALID_LOCATION`); error handling present (403 → rejection
  message, 409 `TRIP_HAS_UNACCOUNTED_MEMBERS` → explicit
  confirmation, clear checkpoint offline message, Local demo
  fallback).
- Verifikasi alur SOS → dashboard → WA (dari `main`, dibaca
  langsung): mobile POST `/trip-groups/:id/sos` (kontrak §4) →
  server validasi alasan + lokasi, simpan alert, broadcast
  `sos-trigger` ke room trip, dispatch bystander 2 km (sekali
  per ID SOS) via `sos-bystander-alert`, kirim template WA via
  Official WhatsApp Business Cloud API (graph.facebook.com
  v21.0, template `id_ID` tanpa parameter body) secara
  fire-and-forget + fail-soft (env tidak diset → lewati dengan
  log saja; timeout 5 detik; tidak pernah throw; tidak pernah
  menunda respons 201) ke bystander ter-dispatch yang punya
  nomor HP; dashboard membaca via GET `/:id/sos` (reader,
  M3 + M3F admin-read). Rantai ini terverifikasi di level
  kode + kontrak — pengiriman WA nyata TIDAK bisa dites dari
  VM ini (butuh kredensial Meta + template disetujui + nomor
  HP), jadi itu follow-up, bukan klaim lulus.
  SOS → dashboard → WA flow verification (read directly from
  `main`): mobile POST `/trip-groups/:id/sos` (contract §4) →
  server validates reason + location, stores the alert,
  broadcasts `sos-trigger` to the trip room, dispatches
  bystanders within 2 km (once per SOS id) via
  `sos-bystander-alert`, sends a WA template via the Official
  WhatsApp Business Cloud API (graph.facebook.com v21.0,
  `id_ID` template, no body parameters) fire-and-forget +
  fail-soft (env unset → skip with a log line; 5s timeout;
  never throws; never delays the 201 response) to dispatched
  bystanders with phones; the dashboard reads via GET `/:id/sos`
  (reader, M3 + M3F admin-read). This chain is verified at
  code + contract level — a real WA send CANNOT be tested
  from this VM (needs Meta credentials + an approved template
  + a phone), so it is a follow-up, not a passed claim.
- Koreksi kontrak (PR ini): `docs/api-contract.md` menyebut
  "Wablas" di 2 tempat (scope broadcast §PRD 3.4 + tabel
  endpoint `/notifications/whatsapp/send`) padahal kode
  (`whatsapp.ts`, header "OFFICIAL ONLY — no Wablas, no
  Fonnte") + keputusan Wella (27 Okt 2026) + kunci akhir tim
  semuanya menyatakan Official WhatsApp Business Cloud API
  saja — diperbaiki jadi Official di kedua tempat; kedua
  endpoint `/notifications/whatsapp/*` dianotasi sebagai
  rencana yang belum diimplementasikan (tidak ada
  `routes/notifications.ts` di `apps/api`; pengiriman WA SOS
  yang berjalan ada di `trips.ts` via sendSosWhatsapp).
  Contract correction (this PR): `docs/api-contract.md`
  mentioned "Wablas" in 2 places (broadcast scope §PRD 3.4 +
  the `/notifications/whatsapp/send` endpoint table) while
  the code (`whatsapp.ts`, header "OFFICIAL ONLY — no Wablas,
  no Fonnte") + Wella's decision (27 Oct 2026) + the team's
  final lock all state Official WhatsApp Business Cloud API
  only — fixed to Official in both places; both
  `/notifications/whatsapp/*` endpoints are annotated as
  planned, not yet implemented (no `routes/notifications.ts`
  in `apps/api`; the running SOS WA send lives in `trips.ts`
  via sendSosWhatsapp).
- Pertanyaan terbuka untuk QC (bukan diubah diam-diam):
  kontrak scope menyebut penerima WA = kontak darurat pengirim
  + HP leader, sementara `trips.ts` mengirim ke bystander
  ter-dispatch yang punya HP — mohon konfirmasi the project lead di QC
  penerima mana yang dimaksud. Dedup sisi server (kunci
  clientId) tetap follow-up the project lead, bukan H1. Pengujian
  perangkat (GPS nyata, antrean SOS + flush mode pesawat,
  render dashboard live dengan server jalan) tetap follow-up.
  QC akhir the final QC reviewer atas alur ini masih menunggu
  (langkahnya, bukan klaim PR ini).
  Open questions for QC (not silently changed): the contract
  scope names WA recipients = sender emergency contacts +
  leader phone, while `trips.ts` sends to dispatched
  bystanders with phones — please confirm in QC which
  recipients are intended. Server-side dedup (clientId key)
  stays the project lead's follow-up, not H1. Device testing (real GPS,
  SOS queue + airplane-mode flush, live dashboard rendering
  with a running server) stays a follow-up. the final QC reviewer's
  final QC of this flow is still pending (his step, not a
  claim of this PR).

## Verifikasi H1 / H1 verification

- `npx tsc --noEmit` → bersih / clean.
- `npx expo config --type public` → sdkVersion 58.0.0, React
  19.3.0 (pin SDK, tidak di-upgrade / SDK pin, not upgraded).
- `npx expo export --platform web` → lolos, rute statis incl.
  `/trips/[id]` + `/trips/checkpoints` + `/trips/sos` /
  passed, static routes incl. `/trips/[id]` +
  `/trips/checkpoints` + `/trips/sos`.
- Regresi logika murni (modul tanpa impor, compile + jalan di
  Node, 10/10 lolos): backoff antrean 5/15/30/60/120 mentok
  300 dtk; urutan SOS-sebelum-posisi + FIFO; pemadatan
  (posisi >30 menit → hanya terbaru per trip; semua segar →
  semua bertahan; tepat 30 menit TIDAK stale; SOS tidak pernah
  dipadatkan); parser item (valid diterima, rusak ditolak);
  haversine 0,001° ≈ 111,2 m; polyline (0 di checkpoint,
  null bila <2 titik, >100 m di luar rute); off-route muncul
  di update ke-2 (bukan ke-1) dan hilang saat kembali ke rute;
  diam 11 menit (signalLost false) dan hilang sinyal 11 menit
  (signalLost true).
  Pure-logic regression (import-free modules, compiled + run
  in Node, 10/10 passed): queue backoff 5/15/30/60/120 capped
  at 300s; SOS-before-positions order + FIFO; compaction
  (>30 min positions → only newest per trip; all fresh → all
  kept; exactly 30 min NOT stale; SOS never compacted); item
  parser (valid accepted, corrupt rejected); haversine
  0.001° ≈ 111.2 m; polyline (0 at checkpoint, null if <2
  points, >100 m off route); off-route appears on the 2nd
  update (not the 1st) and clears back on route; still 11 min
  (signalLost false) and signal-lost 11 min (signalLost
  true).
