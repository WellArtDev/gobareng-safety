// AI-G Glimmer — endpoint ingest idempotent (TDD). Dijalankan per-file
// dengan DATABASE_URL menunjuk DB tes sendiri (gbtest_aig) + migrate.
// Aturan yang dikunci:
// 1. POST yang sama (user + clientMessageId) tidak menduplikasi dan
//    tidak memanggil AI kedua kali.
// 2. Gagal AI (502) menyimpan pesan tanpa jawaban; kirim ulang kunci
//    yang sama menjawabnya tanpa baris baru.
// 3. Kunci idempotensi per pengguna: kunci sama dari pengguna lain
//    adalah pesan berbeda.
// 4. Tanpa token = 401; payload kosong = 400.
// STUB: hanya fetch ke Meta Model API yang di-stub di sini (jaringan
// tiruan); kode produksi tidak berisi jawaban AI palsu.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4191;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;
let tokenA = "";
let tokenB = "";

type Json = Record<string, unknown>;

async function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Json };
}

function data(r: { status: number; json: Json }): Json {
  return r.json.data as Json;
}
function errCode(r: { status: number; json: Json }): string {
  return (r.json.error as Json)?.code as string;
}

// Stub fetch: hanya URL Meta Model API yang dibelokkan; sisanya (HTTP
// ke aplikasi sendiri) diteruskan ke fetch asli.
const originalFetch = globalThis.fetch;
let aiCalls = 0;
let aiShouldFail = false;

function installAiStub(): void {
  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    const url = String(input);
    if (url.startsWith("http://ai-stub.local")) {
      aiCalls += 1;
      if (aiShouldFail) {
        return new Response(JSON.stringify({ error: "boom" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Jawaban Glimmer untukmu." } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return originalFetch(input as never, init as never);
  }) as typeof fetch;
}

beforeAll(async () => {
  process.env.META_MODEL_API_BASE = "http://ai-stub.local";
  process.env.META_MODEL_API_KEY = "test-key";
  installAiStub();
  const { createApp } = await import("../app.js");
  const { Db: DbClass } = await import("../db.js");
  const { signToken } = await import("../auth.js");
  testDb = new DbClass();
  const { app, ready } = createApp(testDb);
  http = createServer(app);
  await ready;
  await new Promise<void>((resolve) => http.listen(PORT, resolve));

  const mkUser = async (name: string) => {
    const user = await testDb.createUser({
      email: `${name}-${run}@t.local`,
      name,
      slug: `${name}-${run}`,
      passwordHash: "x",
      phone: null,
      isAdmin: false,
      role: "user",
      isVerified: true,
    });
    return signToken(user);
  };
  tokenA = await mkUser("glimmera");
  tokenB = await mkUser("glimmerb");
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  http?.close();
});

describe("glimmer ingest", () => {
  test("POST baru menjawab + membawa model untuk atribusi", async () => {
    const before = aiCalls;
    const r = await call("POST", "/ai/glimmer", tokenA, {
      clientMessageId: `g1-${run}`,
      message: "Apa itu Glimmer?",
    });
    expect(r.status).toBe(200);
    expect(data(r).answer).toBe("Jawaban Glimmer untukmu.");
    expect(data(r).model).toBe("muse-spark-open");
    expect(aiCalls).toBe(before + 1);
  });

  test("POST ulang kunci yang sama tidak duplikat dan tidak panggil AI lagi", async () => {
    const key = `g2-${run}`;
    const first = await call("POST", "/ai/glimmer", tokenA, {
      clientMessageId: key,
      message: "Pertanyaan sama",
    });
    expect(first.status).toBe(200);
    const before = aiCalls;
    const second = await call("POST", "/ai/glimmer", tokenA, {
      clientMessageId: key,
      message: "Pertanyaan sama",
    });
    expect(second.status).toBe(200);
    expect(data(second).id).toBe(data(first).id);
    expect(aiCalls).toBe(before);

    const list = await call("GET", "/ai/glimmer", tokenA);
    expect(list.status).toBe(200);
    const rows = (data(list).items ?? []) as Json[];
    expect(rows.filter((row) => row.clientMessageId === key)).toHaveLength(1);
  });

  test("gagal AI = 502, pesan tersimpan; kirim ulang kunci sama menjawab tanpa duplikat", async () => {
    const key = `g3-${run}`;
    aiShouldFail = true;
    const failed = await call("POST", "/ai/glimmer", tokenA, {
      clientMessageId: key,
      message: "Tolong jawab nanti",
    });
    expect(failed.status).toBe(502);
    expect(errCode(failed)).toBe("AI_UPSTREAM_ERROR");
    aiShouldFail = false;

    const listBefore = await call("GET", "/ai/glimmer", tokenA);
    const rowsBefore = (data(listBefore).items ?? []) as Json[];
    const pending = rowsBefore.find((row) => row.clientMessageId === key);
    expect(pending).toBeDefined();
    expect(pending?.answer ?? null).toBeNull();

    const retried = await call("POST", "/ai/glimmer", tokenA, {
      clientMessageId: key,
      message: "Tolong jawab nanti",
    });
    expect(retried.status).toBe(200);
    expect(data(retried).answer).toBe("Jawaban Glimmer untukmu.");

    const listAfter = await call("GET", "/ai/glimmer", tokenA);
    const rowsAfter = (data(listAfter).items ?? []) as Json[];
    expect(rowsAfter.filter((row) => row.clientMessageId === key)).toHaveLength(1);
  });

  test("kunci sama dari pengguna lain adalah pesan berbeda", async () => {
    const key = `g4-${run}`;
    const a = await call("POST", "/ai/glimmer", tokenA, {
      clientMessageId: key,
      message: "Dari A",
    });
    const b = await call("POST", "/ai/glimmer", tokenB, {
      clientMessageId: key,
      message: "Dari B",
    });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(data(b).id).not.toBe(data(a).id);
  });

  test("prioritas SOS tersimpan dan daftar terurut createdAt", async () => {
    const r = await call("POST", "/ai/glimmer", tokenB, {
      clientMessageId: `g5-${run}`,
      message: "Butuh bantuan cepat",
      priority: "sos",
    });
    expect(r.status).toBe(200);
    expect(data(r).priority).toBe("sos");
    const list = await call("GET", "/ai/glimmer", tokenB);
    const rows = (data(list).items ?? []) as Json[];
    const mine = rows.filter((row) => String(row.clientMessageId).startsWith("g5-"));
    expect(mine).toHaveLength(1);
    expect(mine[0]?.priority).toBe("sos");
  });

  test("modul aiG mati = 403 AI_MODULE_DISABLED, lalu nyala lagi", async () => {
    await testDb.updatePlatformSettings({ aiG: false });
    const off = await call("POST", "/ai/glimmer", tokenA, {
      clientMessageId: `g-gate-${run}`,
      message: "Halo",
    });
    expect(off.status).toBe(403);
    expect(errCode(off)).toBe("AI_MODULE_DISABLED");
    await testDb.updatePlatformSettings({ aiG: true });
    const on = await call("POST", "/ai/glimmer", tokenA, {
      clientMessageId: `g-gate-${run}`,
      message: "Halo",
    });
    expect(on.status).toBe(200);
  });

  test("tanpa token = 401; payload tidak valid = 400", async () => {
    const noAuth = await call("POST", "/ai/glimmer", undefined, {
      clientMessageId: `g6-${run}`,
      message: "Halo",
    });
    expect(noAuth.status).toBe(401);
    const empty = await call("POST", "/ai/glimmer", tokenA, {
      clientMessageId: `g7-${run}`,
      message: "   ",
    });
    expect(empty.status).toBe(400);
    expect(errCode(empty)).toBe("INVALID_PAYLOAD");
    const noKey = await call("POST", "/ai/glimmer", tokenA, {
      message: "Halo",
    });
    expect(noKey.status).toBe(400);
  });
});
