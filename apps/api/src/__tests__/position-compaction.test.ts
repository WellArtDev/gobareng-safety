// TDD RED — M7 server: compaction posisi lama (fungsi MURNI, tanpa DB).
// Aturan persis (didokumentasikan di position-compaction.ts):
// - Hanya baris LEBIH TUA dari 30 menit yang diproses; baris lebih baru
//   dari 30 menit TIDAK PERNAH dihapus, berapa pun jumlahnya.
// - Baris lama dikelompokkan per jendela 5 menit (epoch absolut);
//   tiap jendela menyimpan baris PERTAMA dan TERAKHIR, sisanya hapus.
// - Baris tepat di batas 30 menit BUKAN "lebih tua" -> dipertahankan.
// - ts yang tak bisa diparse tidak pernah dihapus (fail-safe).
import { describe, expect, test } from "bun:test";

import {
  POSITION_COMPACTION_AGE_MS,
  POSITION_COMPACTION_WINDOW_MS,
  planPositionCompaction,
} from "../position-compaction";

const NOW = Date.UTC(2026, 10, 3, 2, 0, 0);
const MIN = 60_000;

function row(id: string, tsMs: number) {
  return { id, ts: new Date(tsMs) };
}

describe("konstanta compaction", () => {
  test("usia 30 menit, jendela 5 menit", () => {
    expect(POSITION_COMPACTION_AGE_MS).toBe(30 * MIN);
    expect(POSITION_COMPACTION_WINDOW_MS).toBe(5 * MIN);
  });
});

describe("planPositionCompaction", () => {
  test("jendela lama: simpan pertama+terakhir, hapus tengah", () => {
    const old = NOW - 60 * MIN; // 60 menit lalu, satu jendela 5 menit
    const rows = [
      row("a", old),
      row("b", old + MIN),
      row("c", old + 2 * MIN),
      row("d", old + 4 * MIN),
    ];
    const plan = planPositionCompaction(rows, NOW);
    expect(plan.keepIds).toEqual(["a", "d"]);
    expect(plan.deleteIds).toEqual(["b", "c"]);
  });

  test("tiap jendela 5 menit diperlakukan sendiri", () => {
    const w1 = NOW - 60 * MIN;
    const w2 = NOW - 50 * MIN;
    const rows = [row("a", w1), row("b", w1 + MIN), row("b2", w1 + 2 * MIN), row("c", w2), row("d", w2 + MIN), row("e", w2 + 2 * MIN)];
    const plan = planPositionCompaction(rows, NOW);
    expect(plan.keepIds).toEqual(["a", "b2", "c", "e"]);
    expect(plan.deleteIds).toEqual(["b", "d"]);
  });

  test("baris lebih baru dari 30 menit TIDAK PERNAH dihapus", () => {
    const fresh = NOW - 10 * MIN;
    const rows = [
      row("f1", fresh),
      row("f2", fresh + MIN),
      row("f3", fresh + 2 * MIN),
      row("f4", fresh + 3 * MIN),
    ];
    const plan = planPositionCompaction(rows, NOW);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.keepIds).toEqual(["f1", "f2", "f3", "f4"]);
  });

  test("baris tepat di batas 30 menit dipertahankan (bukan 'lebih tua')", () => {
    const rows = [row("edge", NOW - 30 * MIN)];
    const plan = planPositionCompaction(rows, NOW);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.keepIds).toEqual(["edge"]);
  });

  test("campuran lama + baru: hanya lama yang dipadatkan", () => {
    const old = NOW - 60 * MIN;
    const fresh = NOW - 5 * MIN;
    const rows = [
      row("a", old),
      row("b", old + MIN),
      row("c", old + 2 * MIN),
      row("f1", fresh),
      row("f2", fresh + MIN),
    ];
    const plan = planPositionCompaction(rows, NOW);
    expect(plan.keepIds).toEqual(["a", "c", "f1", "f2"]);
    expect(plan.deleteIds).toEqual(["b"]);
  });

  test("satu/dua baris per jendela lama tetap dipertahankan", () => {
    const old = NOW - 60 * MIN;
    const plan = planPositionCompaction([row("a", old), row("b", old + MIN)], NOW);
    expect(plan.keepIds).toEqual(["a", "b"]);
    expect(plan.deleteIds).toEqual([]);
  });

  test("input tak terurut tetap dikelompokkan dengan benar", () => {
    const old = NOW - 60 * MIN;
    const rows = [row("c", old + 2 * MIN), row("a", old), row("b", old + MIN)];
    const plan = planPositionCompaction(rows, NOW);
    expect(plan.keepIds).toEqual(["a", "c"]);
    expect(plan.deleteIds).toEqual(["b"]);
  });

  test("input kosong -> tidak ada hapusan; ts tak valid -> dipertahankan", () => {
    expect(planPositionCompaction([], NOW)).toEqual({
      keepIds: [],
      deleteIds: [],
    });
    const plan = planPositionCompaction(
      [{ id: "bad", ts: "bukan-tanggal" }],
      NOW,
    );
    expect(plan.keepIds).toEqual(["bad"]);
    expect(plan.deleteIds).toEqual([]);
  });
});
