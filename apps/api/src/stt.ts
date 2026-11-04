// STT provider (AI-V, SOS suara) — antarmuka + provider HTTP.
//
// DUA jalur, dibaca LAZY dari env di tiap panggilan (bukan snapshot
// import — supaya tes "belum dikonfigurasi" dan urutan import apa pun
// tetap benar, pola yang sama dengan getter admin di config.ts):
//
// 1. OpenAI-compatible (jalur lama, diutamakan bila lengkap):
//      STT_PROVIDER  nilai apa pun yang non-kosong mengaktifkan jalur ini
//      STT_API_KEY, STT_API_BASE, STT_MODEL (default "whisper-1")
//    POST {apiBase}/audio/transcriptions, multipart model+file+
//    response_format=json, respons { text }.
//
// 2. Meta Muse Voice Transcribe (jalur baru; dipakai bila STT_* TIDAK
//    lengkap tapi kunci Meta tersedia — kunci yang SAMA dengan yang
//    sudah dipakai klasifikasi teks Muse Spark, tanpa env key baru):
//      META_MODEL_API_KEY, META_MODEL_API_BASE
//    POST {metaBase}/asr/transcribe, Bearer key, multipart:
//      part JSON `request` = { model: "muse-voice-transcribe-1.0",
//        audioEncoding: "WAV", mode: "PUSH_TO_TALK",
//        languageBias: ["Indonesian"] }
//      part audio `audio` = file WAV
//    Respons JSON: { transcript, ... } — `transcript` adalah teks lengkap.
//
// Kontrak Meta di atas berasal dari cookbook resmi Meta
// (meta-models/meta-model-cookbook, 06_muse_voice) dan penilaian
// pihak kedua atas docs Meta; halaman resmi dev.meta.ai TIDAK bisa
// di-fetch dari VM ini (blocked), jadi TIGA hal ini ASUMSI yang belum
// terverifikasi live dan dicatat di PR: (a) nama part JSON persis
// `request` + part audio `audio`, (b) nilai languageBias berupa nama
// bahasa "Indonesian" (bukan kode "id"), (c) audioEncoding file = "WAV"
// (bukan PCM_24KHZ — itu nama encoding handshake realtime). Endpoint,
// model, dan nama field ini terpusat di konstanta di bawah supaya
// mudah diubah di satu tempat bila verifikasi live membuktikan lain.
//
// Batasan bentuk audio (dari docs yang sama): endpoint file Meta
// HANYA menerima WAV PCM16 mono 16/24 kHz, maks 32 MB / 10 menit.
// Audio m4a dari HP (preset HIGH_QUALITY expo-audio) DITRANSCODE
// DI SERVER menjadi WAV PCM16 mono 16 kHz memakai ffmpeg sistem
// sebelum dikirim ke Meta — mobile TIDAK berubah, tetap merekam m4a.
// Syarat deploy: binary `ffmpeg` harus ada di PATH server API; bila
// tidak ada (atau transcode gagal / hasilnya bukan WAV yang valid),
// jalur Meta gagal jujur dengan 502 STT_UPSTREAM_ERROR tanpa upstream
// call dan TANPA PERNAH diganti transkrip palsu. Format non-WAV selain
// m4a tetap ditolak 502 seperti sebelumnya. Bila STT_* dikonfigurasi,
// jalur 1 tetap dipakai apa adanya (menerima format apa pun) dan
// transcode tidak berjalan.
//
// Belum dikonfigurasi (kedua jalur kosong) = 503 STT_NOT_CONFIGURED
// (fail-soft, jelas). TIDAK ADA transkripsi palsu: tanpa provider,
// endpoint menolak — klien menampilkan state "STT belum
// dikonfigurasi", bukan teks karangan. Gagal upstream / transkrip
// kosong = 502 STT_UPSTREAM_ERROR.
import { spawn } from "node:child_process";
import { ApiError } from "./errors.js";

const REQUEST_TIMEOUT_MS = 60_000;
const TRANSCODE_TIMEOUT_MS = 30_000;
export const MAX_AUDIO_BASE64_CHARS = 15_000_000;
// Target transcode: satu-satunya bentuk yang pasti diterima Meta dan
// paling ringan (16 kHz sudah cukup untuk suara SOS).
export const META_TRANSCODE_SAMPLE_RATE = 16000;
const M4A_MIME_TYPES = new Set(["audio/m4a", "audio/x-m4a"]);

// Satu tempat untuk kontrak Meta ASR: ganti di sini bila verifikasi
// live membuktikan endpoint/model/field-nya berbeda.
export const META_STT_MODEL = "muse-voice-transcribe-1.0";
const META_ASR_PATH = "/asr/transcribe";
const META_STT_LANGUAGE_BIAS = "Indonesian";

export interface SttEnv {
  provider: string;
  apiKey: string;
  apiBase: string;
  model: string;
}

export function sttEnv(): SttEnv {
  return {
    provider: process.env.STT_PROVIDER ?? "",
    apiKey: process.env.STT_API_KEY ?? "",
    apiBase: process.env.STT_API_BASE ?? "",
    model: process.env.STT_MODEL ?? "whisper-1",
  };
}

export function sttConfigured(): boolean {
  const env = sttEnv();
  return Boolean(env.provider && env.apiKey && env.apiBase);
}

export interface MetaSttEnv {
  apiKey: string;
  apiBase: string;
}

export function metaSttEnv(): MetaSttEnv {
  return {
    apiKey: process.env.META_MODEL_API_KEY ?? "",
    apiBase: process.env.META_MODEL_API_BASE ?? "",
  };
}

export function metaSttConfigured(): boolean {
  const env = metaSttEnv();
  return Boolean(env.apiKey && env.apiBase);
}

const EXT_BY_MIME: Record<string, string> = {
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

function postWithTimeout(
  url: string,
  headers: Record<string, string>,
  body: FormData,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { method: "POST", signal: controller.signal, headers, body })
    .finally(() => clearTimeout(timer));
}

async function transcribeOpenAiCompatible(
  audio: Buffer<ArrayBuffer>,
  mimeType: string,
  env: SttEnv,
): Promise<{ transcript: string; model: string }> {
  const ext = EXT_BY_MIME[mimeType] ?? "m4a";
  const form = new FormData();
  form.append("model", env.model);
  form.append("file", new Blob([audio], { type: mimeType || "audio/m4a" }), `voice.${ext}`);
  form.append("response_format", "json");
  try {
    const res = await postWithTimeout(
      `${env.apiBase.replace(/\/$/, "")}/audio/transcriptions`,
      { Authorization: `Bearer ${env.apiKey}` },
      form,
    );
    if (!res.ok) throw new ApiError(502, "STT_UPSTREAM_ERROR");
    const body = (await res.json()) as { text?: unknown };
    const transcript = typeof body.text === "string" ? body.text.trim() : "";
    if (!transcript) throw new ApiError(502, "STT_UPSTREAM_ERROR");
    return { transcript, model: env.model };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, "STT_UPSTREAM_ERROR");
  }
}

// WAV yang diterima endpoint file Meta: RIFF/WAVE, fmt PCM (format 1),
// mono, 16-bit, 16 atau 24 kHz. Parser ini hanya membaca header fmt
// (jalan melewati chunk lain, menghormati padding genap); isi PCM
// tidak divalidasi byte-per-byte — Meta yang menolak bila rusak.
export function isMetaCompatibleWav(audio: Buffer): boolean {
  if (audio.length < 44) return false;
  if (audio.toString("ascii", 0, 4) !== "RIFF") return false;
  if (audio.toString("ascii", 8, 12) !== "WAVE") return false;
  let off = 12;
  while (off + 8 <= audio.length) {
    const id = audio.toString("ascii", off, off + 4);
    const size = audio.readUInt32LE(off + 4);
    if (id === "fmt ") {
      if (size < 16 || off + 8 + 16 > audio.length) return false;
      const format = audio.readUInt16LE(off + 8);
      const channels = audio.readUInt16LE(off + 10);
      const sampleRate = audio.readUInt32LE(off + 12);
      const bitsPerSample = audio.readUInt16LE(off + 22);
      return (
        format === 1 &&
        channels === 1 &&
        (sampleRate === 16000 || sampleRate === 24000) &&
        bitsPerSample === 16
      );
    }
    off += 8 + size + (size % 2);
  }
  return false;
}

// Transcode m4a -> WAV PCM16 mono 16 kHz lewat ffmpeg sistem.
// ffmpeg DIPAKAI APA ADANYA dari PATH (tanpa dependensi npm baru, tanpa
// binary bundling): stdin = audio sumber, stdout = WAV. Gagal apa pun
// (binary tidak ada, input rusak, timeout, output kosong) = reject,
// dan pemanggil mengubahnya menjadi 502 yang jujur.
export type TranscodeFn = (audio: Buffer) => Promise<Buffer>;

function runSystemFfmpeg(audio: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ac",
      "1",
      "-ar",
      String(META_TRANSCODE_SAMPLE_RATE),
      "-sample_fmt",
      "s16",
      "-f",
      "wav",
      "pipe:1",
    ]);
    const out: Buffer[] = [];
    let errText = "";
    let settled = false;
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("ffmpeg transcode timeout"));
      }
    }, TRANSCODE_TIMEOUT_MS);
    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => {
      // Stderr hanya untuk diagnosis; dipotong supaya tidak membengkak.
      if (errText.length < 4096) errText += c.toString();
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(e);
      }
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const wav = Buffer.concat(out);
      if (code !== 0 || wav.length === 0) {
        reject(new Error(`ffmpeg transcode gagal (exit ${code}): ${errText}`.trim()));
        return;
      }
      resolve(wav);
    });
    proc.stdin.on("error", () => {
      // Terjadi bila ffmpeg sudah mati lebih dulu; close/error yang
      // menangani penolakan — jangan biarkan unhandled error crash.
    });
    proc.stdin.end(audio);
  });
}

export async function transcodeToMetaWav(
  audio: Buffer,
  run: (input: Buffer) => Promise<Buffer> = runSystemFfmpeg,
): Promise<Buffer> {
  const wav = await run(audio);
  if (!isMetaCompatibleWav(wav)) {
    throw new Error("hasil transcode bukan WAV PCM16 mono 16/24 kHz");
  }
  return wav;
}

async function transcribeMeta(
  audio: Buffer<ArrayBuffer>,
  env: MetaSttEnv,
  mimeType: string,
  transcode: TranscodeFn = transcodeToMetaWav,
): Promise<{ transcript: string; model: string }> {
  // WAV yang sudah sesuai kontrak dikirim apa adanya. m4a dari HP
  // ditranscode dulu di server; bentuk lain di luar kontrak ditolak
  // di sini, tanpa upstream call — dan gagal transcode pun sama:
  // 502 jujur, bukan transkrip palsu.
  let wav: Buffer = audio;
  if (!isMetaCompatibleWav(audio)) {
    if (!M4A_MIME_TYPES.has(mimeType)) {
      throw new ApiError(502, "STT_UPSTREAM_ERROR");
    }
    try {
      wav = await transcode(audio);
    } catch {
      throw new ApiError(502, "STT_UPSTREAM_ERROR");
    }
    if (!isMetaCompatibleWav(wav)) {
      throw new ApiError(502, "STT_UPSTREAM_ERROR");
    }
  }
  const request = {
    model: META_STT_MODEL,
    audioEncoding: "WAV",
    mode: "PUSH_TO_TALK",
    languageBias: [META_STT_LANGUAGE_BIAS],
  };
  const form = new FormData();
  form.append(
    "request",
    new Blob([JSON.stringify(request)], { type: "application/json" }),
  );
  form.append(
    "audio",
    new Blob([Buffer.from(wav)], { type: "audio/wav" }),
    "voice.wav",
  );
  try {
    const res = await postWithTimeout(
      `${env.apiBase.replace(/\/$/, "")}${META_ASR_PATH}`,
      { Authorization: `Bearer ${env.apiKey}` },
      form,
    );
    if (!res.ok) throw new ApiError(502, "STT_UPSTREAM_ERROR");
    const body = (await res.json()) as { transcript?: unknown };
    const transcript =
      typeof body.transcript === "string" ? body.transcript.trim() : "";
    if (!transcript) throw new ApiError(502, "STT_UPSTREAM_ERROR");
    return { transcript, model: META_STT_MODEL };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, "STT_UPSTREAM_ERROR");
  }
}

export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  // Seam tes saja (route produksi memanggil tanpa argumen ketiga):
  // memungkinkan tes menyuntikkan transcode palsu tanpa ffmpeg.
  transcode: TranscodeFn = transcodeToMetaWav,
): Promise<{ transcript: string; model: string }> {
  const openAi = sttEnv();
  const meta = metaSttEnv();
  if (!sttConfigured() && !metaSttConfigured()) {
    throw new ApiError(503, "STT_NOT_CONFIGURED");
  }
  if (typeof audioBase64 !== "string" || audioBase64.length === 0) {
    throw new ApiError(400, "STT_AUDIO_INVALID");
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    throw new ApiError(413, "STT_AUDIO_TOO_LARGE");
  }
  const audio = Buffer.from(audioBase64, "base64");
  if (audio.length === 0) throw new ApiError(400, "STT_AUDIO_INVALID");
  // STT_* lengkap mengalahkan Meta: jalur lama tidak berubah perilakunya.
  if (sttConfigured()) return transcribeOpenAiCompatible(audio, mimeType, openAi);
  return transcribeMeta(audio, meta, mimeType, transcode);
}
