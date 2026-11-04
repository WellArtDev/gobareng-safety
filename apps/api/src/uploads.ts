// Upload gambar katalog gunung — disimpan di disk API dan disajikan
// publik di /uploads/mountains/* (gambar katalog memang publik, sama
// seperti background login yang dipakai seed). Admin-only di route;
// file di luar /uploads/mountains tidak pernah dihapus dari sini.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import multer from "multer";
import type { Request } from "express";
import { badRequest } from "./errors.js";

export const uploadsDir = process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");
export const mountainsUploadsDir = join(uploadsDir, "mountains");
// Foto profil user (Wella 1 Nov 2026) — publik seperti katalog, bukan
// privat seperti KTP: disajikan di /uploads/avatars/* oleh app.ts.
export const avatarsUploadsDir = join(uploadsDir, "avatars");
// Gambar QRIS Pro (Wella 1 Nov 2026) — publik, tampil di layar
// upgrade mobile; hanya admin yang boleh mengunggah/menghapus.
export const qrisUploadsDir = join(uploadsDir, "qris");
// Foto SOS (AI-P, 2 Nov 2026) — publik lewat /uploads/sos/* seperti
// katalog/avatar (pola upload yang ada); nama file uuid sehingga URL
// tidak bisa ditebak atau dienumerasi dari id SOS.
export const sosUploadsDir = join(uploadsDir, "sos");

// Dokumen identitas (KTP) pendaftar organizer — PRIVAT, sengaja BUKAN
// di bawah uploadsDir: /uploads disajikan statis publik oleh app.ts,
// jadi file di sini tidak pernah bisa diakses lewat URL tanpa token.
// Admin membukanya lewat GET /admin/verifications/:id/document.
export const identityDocumentsDir =
  process.env.IDENTITY_DOCUMENTS_DIR ?? join(process.cwd(), "identity-documents");

mkdirSync(mountainsUploadsDir, { recursive: true });
mkdirSync(avatarsUploadsDir, { recursive: true });
mkdirSync(qrisUploadsDir, { recursive: true });
mkdirSync(sosUploadsDir, { recursive: true });
mkdirSync(identityDocumentsDir, { recursive: true });

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_MOUNTAIN_IMAGE_BYTES = 5 * 1024 * 1024;

// Magic bytes gambar (bukan sekadar mimetype yang bisa dipalsukan
// klien): JPEG FF D8 FF, PNG 89 50 4E 47, GIF 47 49 46 38, WebP RIFF
// .... WEBP. Dibaca dari buffer memoryStorage sebelum tulis disk.
function sniffImageKind(bytes: Uint8Array): "jpg" | "png" | "webp" | "gif" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function sniffImageKindForTest(bytes: Uint8Array): string | null {
  return sniffImageKind(bytes);
}

const MEMORY = multer.memoryStorage();

// Tulis buffer yang sudah lolos guard ke disk; kembalikan nama file.
function saveBuffer(dir: string, filename: string, buffer: Uint8Array): void {
  writeFileSync(join(dir, filename), buffer);
}

export interface SavedUpload {
  filename: string;
  size: number;
}

function imageFilename(base: string, kind: string, mimetype: string): string {
  const ext = EXT_BY_MIME[mimetype] ?? kind;
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, "") || "file";
  return `${safe}-${Date.now()}.${ext}`;
}

function assertImageBuffer(file: Express.Multer.File): void {
  // Dipanggil di route SETELAH multer selesai (buffer penuh), bukan di
  // fileFilter — memoryStorage mengisi file.buffer setelah filter jalan,
  // jadi sniff di filter selalu melihat buffer kosong dan menolak semua.
  if (!(file.mimetype in EXT_BY_MIME) || !sniffImageKind(file.buffer)) {
    throw badRequest("INVALID_IMAGE");
  }
}

/** Simpan file upload memoryStorage ke disk setelah lolos guard magic bytes. */
export function saveAvatarFile(userId: string, file: Express.Multer.File): SavedUpload {
  assertImageBuffer(file);
  const filename = imageFilename(userId || "user", "png", file.mimetype);
  saveBuffer(avatarsUploadsDir, filename, file.buffer);
  return { filename, size: file.buffer.length };
}

/** Simpan file upload memoryStorage ke disk setelah lolos guard magic bytes. */
export function saveMountainImageFile(tripId: string, file: Express.Multer.File): SavedUpload {
  assertImageBuffer(file);
  const filename = imageFilename(tripId || "mountain", "png", file.mimetype);
  saveBuffer(mountainsUploadsDir, filename, file.buffer);
  return { filename, size: file.buffer.length };
}

/** Simpan file upload memoryStorage ke disk setelah lolos guard magic bytes. */
export function saveIdentityDocumentFile(userId: string, file: Express.Multer.File): SavedUpload {
  assertImageBuffer(file);
  const filename = imageFilename(userId || "applicant", "png", file.mimetype);
  saveBuffer(identityDocumentsDir, filename, file.buffer);
  return { filename, size: file.buffer.length };
}

/** Simpan file upload memoryStorage ke disk setelah lolos guard magic bytes. */
export function saveQrisImageFile(file: Express.Multer.File): SavedUpload {
  assertImageBuffer(file);
  const filename = `qris-${Date.now()}.${EXT_BY_MIME[file.mimetype] ?? "png"}`;
  saveBuffer(qrisUploadsDir, filename, file.buffer);
  return { filename, size: file.buffer.length };
}

/** Simpan file upload memoryStorage ke disk setelah lolos guard magic bytes. */
export function saveSosPhotoFile(file: Express.Multer.File): SavedUpload {
  assertImageBuffer(file);
  const ext = EXT_BY_MIME[file.mimetype] ?? "png";
  const filename = `sos-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  saveBuffer(sosUploadsDir, filename, file.buffer);
  return { filename, size: file.buffer.length };
}

// fileFilter memoryStorage: hanya saring mimetype kasar di sini.
// Validasi magic bytes ada di assertImageBuffer (route, buffer penuh).
function guardImageFile(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  if (!(file.mimetype in EXT_BY_MIME)) {
    cb(new Error("INVALID_IMAGE"));
    return;
  }
  cb(null, true);
}

export const mountainImageUpload = multer({
  storage: MEMORY,
  fileFilter: guardImageFile,
  limits: { fileSize: MAX_MOUNTAIN_IMAGE_BYTES, files: 1 },
});

// URL absolut gambar hasil upload. Di balik nginx, proto asli dibaca
// dari X-Forwarded-Proto supaya tidak jadi http:// di halaman https
// (mixed content); tanpa proxy, pakai protocol request apa adanya.
export function mountainImageUrl(req: Request, filename: string): string {
  const proto =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${req.get("host")}/uploads/mountains/${filename}`;
}

export const MAX_IDENTITY_DOCUMENT_BYTES = 5 * 1024 * 1024;

// Upload KTP: field "identityDocument", nama file = userId + timestamp
// (tidak memakai nama asli file pendaftar, supaya tidak bisa ditebak
// atau ditimpa dari luar). Tipe selain gambar ditolak sebagai error
// (bukan diam-diam dibuang) supaya pendaftar tahu KTP-nya gagal naik.
export const identityDocumentUpload = multer({
  storage: MEMORY,
  fileFilter: guardImageFile,
  limits: { fileSize: MAX_IDENTITY_DOCUMENT_BYTES, files: 1 },
});

// Hapus file KTP lama milik pendaftar ini saja (nama file privat).
export function deleteOldIdentityDocument(filename: string | null): void {
  if (!filename) return;
  try {
    const file = join(identityDocumentsDir, basename(filename));
    if (existsSync(file)) rmSync(file);
  } catch (error) {
    // Gagal hapus bukan alasan menggagalkan pengajuan baru — catat saja.
    console.warn("[api] deleteOldIdentityDocument failed", error);
  }
}

// Hapus file upload lama milik gunung ini saja (URL /uploads/mountains/*).
// URL eksternal (mis. background login) tidak pernah disentuh.
export function deleteOldMountainImage(imageUrl: string | null): void {
  if (!imageUrl) return;
  try {
    const path = new URL(imageUrl).pathname;
    if (!path.startsWith("/uploads/mountains/")) return;
    const file = join(mountainsUploadsDir, basename(path));
    if (existsSync(file)) rmSync(file);
  } catch (error) {
    // URL lama tidak valid — catat, bukan alasan menggagalkan upload.
    console.warn("[api] deleteOldMountainImage failed", error);
  }
}

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// Upload foto profil: field "avatar", nama file = userId + timestamp
// (tidak memakai nama asli file, supaya tidak bisa ditebak/ditimpa).
// Tipe selain gambar ditolak sebagai error (pola KTP) supaya user tahu.
export const avatarUpload = multer({
  storage: MEMORY,
  fileFilter: guardImageFile,
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
});

export function avatarImageUrl(req: Request, filename: string): string {
  const proto =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${req.get("host")}/uploads/avatars/${filename}`;
}

// Hapus foto lama user ini saja (URL /uploads/avatars/*); URL lain
// tidak pernah disentuh.
export function deleteOldAvatar(avatarUrl: string | null): void {
  if (!avatarUrl) return;
  try {
    const path = new URL(avatarUrl).pathname;
    if (!path.startsWith("/uploads/avatars/")) return;
    const file = join(avatarsUploadsDir, basename(path));
    if (existsSync(file)) rmSync(file);
  } catch (error) {
    // URL lama tidak valid — catat, bukan alasan menggagalkan upload.
    console.warn("[api] deleteOldAvatar failed", error);
  }
}

export const MAX_QRIS_IMAGE_BYTES = 5 * 1024 * 1024;

// Upload QRIS Pro (admin-only di route): field "qrisImage", satu gambar
// aktif saja — upload baru menimpa yang lama (file lama dihapus route).
export const qrisImageUpload = multer({
  storage: MEMORY,
  fileFilter: guardImageFile,
  limits: { fileSize: MAX_QRIS_IMAGE_BYTES, files: 1 },
});

export function qrisImageUrl(req: Request, filename: string): string {
  const proto =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${req.get("host")}/uploads/qris/${filename}`;
}

// Hapus gambar QRIS aktif saja (URL /uploads/qris/*).
export function deleteOldQrisImage(qrisUrl: string | null): void {
  if (!qrisUrl) return;
  try {
    const path = new URL(qrisUrl).pathname;
    if (!path.startsWith("/uploads/qris/")) return;
    const file = join(qrisUploadsDir, basename(path));
    if (existsSync(file)) rmSync(file);
  } catch (error) {
    // URL lama tidak valid — catat, bukan alasan menggagalkan hapus.
    console.warn("[api] deleteOldQrisImage failed", error);
  }
}

export const MAX_SOS_PHOTO_BYTES = 5 * 1024 * 1024;

// Foto SOS (AI-P): field "photo", satu foto per request (pengirim bisa
// mengunggah beberapa foto lewat beberapa request). Nama file = uuid
// + timestamp (tidak memakai id SOS atau nama asli file, supaya URL
// tidak bisa ditebak dari id SOS). Tipe selain gambar ditolak sebagai
// error (pola KTP/avatar) supaya pengirim tahu fotonya gagal naik.
export const sosPhotoUpload = multer({
  storage: MEMORY,
  fileFilter: guardImageFile,
  limits: { fileSize: MAX_SOS_PHOTO_BYTES, files: 1 },
});

export function sosPhotoUrl(req: Request, filename: string): string {
  const proto =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${req.get("host")}/uploads/sos/${filename}`;
}
