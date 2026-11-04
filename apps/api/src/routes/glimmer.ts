// AI-G Glimmer — ingest antrean offline asisten (idempotent).
//
// Alur: klien mobile mengantre pertanyaan saat offline (status lokal
// queued/failed), lalu saat koneksi kembali mengirim tiap item ke sini
// dalam urutan SOS-dulu. Server menyimpan dulu, lalu memanggil AI
// (Meta Muse Spark Open, lihat ai.ts). Kunci idempotensi = pasangan
// (pengguna, clientMessageId):
// - POST ulang kunci yang sudah terjawab -> baris yang sama, AI tidak
//   dipanggil lagi.
// - POST ulang kunci yang belum terjawab (AI sempat gagal) -> AI
//   dipanggil lagi untuk kunci itu, tetap satu baris.
// - Gagal AI -> 502 AI_UPSTREAM_ERROR dan baris tetap tanpa jawaban,
//   jadi klien TIDAK menghapus item dari antrean tertunda (aturan M7:
//   hapus hanya setelah 2xx).
// - Respons selalu membawa `model` supaya klien merender atribusi
//   "Built with Muse Spark Open" (aturan produk Spark Open).
// - Tidak ada jawaban AI palsu di sini: tanpa konfigurasi AI atau
//   upstream gagal, endpoint gagal eksplisit (503/502), bukan
//   mengarang jawaban.
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { requireAiModule } from "../ai-modules.js";
import { askGlimmer } from "../ai.js";
import { badRequest } from "../errors.js";
import type { Db } from "../db.js";
import type { GlimmerPriority } from "../store.js";

const MAX_MESSAGE_CHARS = 2000;
const MAX_KEY_CHARS = 128;

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function glimmerRouter(db: Db): Router {
  const r = Router();
  r.use(requireAuth);

  r.post("/glimmer", async (req, res, next) => {
    try {
      requireAiModule(await db.platformSettings(), "aiG");
      const userId = req.user!.id;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const clientMessageId = str(body.clientMessageId);
      const message = str(body.message);
      const rawPriority = str(body.priority);
      if (
        !clientMessageId ||
        clientMessageId.length > MAX_KEY_CHARS ||
        !message ||
        message.trim().length === 0 ||
        message.length > MAX_MESSAGE_CHARS ||
        (rawPriority !== null && rawPriority !== "sos" && rawPriority !== "normal")
      ) {
        throw badRequest("INVALID_PAYLOAD");
      }
      const priority: GlimmerPriority = rawPriority === "sos" ? "sos" : "normal";
      const trimmed = message.trim();

      const existing = await db.glimmerByClientKey(userId, clientMessageId);
      if (existing?.answer) {
        res.json({ data: existing });
        return;
      }
      const row =
        existing ??
        (await db.createGlimmerMessage({
          userId,
          clientMessageId,
          message: trimmed,
          priority,
        }));
      // AI gagal -> ApiError 502/503 naik ke error handler; baris
      // tetap tersimpan tanpa jawaban untuk percobaan ulang.
      const { answer, model } = await askGlimmer(trimmed);
      const answered = await db.saveGlimmerAnswer(row.id, answer, model);
      res.json({ data: answered ?? row });
    } catch (e) {
      next(e);
    }
  });

  r.get("/glimmer", async (req, res, next) => {
    try {
      requireAiModule(await db.platformSettings(), "aiG");
      const items = await db.listGlimmerMessages(req.user!.id);
      res.json({ data: { items } });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
