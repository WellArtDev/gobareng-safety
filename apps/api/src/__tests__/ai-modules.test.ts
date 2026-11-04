// Gate modul AI (infrastruktur toggle Pengaturan, 2 Nov 2026):
// helper murni, tanpa DB/server. Dipakai tiap endpoint AI saat rebase
// PR AI (#137, #142, #140, #133, #136, #132) — modul nonaktif harus
// menolak eksplisit, tanpa fallback diam-diam.
import { describe, expect, test } from "bun:test";
import {
  AI_MODULES,
  aiModuleEnabled,
  requireAiModule,
  type AiModuleKey,
} from "../ai-modules.js";

const ALL_ON = {
  aiV: true,
  aiP: true,
  aiL: true,
  aiQ: true,
  aiR: true,
  aiG: true,
};

describe("AI module gate", () => {
  test("enam modul terdaftar, satu kunci per modul", () => {
    expect(AI_MODULES.map((m) => m.key).sort()).toEqual([
      "aiG",
      "aiL",
      "aiP",
      "aiQ",
      "aiR",
      "aiV",
    ]);
    expect(new Set(AI_MODULES.map((m) => m.key)).size).toBe(6);
  });

  test("semua modul nyala saat flag true", () => {
    for (const m of AI_MODULES) {
      expect(aiModuleEnabled(ALL_ON, m.key)).toBe(true);
    }
  });

  test("flag yang belum ada (undefined) = nyala, sesuai default ON", () => {
    const empty = {} as Record<AiModuleKey, boolean>;
    for (const m of AI_MODULES) {
      expect(aiModuleEnabled(empty, m.key)).toBe(true);
    }
  });

  test("requireAiModule lolos saat modul nyala", () => {
    expect(() => requireAiModule(ALL_ON, "aiV")).not.toThrow();
  });

  test("requireAiModule melempar 403 AI_MODULE_DISABLED saat modul mati", () => {
    const off = { ...ALL_ON, aiQ: false };
    let caught: unknown;
    try {
      requireAiModule(off, "aiQ");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    const err = caught as { status: number; code: string };
    expect(err.status).toBe(403);
    expect(err.code).toBe("AI_MODULE_DISABLED");
    // Modul lain tidak ikut mati.
    expect(() => requireAiModule(off, "aiV")).not.toThrow();
  });
});
