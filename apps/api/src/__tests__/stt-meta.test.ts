// Meta Muse Voice Transcribe — jalur STT SOS suara (TDD RED).
// Unit murni (tanpa DB): stub HTTP menangkap multipart yang dikirim
// transcribeAudio, supaya kontrak ASR bisa diverifikasi tanpa kunci live.
//
// Kontrak yang diuji (dari cookbook resmi Meta + penilaian pihak kedua
// atas docs Meta — endpoint resmi dev.meta.ai tidak bisa di-fetch dari
// VM ini, jadi nilai-nilai ini dicatat sebagai asumsi di PR):
//   POST {META_MODEL_API_BASE}/asr/transcribe, Bearer META_MODEL_API_KEY
//   multipart: part JSON `request` + part audio `audio`
//   request = { model: "muse-voice-transcribe-1.0", audioEncoding: "WAV",
//               mode: "PUSH_TO_TALK", languageBias: ["Indonesian"] }
//   respons JSON: { transcript } — kosong/gagal = 502, bukan teks palsu.
// Audio HARUS WAV PCM16 mono 16/24 kHz (satu-satunya bentuk yang
// diterima endpoint file Meta); selain itu = 502 tanpa memanggil upstream.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import { ApiError } from "../errors.js";
import { transcribeAudio } from "../stt.js";

const META_PORT = 4292;
const OPENAI_PORT = 4293;

let metaStub: Server;
let openaiStub: Server;
let lastMeta: { url: string; auth: string; body: Buffer } | null = null;
let lastOpenai: { url: string; body: Buffer } | null = null;
let metaStatus = 200;
let metaBody: unknown = { transcript: "tolong saya tersesat" };

function makeWav(opts: {
  rate?: number;
  channels?: number;
  bits?: number;
  format?: number;
} = {}): Buffer {
  const rate = opts.rate ?? 16000;
  const channels = opts.channels ?? 1;
  const bits = opts.bits ?? 16;
  const format = opts.format ?? 1;
  const pcm = Buffer.alloc(1600);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(format, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * (bits / 8), 28);
  header.writeUInt16LE(channels * (bits / 8), 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const FAKE_M4A = Buffer.from("fake-m4a-bytes-bukan-wav");

async function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

beforeAll(async () => {
  metaStub = createServer(async (req, res) => {
    const body = await readBody(req);
    lastMeta = {
      url: req.url ?? "",
      auth: req.headers.authorization ?? "",
      body,
    };
    res.writeHead(metaStatus, { "content-type": "application/json" });
    res.end(JSON.stringify(metaBody));
  });
  openaiStub = createServer(async (req, res) => {
    const body = await readBody(req);
    lastOpenai = { url: req.url ?? "", body };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: "teks openai" }));
  });
  await new Promise<void>((r) => metaStub.listen(META_PORT, r));
  await new Promise<void>((r) => openaiStub.listen(OPENAI_PORT, r));
});

afterAll(() => {
  metaStub?.close();
  openaiStub?.close();
  // Kembalikan env seperti sebelum file ini (bun menjalankan file tes
  // dalam satu proses — tanpa restore, STT_*/META_* yang diubah di sini
  // bisa bocor ke suite lain yang berbagi proses).
  for (const k of Object.keys(process.env)) {
    if (!(k in SAVED)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(SAVED)) process.env[k] = v;
});

const SAVED = { ...process.env };

function clearAll() {
  delete process.env.STT_PROVIDER;
  delete process.env.STT_API_KEY;
  delete process.env.STT_API_BASE;
  delete process.env.STT_MODEL;
  delete process.env.META_MODEL_API_KEY;
  delete process.env.META_MODEL_API_BASE;
}

function setMetaOnly() {
  clearAll();
  process.env.META_MODEL_API_KEY = "meta-test-key";
  process.env.META_MODEL_API_BASE = `http://localhost:${META_PORT}/v1`;
}

function setBoth() {
  setMetaOnly();
  process.env.STT_PROVIDER = "openai-compatible";
  process.env.STT_API_KEY = "openai-test-key";
  process.env.STT_API_BASE = `http://localhost:${OPENAI_PORT}/v1`;
  process.env.STT_MODEL = "whisper-test";
}

async function expectApiError(
  p: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(status);
    expect((e as ApiError).code).toBe(code);
    return;
  }
  throw new Error(`expected ApiError ${status} ${code}, got success`);
}

describe("STT Meta (muse-voice-transcribe-1.0)", () => {
  test("Meta-only + WAV 16kHz mono -> transkrip + kontrak multipart Meta", async () => {
    setMetaOnly();
    lastMeta = null;
    metaStatus = 200;
    metaBody = { transcript: "tolong saya tersesat" };
    const wav = makeWav();
    const out = await transcribeAudio(wav.toString("base64"), "audio/wav");
    expect(out.transcript).toBe("tolong saya tersesat");
    expect(out.model).toBe("muse-voice-transcribe-1.0");
    expect(lastMeta).not.toBeNull();
    expect(lastMeta!.url).toBe("/v1/asr/transcribe");
    expect(lastMeta!.auth).toBe("Bearer meta-test-key");
    const body = lastMeta!.body.toString("latin1");
    expect(body).toContain("muse-voice-transcribe-1.0");
    expect(body).toContain('"audioEncoding":"WAV"');
    expect(body).toContain('"mode":"PUSH_TO_TALK"');
    expect(body).toContain("Indonesian");
    expect(lastMeta!.body.includes(wav.subarray(44))).toBe(true);
  });

  test("Meta-only + WAV 24kHz mono juga diterima", async () => {
    setMetaOnly();
    lastMeta = null;
    metaStatus = 200;
    metaBody = { transcript: "halo" };
    const out = await transcribeAudio(makeWav({ rate: 24000 }).toString("base64"), "audio/wav");
    expect(out.transcript).toBe("halo");
    expect(lastMeta!.url).toBe("/v1/asr/transcribe");
  });

  test("STT_* lengkap mengalahkan Meta (jalur OpenAI lama tidak berubah)", async () => {
    setBoth();
    lastMeta = null;
    lastOpenai = null;
    const out = await transcribeAudio(FAKE_M4A.toString("base64"), "audio/m4a");
    expect(out.transcript).toBe("teks openai");
    expect(out.model).toBe("whisper-test");
    expect(lastMeta).toBeNull();
    expect(lastOpenai!.url).toBe("/v1/audio/transcriptions");
  });

  test("tidak ada STT_* maupun Meta -> 503 STT_NOT_CONFIGURED", async () => {
    clearAll();
    await expectApiError(
      transcribeAudio(makeWav().toString("base64"), "audio/wav"),
      503,
      "STT_NOT_CONFIGURED",
    );
  });

  test("Meta upstream gagal -> 502 STT_UPSTREAM_ERROR, bukan transkrip palsu", async () => {
    setMetaOnly();
    metaStatus = 400;
    metaBody = { error: "bad audio" };
    await expectApiError(
      transcribeAudio(makeWav().toString("base64"), "audio/wav"),
      502,
      "STT_UPSTREAM_ERROR",
    );
    metaStatus = 200;
  });

  test("Meta transkrip kosong -> 502 STT_UPSTREAM_ERROR", async () => {
    setMetaOnly();
    metaBody = { transcript: "   " };
    await expectApiError(
      transcribeAudio(makeWav().toString("base64"), "audio/wav"),
      502,
      "STT_UPSTREAM_ERROR",
    );
    metaBody = { transcript: "tolong saya tersesat" };
  });

  test("Meta-only + audio bukan WAV -> 502 tanpa memanggil upstream", async () => {
    setMetaOnly();
    lastMeta = null;
    await expectApiError(
      transcribeAudio(FAKE_M4A.toString("base64"), "audio/m4a"),
      502,
      "STT_UPSTREAM_ERROR",
    );
    expect(lastMeta).toBeNull();
  });

  test("Meta-only + WAV stereo / 8kHz / 8-bit -> 502 tanpa memanggil upstream", async () => {
    setMetaOnly();
    lastMeta = null;
    await expectApiError(
      transcribeAudio(makeWav({ channels: 2 }).toString("base64"), "audio/wav"),
      502,
      "STT_UPSTREAM_ERROR",
    );
    await expectApiError(
      transcribeAudio(makeWav({ rate: 8000 }).toString("base64"), "audio/wav"),
      502,
      "STT_UPSTREAM_ERROR",
    );
    await expectApiError(
      transcribeAudio(makeWav({ bits: 8 }).toString("base64"), "audio/wav"),
      502,
      "STT_UPSTREAM_ERROR",
    );
    expect(lastMeta).toBeNull();
  });
});
