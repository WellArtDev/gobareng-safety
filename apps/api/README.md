# apps/api — GoBareng Safety API

Backend GoBareng Safety — struktur F2 (the project lead, 27 Okt 2026).
Backend GoBareng Safety — F2 structure (the project lead, 27 Oct 2026).

**Stack:** Bun + Express + Socket.IO + Prisma (schema) + JWT.
Kontrak tunggal: `docs/api-contract.md` (trip, SOS, share-link untuk M1–M4).

## Struktur / Structure

```text
apps/api/
  package.json        # Express, Socket.IO, CORS, jsonwebtoken
  tsconfig.json       # TypeScript ketat / strict TypeScript
  prisma/schema.prisma# Model dasar: User, Trip, TripMember, Location,
                      # SosAlert, Checkpoint, CheckpointCheckIn, ShareLink
  src/
    index.ts          # HTTP server + Socket.IO attach
    app.ts            # Express app factory (routing + error envelope)
    config.ts         # Env var saja — tidak ada kredensial di git
    errors.ts         # Kode error (klien memetakan ke kunci i18n)
    auth.ts           # JWT verify (signature), hash Bun.password, guard trip
    store.ts          # Store in-memory (bentuk = schema Prisma)
    realtime.ts       # Socket.IO: auth handshake, room trip, broadcast
                      #   + targeted emit toUsers (dispatch bystander, M2)
    dispatch.ts       # M2: pilih bystander SOS (Haversine, radius 2 km)
    whatsapp.ts       # M2: kirim WA via OFFICIAL WhatsApp Business Cloud
                      #   API saja (fail-soft; tanpa env = skip, SOS tetap jalan)
    routes/
      auth.ts         # §1 auth
      trips.ts        # §2 trip, §3 lokasi, §4 SOS, §5 safety,
                      # §6 checkpoint, §16 share-link, §17 headcount/close
      admin.ts        # §14 admin (M3 dashboard input) + verifikasi
      notifications.ts# §9 notifikasi in-app (feed dashboard file-10)
      shared.ts       # §16 tampilan publik read-only
```

## Tes / Tests (TDD)

```sh
bun run test   # bun test src/__tests__ — butuh Postgres jalan + .env
```

`src/__tests__/api.test.ts` = suite integrasi terhadap app Express asli
+ Postgres asli (email unik per run, rerun aman): auth §1 (login salah,
suspended), trip §2 (pasangan koordinat, kuota >= 2), SOS §4 (alasan
kontekstual, auto-level, 1 SOS aktif, SENDER_ONLY), admin §14
(ADMIN_ONLY, verifikasi verify/reject, laporan DISMISSED), share-link
§16 (tampilan publik + revoke), close §17 (409 tanpa konfirmasi),
amplop §19. Test dikecualikan dari tsconfig (runner = bun test).
Integration suite against the real Express app + real Postgres
(unique emails per run, rerun-safe). Tests are excluded from tsconfig
(the runner is bun test).

## Menjalankan / Running

```sh
cd apps/api
bun install
cp .env.example .env   # JANGAN commit .env — .gitignore sudah melarangnya
bun run dev            # atau: bun run start
bun run typecheck      # tsc --noEmit
```

Env var (lihat `.env.example`): `PORT`, `DATABASE_URL`, `REDIS_URL`,
`JWT_SECRET` (wajib di production; di dev tanpa nilai, server memakai
nilai ephemeral per-restart dengan peringatan — bukan kredensial),
`CORS_ORIGIN`, `WHATSAPP_*` (M2, opsional), `META_MODEL_API_*` (fitur AI).

## SOS + dispatch bystander (M2, server-side)

Saat `POST /trip-groups/:id/sos` berhasil, selain broadcast `sos-trigger`
ke room trip, server menjalankan dispatch bystander:

- **Aturan:** anggota trip yang posisi terakhirnya ≤ 2 km dari lokasi SOS
  (Haversine, `config.bystanderRadiusKm`) menjadi bystander; pengirim SOS
  dikecualikan. Daftar diurutkan dari yang terdekat.
- **Event `sos-bystander-alert`** (targeted, hanya ke socket bystander):
  `{ sosId, tripId, userId, reason, lat, lon, level, status,
  bystanderUserIds, bystanders: [{ userId, distanceKm }] }`.
  Klien memfilter dari `bystanderUserIds` bila perlu; user tanpa socket
  live tidak menerima apa-apa (bukan error).
- **Siklus SOS (room trip):** `sos-trigger`, `sos-acknowledge`,
  `sos-in-progress`, `sos-resolve`, `sos-cancel`, `sos-false-alarm`,
  `sos-flash-signal` (sinyal saja, status tidak berubah). Payload status
  membawa `{ sosId, tripId, byUserId, status }` — perubahan status TIDAK
  pernah me-dispatch ulang set bystander yang sama sebagai alert baru
  (idempotensi per SOS id, tercatat di `store.sosDispatch`).
- **WhatsApp — OFFICIAL Cloud API saja:** bystander yang punya nomor
  telepon (`phone` di profil user, opsional saat register/`PATCH /me`)
  dikirimi template SOS lewat `POST https://graph.facebook.com/v21.0/
  {WHATSAPP_PHONE_NUMBER_ID}/messages` dengan `WHATSAPP_TOKEN`.
  Template (`WHATSAPP_TEMPLATE_SOS`, default `sos_alert`) harus sudah
  disetujui di aplikasi Meta dan dikirim TANPA parameter body.
  **Fail-soft:** bila `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` tidak
  di-set, pengiriman WA dilewati dengan log saja — SOS dan notifikasi
  in-app tetap jalan penuh, dan WA tidak pernah menunda respons SOS.
  TIDAK ada gateway tidak resmi (Wablas/Fonnte/dll) di kode ini —
  keputusan Wella 27 Okt 2026: GoBareng pakai official API saja.

## Yang sudah jalan di F2 / What F2 delivers

- Auth JWT beneran (signature diverifikasi, password di-hash bcrypt
  via `Bun.password`); akun baru tidak pernah admin.
- CRUD trip + join/leave/start, assign role leader/sweeper/medic/member,
  check-in meeting point + attendance summary.
- Ingest lokasi + posisi terakhir anggota (broadcast Socket.IO ke room trip).
- SOS dengan validasi alasan kontekstual per tipe trip (alasan touring
  ditolak di trip hiking dan sebaliknya, `400 SOS_REASON_INVALID_FOR_TRIP_TYPE`)
  + auto-level EMERGENCY/URGENT/HELP + broadcast Socket.IO.
- Checkpoint CRUD + check-in, headcount akhir + penutupan trip yang
  menolak tutup diam-diam bila ada anggota belum terhitung
  (`409 TRIP_HAS_UNACCOUNTED_MEMBERS` tanpa `confirmUnaccounted: true`).
- Share-link pantau read-only (`EMERGENCY_CONTACT | ANYONE`) +
  tampilan publik tanpa auth (`GET /shared-trips/:token`).
- Respons: sukses `{ data }`, gagal `{ error: { code } }` — server tidak
  mengirim teks UI; klien memetakan kode ke kunci i18n (aturan repo).

## Persistensi (A-1, 28 Okt 2026) / Persistence (A-1, 28 Oct 2026)

Store in-memory F2 DIGANTI Prisma Client (Postgres): `src/db.ts` adalah
lapisan data tunggal, bentuk respons API tidak berubah. Data bertahan
melewati restart (termasuk akun staff, verifikasi, notifikasi).
Jalankan Postgres dulu (`infra/docker-compose.yml` service `postgres`,
atau container dev dengan port 5432), isi `DATABASE_URL` di `.env`, lalu:

```sh
bunx prisma migrate dev   # dev: buat/terapkan migrasi
bunx prisma migrate deploy# produksi: terapkan migrasi yang ada
```

Prisma 7: URL koneksi untuk Migrate ada di `prisma.config.ts` (baca
`DATABASE_URL` dari env), runtime memakai adapter `@prisma/adapter-pg` di
`src/db.ts`. Satu-satunya state in-memory tersisa = penjaga idempotensi
dispatch bystander per SOS id (hidup hanya dalam request yang sama).
The F2 in-memory store is REPLACED by Prisma Client (Postgres):
`src/db.ts` is the single data layer, API response shapes unchanged.
Data survives restarts (including staff accounts, verifications,
notifications). Prisma 7: the Migrate URL lives in `prisma.config.ts`
(reads `DATABASE_URL` from env); runtime uses the `@prisma/adapter-pg`
adapter in `src/db.ts`. The only in-memory state left is the per-SOS
bystander dispatch idempotency guard (lives within the same request).

## Yang SENGAJA belum ada / Deliberately not here
- **Dispatch bystander + WA SOS (M2) SUDAH JALAN** — dispatch radius
  2 km + event `sos-bystander-alert` + WA template via OFFICIAL
  WhatsApp Business Cloud API (fail-soft bila env WA tidak di-set).
  Lihat "SOS + dispatch bystander (M2)" di atas.
- **Redis adapter Socket.IO belum dipasang** — F2 single-instance
  in-memory; adapter Redis wajib sebelum multi-instance (kontrak §11).
- **Akun admin belum ada seed-nya** — endpoint admin mengembalikan
  `403 ADMIN_ONLY` sampai akun admin di-seed di kartu nanti.
- **Beacon LoRa/Meshtastic DI-HOLD** (perintah Wella, 26 Okt 2026):
  tidak dibangun, tidak diumumkan, tidak ada model/route beacon di F2.
- **`.env` dan kunci API apa pun: JANGAN PERNAH di-commit.**
