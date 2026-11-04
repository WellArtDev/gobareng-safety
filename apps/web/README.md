# apps/web — Dashboard safety web (M3) / Web safety dashboard (M3)

Dashboard safety web **khusus admin**: daftar trip, peta trip + marker live
anggota, dan daftar SOS yang bisa difilter dan ditandai selesai.
Dashboard leader ada di aplikasi mobile, bukan di web.
Admin-only web safety dashboard: trip list, trip map + live member markers,
and an SOS list that can be filtered and marked done. The leader dashboard
lives in the mobile app, not on the web.

**Stack:** SvelteKit 3 + TypeScript + Leaflet (OSM) + Socket.IO client.
(Tailwind/shadcn dari rencana pra-kickoff belum dipakai di M3 — gaya
sementara inline di komponen; penambahan Tailwind adalah kartu nanti,
bukan blocker M3. / Tailwind/shadcn from the pre-kickoff plan are not used
in M3 yet — temporary inline component styles; adding Tailwind is a later
card, not an M3 blocker.)

## Yang dibangun di M3 / What M3 builds

- `/` — login admin (JWT dari API F2), gate admin-only (akun non-admin
  melihat panel ditolak; server tetap yang menegakkan `ADMIN_ONLY`).
  Admin login (F2 API JWT), admin-only gate (non-admin accounts see a
  denial panel; the server still enforces `ADMIN_ONLY`).
- Daftar trip dari `GET /admin/trips`; pilih trip → peta + SOS.
  Trip list from `GET /admin/trips`; select a trip → map + SOS.
- Peta: marker live anggota berwarna per peran (emas leader, oranye
  sweeper, putih medic, hijau anggota) + marker SOS merah berkedip;
  update live via Socket.IO (`location-update`, `sos-trigger`,
  `sos-resolve`, `sos-acknowledge`).
  Map: live member markers colored by role (gold leader, orange sweeper,
  white medic, green member) + pulsing red SOS markers; live updates via
  Socket.IO.
- Daftar SOS: filter status + level, tombol terima (`acknowledge`) dan
  tandai selesai (`resolve` — leader-only di API).
  SOS list: status + level filters, acknowledge and mark-done (`resolve` —
  leader-only on the API) buttons.
- i18n: SEMUA teks user-facing lewat kunci terjemahan (`src/lib/i18n/`,
  default Indonesia, ID/EN). Tambah bahasa = tambah satu file terjemahan.
  i18n: ALL user-facing strings go through translation keys (`src/lib/i18n/`,
  default Indonesian, ID/EN). Adding a language = adding one translation file.

## Menjalankan / Running

```sh
cd apps/web
npm install
cp .env.example .env   # JANGAN commit .env / NEVER commit .env
npm run dev            # http://localhost:5173
npm run check          # svelte-check (wajib lolos / must pass)
npm run build          # production build (adapter-auto; adapter produksi
                       # final menyusul kartu deploy / final production
                       # adapter follows in a deploy card)
```

API harus berjalan dulu (`apps/api`, default `http://localhost:3000`,
atur lewat `PUBLIC_API_URL` / `PUBLIC_SOCKET_URL` di `.env`).
The API must run first (`apps/api`, default `http://localhost:3000`,
configure via `PUBLIC_API_URL` / `PUBLIC_SOCKET_URL` in `.env`).

## Keterbatasan yang diketahui (sengaja, kartu nanti) / Known limits (intentional, later cards)

- **Gap API (tidak diubah di M3):** `tripGuard` API hanya mengizinkan
  anggota trip membaca SOS/posisi trip. Jadi admin yang BUKAN anggota
  trip itu mendapat `NOT_TRIP_MEMBER` untuk trip tersebut — dashboard
  menampilkan pesan error yang dipetakan ke i18n, bukan data kosong
  diam-diam. Untuk demo, pakai akun admin yang juga leader trip
  (pembuat trip otomatis leader + anggota). Perbaikan (bypass admin di
  `tripGuard` atau endpoint admin per-trip) adalah kartu API lanjutan,
  bukan perluasan diam-diam di M3.
  **API gap (not changed in M3):** the API `tripGuard` only allows trip
  members to read a trip's SOS/positions. So an admin who is NOT a member
  of that trip gets `NOT_TRIP_MEMBER` for it — the dashboard shows the
  mapped i18n error, not silent empty data. For demos, use an admin
  account that is also the trip leader (trip creators are leader +
  member automatically). The fix (admin bypass in `tripGuard` or a
  per-trip admin endpoint) is a follow-up API card, not a silent M3
  expansion.
- **Akun admin belum ada seed-nya (warisan F2):** registrasi membuat
  akun non-admin; akun admin di-seed di luar registrasi. Endpoint admin
  mengembalikan `403 ADMIN_ONLY` sampai akun di-seed.
  **No admin seed yet (F2 carry-over):** registration creates non-admin
  accounts; admin accounts are seeded outside registration. Admin
  endpoints return `403 ADMIN_ONLY` until one is seeded.
- Data API masih store in-memory (warisan F2): hilang saat restart;
  Prisma Client menyusul. / API data is still the F2 in-memory store:
  lost on restart; Prisma Client follows.
- Belum dibangun di M3 (kartu lain): halaman landing/open trip, wizard
  buat trip, dashboard leader mobile, checkpoint CRUD (M4), GPS adaptif
  (M5), deteksi diam/off-route (M6), store-and-forward (M7), dispatch
  bystander/WA M2, safety-score final.
  Not built in M3 (other cards): landing/open-trip pages, trip creation
  wizard, mobile leader dashboard, checkpoint CRUD (M4), adaptive GPS
  (M5), still/off-route detection (M6), store-and-forward (M7),
  bystander/WA dispatch (M2), final safety score.
- Beacon LoRa/Meshtastic **DI-HOLD** (perintah Wella, 26 Okt 2026):
  tidak dibangun, tidak diumumkan, tidak ada di dashboard ini.
  Beacon LoRa/Meshtastic is **ON HOLD** (Wella's order, 26 Oct 2026):
  not built, not announced, not in this dashboard.

## Rencana halaman pra-kickoff (belum dibangun, referensi saja) / Pre-kickoff page plan (not built, reference only)

- `/trips/[id]/map` — peta live tracking (Leaflet/OSM) — sebagian
  terwujud di M3 sebagai peta di `/` / partly realized in M3 as the map on `/`
- `/trips/[id]/dashboard` — dashboard leader — di mobile, bukan web /
  in the mobile app, not the web
- `/trips/new`, `/trips/new/touring` — wizard buat trip — kartu nanti /
  trip creation wizard — later card
