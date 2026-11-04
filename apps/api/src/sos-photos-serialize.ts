// AI-P — serialisasi foto SOS + helper "perkaya detail SOS".
// Bentuk foto yang dikirim ke klien: URL publik (pola /uploads yang
// ada, nama file uuid sehingga tidak bisa ditebak/enumerasi),
// deskripsi AI (null bila belum tersedia), model (null bila belum
// tersedia — klien menampilkan atribusi "Built with Muse Spark Open"
// HANYA bila model terisi, pola yang sama dengan ai.ts), dan aiStatus
// (PENDING/AVAILABLE/UNAVAILABLE) yang menjadi sumber kebenaran
// tampilan "belum tersedia".
import type { Db } from "./db.js";

export interface SosPhotoView {
  id: string;
  kind: "TRIP" | "GENERAL";
  sosId: string;
  senderId: string;
  photoUrl: string;
  aiDescription: string | null;
  // Nama model persis pola ai.ts ("model"): klien menampilkan atribusi
  // "Built with Muse Spark Open" bila field ini terisi.
  model: string | null;
  aiStatus: "PENDING" | "AVAILABLE" | "UNAVAILABLE";
  createdAt: string;
}

type SosPhotoRow = {
  id: string;
  kind: "TRIP" | "GENERAL";
  sosId: string;
  senderId: string;
  photoUrl: string;
  aiDescription: string | null;
  aiModel: string | null;
  aiStatus: "PENDING" | "AVAILABLE" | "UNAVAILABLE";
  createdAt: Date;
};

export function serializeSosPhoto(row: SosPhotoRow): SosPhotoView {
  return {
    id: row.id,
    kind: row.kind,
    sosId: row.sosId,
    senderId: row.senderId,
    photoUrl: row.photoUrl,
    aiDescription: row.aiDescription,
    model: row.aiModel,
    aiStatus: row.aiStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function photosForSos(
  db: Db,
  kind: "TRIP" | "GENERAL",
  sosId: string,
): Promise<SosPhotoView[]> {
  const rows = await db.prisma.sosPhoto.findMany({
    where: { kind, sosId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) =>
    serializeSosPhoto({
      ...r,
      aiDescription: r.aiDescription,
      aiModel: r.aiModel,
    }),
  );
}

// Tambahan aditif untuk detail SOS yang sudah ada (trips.ts,
// general-sos.ts, command-center.ts): ...sos + photos. Tidak mengubah
// field SOS yang sudah ada.
export async function withSosPhotos<T extends object>(
  db: Db,
  kind: "TRIP" | "GENERAL",
  sos: T & { id: string },
): Promise<T & { photos: SosPhotoView[] }> {
  return { ...sos, photos: await photosForSos(db, kind, sos.id) };
}
