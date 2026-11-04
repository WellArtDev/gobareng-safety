// Guard magic link juri tanpa OTP di dashboard (3 Nov 2026):
// tautan desktop posko.gobareng.app/?magic=<token> ditukar jadi sesi,
// lalu parameter dibersihkan dari URL. Mengikuti gaya guard web lain
// (baca sumber, bukan render) karena login dashboard hidup di +page.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

const page = read("../../routes/+page.svelte");
const apiSrc = read("../../lib/api.ts");

describe("magic link juri di dashboard", () => {
  test("klien redeemMagicLink memanggil endpoint yang benar", () => {
    expect(apiSrc).toContain("redeemMagicLink");
    expect(apiSrc).toContain("/api/v1/auth/magic-link");
  });

  test("halaman menukar ?magic= jadi sesi lalu membersihkan URL", () => {
    for (const key of [
      "get('magic')",
      "redeemMagicLink(magic)",
      "setToken(res.token)",
      "searchParams.delete('magic')",
      "loadMeAndTrips()",
    ]) {
      expect(page).toContain(key);
    }
  });

  test("token tautan tidak pernah dirender sebagai teks", () => {
    expect(page).not.toContain("{magic}");
  });
});
