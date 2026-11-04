// AI-V — unit klasifikasi alasan dari transkrip (murni, tanpa DB/AI).
// Aturan: kata kunci darurat didahulukan (EMERGENCY > URGENT > HELP)
// supaya "tersesat dan kaki luka" diklasifikasi CEDERA, bukan TERSESAT.
// Klasifikasi AI (Meta) diuji terpisah dengan fetch stub: balasan di
// luar daftar kandidat -> null (fallback keyword), bukan alasan palsu.
import { describe, expect, test } from "bun:test";

import {
  classifyWithMeta,
  detectGeneralReason,
  detectTripReason,
} from "../voice-sos.js";

describe("detectTripReason", () => {
  test("cedera / luka / jatuh", () => {
    expect(detectTripReason("kaki saya luka parah", "HIKING")).toBe("CEDERA");
    expect(detectTripReason("teman saya jatuh dari tebing", "HIKING")).toBe("CEDERA");
  });
  test("tersesat / nyasar", () => {
    expect(detectTripReason("tolong saya tersesat di jalur", "HIKING")).toBe("TERSESAT");
    expect(detectTripReason("kami nyasar, tidak tahu jalan pulang", "HIKING")).toBe("TERSESAT");
  });
  test("medis: sesak / pingsan / ambulans", () => {
    expect(detectTripReason("teman sesak napas", "HIKING")).toBe("MEDIS");
    expect(detectTripReason("ada yang pingsan", "TOURING")).toBe("MEDIS");
  });
  test("touring: mogok / bensin / ban / kecelakaan", () => {
    expect(detectTripReason("motor saya mogok", "TOURING")).toBe("MOTOR_RUSAK");
    expect(detectTripReason("bensin habis di tengah jalan", "TOURING")).toBe("BENSIN_HABIS");
    expect(detectTripReason("ban bocor", "TOURING")).toBe("BAN_BOCOR");
    expect(detectTripReason("kami kecelakaan, motor tabrakan", "TOURING")).toBe("KECELAKAAN");
  });
  test("alasan touring tidak berlaku untuk HIKING -> fallback LAINNYA", () => {
    expect(detectTripReason("motor saya mogok", "HIKING")).toBe("LAINNYA");
  });
  test("darurat didahulukan atas tersesat", () => {
    expect(detectTripReason("tersesat dan kaki saya luka", "HIKING")).toBe("CEDERA");
  });
  test("tanpa kata kunci -> LAINNYA", () => {
    expect(detectTripReason("tolong, saya butuh bantuan", "HIKING")).toBe("LAINNYA");
    expect(detectTripReason("", "TOURING")).toBe("LAINNYA");
  });
});

describe("detectGeneralReason", () => {
  test("kebakaran / kejahatan / banjir", () => {
    expect(detectGeneralReason("ada kebakaran di pasar")).toBe("KEBAKARAN");
    expect(detectGeneralReason("saya dibegal orang")).toBe("KEJAHATAN");
    expect(detectGeneralReason("banjir, pohon tumbang menutup jalan")).toBe("BANJIR_POHON_TUMBANG");
  });
  test("sakit / ambulans / kendaraan", () => {
    expect(detectGeneralReason("bapak saya sakit mendadak")).toBe("SAKIT_MENDADAK");
    expect(detectGeneralReason("tolong panggil ambulans")).toBe("BUTUH_AMBULANS");
    expect(detectGeneralReason("kendaraan mogok di tol")).toBe("KENDARAAN_MOGOK");
    expect(detectGeneralReason("ban bocor dan bensin habis")).toBe("BAN_BOCOR_BENSIN_HABIS");
    expect(detectGeneralReason("kecelakaan lalu lintas beruntun")).toBe("KECELAKAAN_LALU_LINTAS");
  });
  test("tanpa kata kunci -> BUTUH_BANTUAN_SEGERA", () => {
    expect(detectGeneralReason("tolong saya tersesat")).toBe("BUTUH_BANTUAN_SEGERA");
    expect(detectGeneralReason("")).toBe("BUTUH_BANTUAN_SEGERA");
  });
});

describe("classifyWithMeta", () => {
  const realFetch = globalThis.fetch;
  const stubFetch = (content: string) => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
  };

  test("balasan AI yang valid dipakai; model ikut dikembalikan", async () => {
    process.env.META_MODEL_API_KEY = "k";
    process.env.META_MODEL_API_BASE = "https://meta.test/v1";
    process.env.META_MODEL_NAME = "muse-spark-open";
    stubFetch("CEDERA");
    try {
      const out = await classifyWithMeta("kaki luka", ["TERSESAT", "CEDERA", "MEDIS", "LAINNYA"]);
      expect(out).toEqual({ reason: "CEDERA", model: "muse-spark-open" });
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.META_MODEL_API_KEY;
      delete process.env.META_MODEL_API_BASE;
      delete process.env.META_MODEL_NAME;
    }
  });

  test("balasan AI di luar kandidat -> null (fallback keyword)", async () => {
    process.env.META_MODEL_API_KEY = "k";
    process.env.META_MODEL_API_BASE = "https://meta.test/v1";
    stubFetch("SAYA TIDAK TAHU");
    try {
      const out = await classifyWithMeta("kaki luka", ["TERSESAT", "CEDERA"]);
      expect(out).toBeNull();
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.META_MODEL_API_KEY;
      delete process.env.META_MODEL_API_BASE;
    }
  });

  test("Meta tidak dikonfigurasi -> null tanpa memanggil jaringan", async () => {
    delete process.env.META_MODEL_API_KEY;
    delete process.env.META_MODEL_API_BASE;
    let called = false;
    globalThis.fetch = (async (...args: unknown[]) => {
      called = true;
      return realFetch(...(args as [RequestInfo]));
    }) as typeof fetch;
    try {
      const out = await classifyWithMeta("kaki luka", ["CEDERA"]);
      expect(out).toBeNull();
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
