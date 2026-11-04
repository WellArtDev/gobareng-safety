// Server-side transcode m4a -> WAV untuk jalur Meta ASR (TDD RED).
// Keputusan Wella 4 Nov 01:04: SERVER yang mentranscode, bukan HP
// yang merekam WAV. Mobile tidak berubah; rekaman HP tetap m4a
// (expo-audio HIGH_QUALITY), server mengubahnya menjadi WAV PCM16
// mono 16 kHz sebelum memanggil endpoint file Meta.
//
// Kontrak yang diuji:
//   m4a masuk -> WAV PCM16 mono 16 kHz keluar -> dikirim ke Meta
//   transcode gagal / hasil bukan WAV Meta-compatible -> 502
//     STT_UPSTREAM_ERROR, TANPA memanggil upstream, tanpa teks palsu
//   jalur STT_* lama tidak berubah; tanpa STT tetap 503.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ApiError } from "../errors.js";
import { transcribeAudio } from "../stt.js";

const META_PORT = 4296;

let metaStub: Server;
let lastMeta: { url: string; auth: string; body: Buffer } | null = null;
let metaStatus = 200;
let metaBody: unknown = { transcript: "tolong saya tersesat" };

function makeWav(opts: {
  rate?: number;
  channels?: number;
  bits?: number;
} = {}): Buffer {
  const rate = opts.rate ?? 16000;
  const channels = opts.channels ?? 1;
  const bits = opts.bits ?? 16;
  const pcm = Buffer.alloc(1600);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * (bits / 8), 28);
  header.writeUInt16LE(channels * (bits / 8), 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

beforeAll(async () => {
  metaStub = createServer(async (req, res) => {
    const body = await readBody(req);
    lastMeta = { url: req.url ?? "", auth: req.headers.authorization ?? "", body };
    res.writeHead(metaStatus, { "content-type": "application/json" });
    res.end(JSON.stringify(metaBody));
  });
  await new Promise<void>((r) => metaStub.listen(META_PORT, r));
});

afterAll(() => {
  metaStub?.close();
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

const FAKE_M4A = Buffer.from("fake-m4a-bytes-bukan-wav");

/** Header WAV yang dikirim ke Meta, diekstrak dari body multipart. */
function sentWavHeader(body: Buffer): {
  rate: number;
  channels: number;
  bits: number;
} | null {
  const idx = body.indexOf(Buffer.from("RIFF"));
  if (idx < 0 || idx + 44 > body.length) return null;
  return {
    channels: body.readUInt16LE(idx + 22),
    rate: body.readUInt32LE(idx + 24),
    bits: body.readUInt16LE(idx + 34),
  };
}

function makeRealM4a(): Buffer | null {
  // Muxer m4a butuh output seekable, jadi tulis ke file temp dulu
  // (bukan pipe) lalu baca kembali.
  const dir = mkdtempSync(join(tmpdir(), "stt-m4a-"));
  const file = join(dir, "tone.m4a");
  try {
    const r = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=0.5",
        "-c:a",
        "aac",
        file,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    if (r.status !== 0) return null;
    const buf = readFileSync(file);
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HAS_FFMPEG = makeRealM4a() !== null;

describe("STT Meta transcode m4a -> WAV (server-side)", () => {
  test("m4a + transcode sukses -> WAV dikirim ke Meta, transkrip kembali", async () => {
    setMetaOnly();
    lastMeta = null;
    metaStatus = 200;
    metaBody = { transcript: "tolong saya tersesat" };
    let seen: Buffer | null = null;
    const fakeTranscode = async (input: Buffer): Promise<Buffer> => {
      seen = input;
      return makeWav();
    };
    const out = await transcribeAudio(
      FAKE_M4A.toString("base64"),
      "audio/m4a",
      fakeTranscode,
    );
    expect(seen).not.toBeNull();
    expect(Buffer.compare(seen!, FAKE_M4A)).toBe(0);
    expect(out.transcript).toBe("tolong saya tersesat");
    expect(lastMeta).not.toBeNull();
    expect(lastMeta!.url).toBe("/v1/asr/transcribe");
    const header = sentWavHeader(lastMeta!.body);
    expect(header).toEqual({ channels: 1, rate: 16000, bits: 16 });
  });

  test("transcode gagal -> 502 tanpa memanggil upstream", async () => {
    setMetaOnly();
    lastMeta = null;
    let called = false;
    const failingTranscode = async (_input: Buffer): Promise<Buffer> => {
      called = true;
      throw new Error("ffmpeg gagal");
    };
    await expectApiError(
      transcribeAudio(FAKE_M4A.toString("base64"), "audio/m4a", failingTranscode),
      502,
      "STT_UPSTREAM_ERROR",
    );
    expect(called).toBe(true);
    expect(lastMeta).toBeNull();
  });

  test("transcode menghasilkan WAV tidak kompatibel -> 502 tanpa upstream", async () => {
    setMetaOnly();
    lastMeta = null;
    let called = false;
    const badTranscode = async (_input: Buffer): Promise<Buffer> => {
      called = true;
      return makeWav({ channels: 2, rate: 48000 });
    };
    await expectApiError(
      transcribeAudio(FAKE_M4A.toString("base64"), "audio/m4a", badTranscode),
      502,
      "STT_UPSTREAM_ERROR",
    );
    expect(called).toBe(true);
    expect(lastMeta).toBeNull();
  });

  test("tanpa STT maupun Meta + m4a -> 503, transcode tidak dipanggil", async () => {
    clearAll();
    let called = false;
    const countingTranscode = async (input: Buffer): Promise<Buffer> => {
      called = true;
      return input;
    };
    await expectApiError(
      transcribeAudio(FAKE_M4A.toString("base64"), "audio/m4a", countingTranscode),
      503,
      "STT_NOT_CONFIGURED",
    );
    expect(called).toBe(false);
  });

  test.skipIf(!HAS_FFMPEG)(
    "ffmpeg sungguhan: m4a nyata -> WAV 16kHz mono dikirim ke Meta",
    async () => {
      setMetaOnly();
      lastMeta = null;
      metaStatus = 200;
      metaBody = { transcript: "suara nyata" };
      const m4a = makeRealM4a();
      expect(m4a).not.toBeNull();
      const out = await transcribeAudio(m4a!.toString("base64"), "audio/m4a");
      expect(out.transcript).toBe("suara nyata");
      expect(lastMeta).not.toBeNull();
      expect(lastMeta!.url).toBe("/v1/asr/transcribe");
      const header = sentWavHeader(lastMeta!.body);
      expect(header).toEqual({ channels: 1, rate: 16000, bits: 16 });
    },
  );
});
