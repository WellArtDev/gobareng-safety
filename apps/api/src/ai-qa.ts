// AI-Q — Q&A member trip. Guardrail keras (bukan sekadar prompt):
// 1. Server membangun konteks HANYA dari data trip di DB (detail trip,
//    anggota + peran, checkpoint, dan — bila trip ber-rute — jalur +
//    pos selanjutnya yang dihitung server, atau — bila trip tanpa rute
//    — checkpoint terdekat yang dihitung server). Koordinat, email, dan nomor
//    HP tidak pernah masuk konteks AI. Koordinat HANYA dipakai server
//    untuk (a) menghitung jarak ke pos selanjutnya dan (b) menempel
//    link peta di jawaban lokasi (buildTripQaLinks, setelah jawaban AI
//    kembali) — model tidak pernah menerima koordinat, hanya nama pos
//    dan angka jarak/waktu yang sudah dihitung server.
// 2. selectSources memilih fakta yang relevan dengan pertanyaan lewat
//    kata kunci. TIDAK ADA fakta yang cocok -> server langsung
//    mengembalikan notFound TANPA memanggil AI sama sekali, jadi model
//    tidak punya kesempatan mengarang.
// 3. Fakta yang cocok pun hanya itu yang dikirim ke AI, dengan instruksi
//    menjawab hanya dari fakta tersebut; bila AI membalas sentinel
//    __QA_NOT_FOUND__, server mengubahnya jadi notFound (sentinel tidak
//    pernah sampai ke klien).
// 4. Atribusi dipertahankan: respons membawa `model` (nama model Meta)
//    saat jawaban berasal dari AI, persis pola ai-summary — klien
//    menampilkan "Built with Muse Spark Open" hanya bila model ada.
//    Saat notFound, model = null (tidak ada jawaban AI untuk diatribusi).
import type { Db } from "./db.js";
import type { Trip } from "./store.js";
import { metaChat } from "./meta-chat.js";

export const QA_NOT_FOUND_SENTINEL = "__QA_NOT_FOUND__";

const SYSTEM_PROMPT =
  "Kamu asisten tanya-jawab trip GoBareng. Jawab dalam Bahasa Indonesia, " +
  "maksimal 4 kalimat, HANYA dari data trip yang diberikan — jangan mengarang " +
  "fakta, jangan menebak jadwal/lokasi/kuota/aturan yang tidak ada di data, " +
  "jangan memberi saran medis. Jika jawaban tidak ada di data yang diberikan, " +
  `balas persis dengan ${QA_NOT_FOUND_SENTINEL} dan tidak ada teks lain.`;

export interface TripQaFact {
  key: string;
  text: string;
}

// Kata kunci (huruf kecil, substring) -> kunci fakta. Daftar ini yang
// menentukan apakah pertanyaan "ada di data trip" atau tidak; pertanyaan
// umum (tiket masuk, cuaca, perlengkapan, aturan di luar data trip)
// sengaja tidak punya kata kunci -> notFound, bukan karangan.
const KEYWORDS: { keys: string[]; words: string[] }[] = [
  { keys: ["trip.meetingPoint"], words: ["titik kumpul", "meeting point", "kumpul", "berangkat dari", "lokasi kumpul", "di mana kumpul", "dimana kumpul"] },
  { keys: ["trip.quota", "trip.members"], words: ["kuota", "peserta", "anggota", "berapa orang", "member", "jumlah peserta", "siapa saja"] },
  { keys: ["trip.date"], words: ["tanggal", "kapan", "jadwal", "hari apa"] },
  { keys: ["trip.name", "trip.destination"], words: ["nama trip", "gunung", "tujuan", "destinasi", "kemana", "ke mana", "mendaki"] },
  { keys: ["trip.checkpoints"], words: ["checkpoint", "check point", "posko", "perhentian", "pos "] },
  { keys: ["trip.leader"], words: ["leader", "ketua", "organizer", "pemimpin", "penyelenggara"] },
  { keys: ["trip.status"], words: ["status", "sudah mulai", "sudah berangkat", "masih buka", "selesai"] },
  { keys: ["trip.price"], words: ["harga", "biaya", "bayar", "tarif", "gratis"] },
  { keys: ["trip.durationDays"], words: ["durasi", "berapa hari", "lama trip"] },
  { keys: ["trip.isOpenTrip"], words: ["open trip", "terbuka", "publik"] },
  { keys: ["trip.note"], words: ["catatan", "keterangan"] },
  // Jalur + pos selanjutnya: kata kunci ini memilih fakta trip.route
  // dan trip.nextPost (bila ada). OUT_OF_SCOPE tetap menang di atas
  // grup ini (dicek dulu di selectSources).
  { keys: ["trip.route", "trip.nextPost"], words: ["jalur", "rute", "pos selanjutnya", "pos berikutnya", "pos terdekat", "berapa jauh", "jarak ke", "jarak pos", "how far", "next checkpoint", "nearest checkpoint", "next post", "nearest post", "distance to", "distance from", "how long to"] },
  // Jarak checkpoint trip TANPA rute (touring): kata kunci ini memilih
  // fakta trip.nearestCheckpoint (bila ada). Di trip ber-rute, fakta
  // itu tidak dibangun, jadi grup ini tidak mengubah perilaku rute —
  // grup rute di atas tetap yang memilih trip.route + trip.nextPost.
  // "how long to" ikut memetakan ke sini, tapi faktanya hanya membawa
  // jarak (tanpa estimasi waktu: pace jalan kaki tidak berlaku buat
  // touring), jadi model tidak bisa mengarang waktu tempuh.
  { keys: ["trip.nearestCheckpoint"], words: ["berapa jauh", "jarak ke", "jarak pos", "jarak checkpoint", "jarak check point", "how far", "nearest checkpoint", "next checkpoint", "distance to", "distance from", "how long to", "checkpoint terdekat", "pos terdekat"] },
];

// Topik yang JELAS di luar data trip — menang atas kata kunci apa pun,
// supaya "harga tiket masuk" tidak salah dipetakan ke harga trip dan
// "cuaca di gunung" tidak dipetakan ke nama trip.
const OUT_OF_SCOPE = ["tiket", "cuaca", "perlengkapan", "penginapan"];

export function selectSources(question: string, facts: TripQaFact[]): TripQaFact[] {
  const q = question.toLowerCase();
  if (OUT_OF_SCOPE.some((w) => q.includes(w))) return [];
  const wanted = new Set<string>();
  for (const group of KEYWORDS) {
    if (group.words.some((w) => q.includes(w))) {
      for (const k of group.keys) wanted.add(k);
    }
  }
  // Urutan = urutan fakta di konteks (stabil, mudah dibaca klien).
  return facts.filter((f) => wanted.has(f.key));
}

// Pos selanjutnya — dihitung SERVER, bukan model (Scope B, AI-Q):
// "pos selanjutnya" didefinisikan deterministik sebagai pos berkoordinat
// pertama SETELAH pos berkoordinat terdekat dari posisi leader terakhir,
// dalam urutan pos jalur. Pos tanpa koordinat tidak bisa diukur
// jaraknya, jadi dilewati (bukan ditebak): "next" selalu pos yang
// jaraknya benar-benar bisa dihitung. Seri (jarak sama persis) dimenangi
// pos yang lebih dulu dalam urutan jalur (perbandingan ketat <).
export const HIKING_PACE_KMH = 3;

export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function formatHikeDuration(minutes: number): string {
  if (minutes < 1) return "kurang dari 1 menit";
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} menit`;
}

export interface RoutePostCoord {
  name: string;
  order: number;
  lat: number | null;
  lon: number | null;
}

export type NextPostResult =
  | { kind: "next"; nextPost: string; distanceM: number; minutes: number }
  | { kind: "past-last"; lastPost: string }
  | { kind: "no-position" }
  | { kind: "no-coords" };

export function computeNextPost(
  leaderPos: { lat: number; lon: number } | null,
  posts: RoutePostCoord[],
): NextPostResult {
  if (!leaderPos) return { kind: "no-position" };
  // Hanya pos berkoordinat yang bisa diukur — diurutkan dulu menurut
  // urutan jalur, supaya "setelah" selalu berarti urutan jalur.
  const withCoords = posts
    .filter(
      (p): p is RoutePostCoord & { lat: number; lon: number } =>
        typeof p.lat === "number" &&
        Number.isFinite(p.lat) &&
        typeof p.lon === "number" &&
        Number.isFinite(p.lon),
    )
    .sort((a, b) => a.order - b.order);
  if (withCoords.length === 0) return { kind: "no-coords" };
  let nearestIdx = 0;
  let nearestDist = haversineMeters(leaderPos, withCoords[0]);
  for (let i = 1; i < withCoords.length; i++) {
    const d = haversineMeters(leaderPos, withCoords[i]);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  }
  if (nearestIdx === withCoords.length - 1) {
    return { kind: "past-last", lastPost: withCoords[nearestIdx].name };
  }
  const next = withCoords[nearestIdx + 1];
  const distanceM = Math.round(haversineMeters(leaderPos, next));
  // Asumsi pace dinyatakan di teks fakta, bukan disembunyikan di prompt.
  const minutes = Math.round(distanceM / 1000 / HIKING_PACE_KMH * 60);
  return { kind: "next", nextPost: next.name, distanceM, minutes };
}

// Checkpoint terdekat trip TANPA rute (touring) — dihitung SERVER,
// bukan model: checkpoint trip terdekat dari posisi leader terakhir
// (haversine). Beda dari computeNextPost: tidak ada urutan jalur yang
// harus dilanjutkan, jadi "terdekat" saja yang dilaporkan, dan TIDAK
// ada estimasi waktu (pace 3 km/jam adalah asumsi jalan kaki, tidak
// berlaku buat touring). Seri (jarak sama persis) dimenangi checkpoint
// yang lebih dulu dalam urutan pembuatan (perbandingan ketat <).
export type NearestCheckpointResult =
  | { kind: "nearest"; checkpoint: string; distanceM: number }
  | { kind: "no-position" }
  | { kind: "no-coords" };

export function computeNearestCheckpoint(
  leaderPos: { lat: number; lon: number } | null,
  checkpoints: { name: string; lat: number | null; lon: number | null }[],
): NearestCheckpointResult {
  if (!leaderPos) return { kind: "no-position" };
  const withCoords = checkpoints.filter(
    (p): p is { name: string; lat: number; lon: number } =>
      typeof p.lat === "number" &&
      Number.isFinite(p.lat) &&
      typeof p.lon === "number" &&
      Number.isFinite(p.lon),
  );
  if (withCoords.length === 0) return { kind: "no-coords" };
  let nearest = withCoords[0];
  let nearestDist = haversineMeters(leaderPos, nearest);
  for (let i = 1; i < withCoords.length; i++) {
    const d = haversineMeters(leaderPos, withCoords[i]);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = withCoords[i];
    }
  }
  return { kind: "nearest", checkpoint: nearest.name, distanceM: Math.round(nearestDist) };
}

// Bentuk rute dari db.mountainRoute: posts sudah dipetakan jadi nama
// (string[]), pos berkoordinat ada di checkpoints (name/order/lat/lon).
// Helper ini defensif: bila suatu implementasi Db mengembalikan posts
// sebagai objek, koordinat diambil dari sana.
function routePostData(route: unknown): {
  names: string[];
  coords: RoutePostCoord[];
} {
  const r = route as {
    posts?: unknown;
    checkpoints?: unknown;
  };
  const rawPosts = Array.isArray(r.posts) ? r.posts : [];
  const names = rawPosts
    .map((p) =>
      typeof p === "string"
        ? p
        : typeof (p as { name?: unknown }).name === "string"
          ? ((p as { name: string }).name as string)
          : "",
    )
    .filter((n) => n.length > 0);
  const rawCoords = Array.isArray(r.checkpoints) ? r.checkpoints : rawPosts;
  const coords = (rawCoords as Record<string, unknown>[])
    .map((p) => ({
      name: typeof p.name === "string" ? p.name : "",
      order: typeof p.order === "number" ? p.order : 0,
      lat: typeof p.lat === "number" ? p.lat : null,
      lon: typeof p.lon === "number" ? p.lon : null,
    }))
    .filter((p) => p.name.length > 0);
  return { names, coords };
}

export async function buildTripQaContext(db: Db, trip: Trip): Promise<TripQaFact[]> {
  const [members, checkpoints] = await Promise.all([
    db.tripMembersWithUser(trip.id),
    db.tripCheckpoints(trip.id),
  ]);
  const leaderName =
    members.find((m) => m.role === "LEADER")?.user.name ??
    members.find((m) => m.userId === trip.leaderId)?.user.name ??
    trip.leaderId;
  const facts: TripQaFact[] = [
    { key: "trip.name", text: `Nama trip: ${trip.name} (${trip.type})` },
    { key: "trip.date", text: `Tanggal trip: ${trip.date}` },
    { key: "trip.status", text: `Status trip: ${trip.status}` },
    { key: "trip.meetingPoint", text: `Titik kumpul: ${trip.meetingPoint}` },
    {
      key: "trip.quota",
      text:
        trip.quota !== null
          ? `Kuota peserta: ${members.length} dari ${trip.quota}`
          : `Kuota peserta: tidak dibatasi (${members.length} anggota saat ini)`,
    },
    {
      key: "trip.members",
      text:
        members.length > 0
          ? `Anggota (${members.length}): ${members.map((m) => `${m.user.name} (${m.role})`).join(", ")}`
          : "Anggota: belum ada",
    },
    { key: "trip.leader", text: `Leader trip: ${leaderName}` },
    {
      key: "trip.checkpoints",
      text:
        checkpoints.length > 0
          ? `Checkpoint: ${checkpoints.map((c) => c.name).join(", ")}`
          : "Checkpoint: belum ada",
    },
    {
      key: "trip.price",
      text: trip.price !== null ? `Harga per peserta: Rp${trip.price}` : "Harga: gratis",
    },
    { key: "trip.isOpenTrip", text: `Trip terbuka: ${trip.isOpenTrip ? "ya" : "tidak"}` },
  ];
  if (trip.durationDays !== null) {
    facts.push({ key: "trip.durationDays", text: `Durasi: ${trip.durationDays} hari` });
  }
  if (trip.note) {
    facts.push({ key: "trip.note", text: `Catatan trip: ${trip.note}` });
  }
  // destination tidak ada di tipe Trip Db (hanya ditulis saat create);
  // dibaca defensif dari runtime bila ada, tidak pernah ditebak.
  const destination = (trip as unknown as Record<string, unknown>).destination;
  if (typeof destination === "string" && destination.trim()) {
    facts.push({ key: "trip.destination", text: `Tujuan: ${destination.trim()}` });
  }
  // Jalur + pos selanjutnya (hanya trip ber-rute; trip tanpa rute
  // mendapat fakta checkpoint terdekat di cabang else di bawah).
  if (trip.mountainId && trip.routeId) {
    const [route, locations] = await Promise.all([
      db.mountainRoute(trip.mountainId, trip.routeId),
      db.latestLocations(trip.id),
    ]);
    if (route) {
      const { names, coords } = routePostData(route);
      const num = (v: unknown): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      const r = route as unknown as Record<string, unknown>;
      const stats: string[] = [];
      const distanceKm = num(r.distanceKm);
      const gainM = num(r.gainM);
      const estHours = num(r.estHours);
      if (distanceKm !== null) stats.push(`${distanceKm} km`);
      if (gainM !== null) stats.push(`kenaikan ${gainM} m`);
      if (estHours !== null) stats.push(`estimasi ${estHours} jam`);
      const routeName =
        typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Jalur trip";
      facts.push({
        key: "trip.route",
        text:
          `Jalur: ${routeName}` +
          (stats.length > 0 ? ` (${stats.join(", ")})` : "") +
          `. Pos berurutan: ${names.length > 0 ? names.join(", ") : "belum ada"}`,
      });
      // Pos selanjutnya dari posisi leader terakhir (bukan dari model).
      const leaderId =
        members.find((m) => m.role === "LEADER")?.userId ?? trip.leaderId;
      const leaderLoc = locations.find((l) => l.userId === leaderId);
      const leaderPos =
        leaderLoc &&
        Number.isFinite(leaderLoc.lat) &&
        Number.isFinite(leaderLoc.lon)
          ? { lat: leaderLoc.lat, lon: leaderLoc.lon }
          : null;
      const next = computeNextPost(leaderPos, coords);
      if (next.kind === "next") {
        facts.push({
          key: "trip.nextPost",
          text:
            `Pos selanjutnya: ${next.nextPost}, jarak sekitar ${next.distanceM} meter ` +
            `dari posisi leader terakhir, perkiraan ${formatHikeDuration(next.minutes)} ` +
            `dengan kecepatan jalan ${HIKING_PACE_KMH} km/jam`,
        });
      } else if (next.kind === "no-position") {
        facts.push({
          key: "trip.nextPost",
          text:
            "Pos selanjutnya: posisi leader belum tersedia, jadi jarak ke pos " +
            "selanjutnya belum bisa dihitung",
        });
      } else if (next.kind === "past-last") {
        facts.push({
          key: "trip.nextPost",
          text:
            `Pos selanjutnya: leader sudah melewati pos terakhir (${next.lastPost}), ` +
            "tidak ada pos selanjutnya",
        });
      }
      // no-coords: tidak ada fakta nextPost — hanya fakta rute (jujur,
      // tanpa jarak yang ditebak).
    }
  } else {
    // Trip tanpa rute (touring): jarak ke checkpoint trip terdekat,
    // dihitung server dari posisi leader terakhir — sama seperti
    // computeNextPost yang memakai leader, bukan penanya. Tanpa
    // estimasi waktu (pace jalan kaki tidak berlaku buat touring).
    // Trip tanpa checkpoint sama sekali tidak mendapat fakta ini:
    // pertanyaan jaraknya tetap dijawab jujur dari fakta
    // trip.checkpoints ("belum ada").
    if (checkpoints.length > 0) {
      const locations = await db.latestLocations(trip.id);
      const leaderId =
        members.find((m) => m.role === "LEADER")?.userId ?? trip.leaderId;
      const leaderLoc = locations.find((l) => l.userId === leaderId);
      const leaderPos =
        leaderLoc &&
        Number.isFinite(leaderLoc.lat) &&
        Number.isFinite(leaderLoc.lon)
          ? { lat: leaderLoc.lat, lon: leaderLoc.lon }
          : null;
      const nearest = computeNearestCheckpoint(leaderPos, checkpoints);
      if (nearest.kind === "nearest") {
        facts.push({
          key: "trip.nearestCheckpoint",
          text:
            `Checkpoint terdekat: ${nearest.checkpoint}, jarak sekitar ${nearest.distanceM} meter ` +
            "dari posisi leader terakhir",
        });
      } else if (nearest.kind === "no-position") {
        facts.push({
          key: "trip.nearestCheckpoint",
          text:
            "Checkpoint terdekat: posisi leader belum tersedia, jadi jarak ke checkpoint " +
            "terdekat belum bisa dihitung",
        });
      }
      // no-coords: tidak ada fakta — tanpa jarak yang ditebak.
    }
  }
  return facts;
}

export interface TripQaLink {
  label: string;
  url: string;
}

// Link peta untuk jawaban lokasi (QA 2 Nov 2026): dibuat server secara
// deterministik dari data trip + sumber yang terpilih — BUKAN dari teks
// AI, supaya model tidak bisa mengarang koordinat. notFound dan jawaban
// non-lokasi tidak membawa link.
export function buildTripQaLinks(
  trip: Trip,
  sources: TripQaFact[],
  checkpoints: { name: string; lat: number; lon: number }[],
): TripQaLink[] {
  const keys = new Set(sources.map((f) => f.key));
  const links: TripQaLink[] = [];
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const runtime = trip as unknown as Record<string, unknown>;
  const queryUrl = (lat: number, lon: number): string =>
    `https://maps.google.com/?q=${lat},${lon}`;
  if (keys.has("trip.meetingPoint")) {
    const lat = num(trip.meetingLat);
    const lon = num(trip.meetingLon);
    if (lat !== null && lon !== null) {
      links.push({ label: "Titik kumpul", url: queryUrl(lat, lon) });
    }
  }
  if (keys.has("trip.destination")) {
    const lat = num(runtime.destinationLat);
    const lon = num(runtime.destinationLon);
    const name =
      typeof runtime.destination === "string" && runtime.destination.trim()
        ? runtime.destination.trim()
        : "Tujuan trip";
    if (lat !== null && lon !== null) {
      links.push({ label: name, url: queryUrl(lat, lon) });
    }
  }
  if (keys.has("trip.checkpoints")) {
    for (const cp of checkpoints) {
      links.push({ label: cp.name, url: queryUrl(cp.lat, cp.lon) });
    }
  }
  return links;
}

export interface TripQaAnswer {
  answer: string | null;
  notFound: boolean;
  sources: string[];
  model: string | null;
  links: TripQaLink[];
}

export async function answerTripQuestion(
  db: Db,
  trip: Trip,
  question: string,
): Promise<TripQaAnswer> {
  const facts = await buildTripQaContext(db, trip);
  const sources = selectSources(question, facts);
  if (sources.length === 0) {
    // Guardrail 2: tanpa fakta yang cocok, jangan panggil AI.
    return { answer: null, notFound: true, sources: [], model: null, links: [] };
  }
  const userPrompt = [
    "Data trip:",
    ...sources.map((f) => `- ${f.text}`),
    "",
    `Pertanyaan: ${question}`,
  ].join("\n");
  const { content, model } = await metaChat(SYSTEM_PROMPT, userPrompt);
  if (content.trim() === QA_NOT_FOUND_SENTINEL) {
    return {
      answer: null,
      notFound: true,
      sources: sources.map((f) => f.key),
      model: null,
      links: [],
    };
  }
  // Link ditempel server dari DB (checkpoint diambil lagi di sini agar
  // buildTripQaContext tidak berubah bentuk); model tidak dilibatkan.
  const checkpoints = await db.tripCheckpoints(trip.id);
  return {
    answer: content,
    notFound: false,
    sources: sources.map((f) => f.key),
    model,
    links: buildTripQaLinks(trip, sources, checkpoints),
  };
}
