// Impor katalog gunung MDPL versi SHIFTED saja (Wella, 1 Nov 2026).
// Runtime TIDAK PERNAH membaca converted/ (koordinat asli) atau raw
// JSON MDPL. Satu-satunya sumber koordinat adalah file ringkas yang
// di-commit di ./data/mdpl-shifted-catalog.json, yang dihasilkan oleh
// scripts/mdpl-generate-catalog.py dari converted-shifted + metadata
// destinations.json (nama/provinsi/elevasi saja, tanpa bbox region).
// Koordinat di file ringkas dibulatkan 5 desimal (~1 m) — jauh di bawah
// geseran 15-30 m, jadi yang masuk DB tetap versi shifted, bukan
// koordinat MDPL persis. imageUrl: null, KECUALI pemetaan Wiki yang
// yakin lewat nama persis (Slamet, Cikuray) — URL Firebase MDPL dari
// destinations.json TIDAK PERNAH diimpor (aturan katalog gambar).
// meetingPoint jalur MDPL = nama jalurnya sendiri (bukan basecamp
// karangan — MDPL tidak memberi titik kumpul eksplisit). gainM =
// maks-min elevasi track; estHours = jarak / 2 km-jam (asumsi turunan
// GoBareng, BUKAN data MDPL — didokumentasikan di sini, bukan
// disajikan seolah dari MDPL). Urutan checkpoint = elevasi menaik
// (perkiraan basecamp -> puncak; MDPL tidak memberi urutan eksplisit).
import { readFileSync } from "node:fs";

export interface MdplCheckpoint {
  name: string;
  lat: number;
  lon: number;
  elevationM: number | null;
  autoCheckpoint: boolean;
  isTarget: boolean;
  tags: string[];
}

export interface MdplRoute {
  id: string;
  name: string;
  meetingPoint: string;
  distanceKm: number | null;
  gainM: number | null;
  estHours: number | null;
  recommended: boolean;
  track: number[][][];
  checkpoints: MdplCheckpoint[];
}

export interface MdplMountain {
  id: string;
  name: string;
  elevationM: number;
  location: string;
  difficultyKey: string;
  province: string;
  imageUrl: string | null;
  volcanoActive: boolean;
  isActive: boolean;
  description: string | null;
  lat: number | null;
  lon: number | null;
  routes: MdplRoute[];
}

const PROVINCE_LABEL: Record<string, string> = {
  JawaTimur: "Jawa Timur",
  JawaTengah: "Jawa Tengah",
  JawaBarat: "Jawa Barat",
  SumateraUtara: "Sumatera Utara",
  SumateraBarat: "Sumatera Barat",
  SumateraSelatan: "Sumatera Selatan",
  SulawesiSelatan: "Sulawesi Selatan",
  SulawesiTengah: "Sulawesi Tengah",
  SulawesiUtara: "Sulawesi Utara",
  SulawesiBarat: "Sulawesi Barat",
  SulawesiTenggara: "Sulawesi Tenggara",
  KalimantanSelatan: "Kalimantan Selatan",
  KalimantanBarat: "Kalimantan Barat",
  KalimantanTengah: "Kalimantan Tengah",
  MalukuUtara: "Maluku Utara",
};

// Hanya nama persis yang dipetakan ke gambar Wiki lama yang sudah
// terverifikasi (aturan: Wiki atau buatan sendiri). Destinasi gabungan
// seperti "Gunung Arjuno - Welirang - Lincing" / "Gunung Wilis - Liman"
// TIDAK dipetakan — namanya tidak sama persis dengan gunungnya.
const WIKI_IMAGE_BY_NAME: Record<string, string> = {
  "Gunung Slamet":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Gunung_Slamet_dari_Kr_Salam.jpg/1200px-Gunung_Slamet_dari_Kr_Salam.jpg",
  "Gunung Cikuray":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Mount_Cikuray_from_Cisurupan.JPG/800px-Mount_Cikuray_from_Cisurupan.JPG",
};

export function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "gunung"
  );
}

export function provinceLabel(provinceId: string): string {
  return PROVINCE_LABEL[provinceId] ?? provinceId;
}

export function gainFromTrack(track: number[][][]): number | null {
  let min = Infinity;
  let max = -Infinity;
  for (const line of track) {
    for (const coord of line) {
      const elev = coord[2];
      if (typeof elev === "number" && Number.isFinite(elev)) {
        if (elev < min) min = elev;
        if (elev > max) max = elev;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const gain = Math.round(max - min);
  return gain > 0 ? gain : null;
}

export function estHoursFromDistance(distanceKm: number | null): number | null {
  if (distanceKm === null || distanceKm <= 0) return null;
  return Math.round((distanceKm / 2) * 10) / 10;
}

interface CompactRoute {
  id: string;
  name: string;
  dist: number;
  track: number[][][];
  cps: {
    name: string;
    lat: number;
    lon: number;
    elev: number | null;
    auto: boolean;
    target: boolean;
    tags: string[];
  }[];
}

interface CompactMountain {
  did: string;
  name: string;
  prov: string;
  elev: number;
  routes: CompactRoute[];
}

export function parseMdplCatalog(raw: unknown): {
  mountains: MdplMountain[];
  totalRoutes: number;
  totalCheckpoints: number;
} {
  if (!Array.isArray(raw)) throw new Error("MDPL_CATALOG_INVALID");
  const mountains: MdplMountain[] = [];
  let totalRoutes = 0;
  let totalCheckpoints = 0;
  for (const entry of raw as CompactMountain[]) {
    if (!entry || typeof entry.name !== "string" || !Array.isArray(entry.routes)) {
      throw new Error("MDPL_CATALOG_INVALID");
    }
    const routes: MdplRoute[] = entry.routes.map((r) => {
      const checkpoints: MdplCheckpoint[] = (r.cps ?? [])
        .map((c) => ({
          name: c.name,
          lat: c.lat,
          lon: c.lon,
          elevationM: c.elev ?? null,
          autoCheckpoint: c.auto,
          isTarget: c.target,
          tags: c.tags ?? [],
        }))
        .sort((a, b) => {
          const ea = a.elevationM ?? Infinity;
          const eb = b.elevationM ?? Infinity;
          return ea - eb;
        });
      totalCheckpoints += checkpoints.length;
      return {
        id: `mdpl-${r.id}`,
        name: r.name,
        meetingPoint: r.name,
        distanceKm: typeof r.dist === "number" ? r.dist : null,
        gainM: gainFromTrack(r.track ?? []),
        estHours: estHoursFromDistance(typeof r.dist === "number" ? r.dist : null),
        recommended: false,
        track: r.track ?? [],
        checkpoints,
      };
    });
    totalRoutes += routes.length;
    const firstCoord = routes[0]?.track?.[0]?.[0];
    mountains.push({
      id: slugifyName(entry.name),
      name: entry.name,
      elevationM: entry.elev,
      location: provinceLabel(entry.prov),
      difficultyKey: "",
      province: provinceLabel(entry.prov),
      imageUrl: WIKI_IMAGE_BY_NAME[entry.name] ?? null,
      volcanoActive: false,
      isActive: true,
      description: null,
      lat: firstCoord ? firstCoord[1] : null,
      lon: firstCoord ? firstCoord[0] : null,
      routes,
    });
  }
  return { mountains, totalRoutes, totalCheckpoints };
}

export function loadMdplCatalog(): {
  mountains: MdplMountain[];
  totalRoutes: number;
  totalCheckpoints: number;
} {
  const text = readFileSync(
    new URL("./data/mdpl-shifted-catalog.json", import.meta.url),
    "utf8",
  );
  return parseMdplCatalog(JSON.parse(text));
}
