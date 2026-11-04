// Regresi PR #162: label peran di detail trip sempat memakai kunci
// "tripList.role*" yang tidak ada di kamus, sehingga layar menampilkan
// kunci mentahnya ("tripList.roleLeader"). Tes ini memastikan setiap
// kunci label peran benar-benar resolve ke string terjemahan di ID dan EN.
import { describe, expect, test } from "bun:test";

import { en } from "../i18n/en";
import { id } from "../i18n/id";
import { TRIP_ROLE_LABEL_KEY } from "../utils/trip-role-labels";

function resolve(
  dict: Record<string, unknown>,
  path: string,
): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, part) =>
        typeof acc === "object" && acc !== null
          ? (acc as Record<string, unknown>)[part]
          : undefined,
      dict,
    );
}

describe("label peran trip", () => {
  test("setiap kunci resolve ke string tak-kosong di ID dan EN", () => {
    for (const key of Object.values(TRIP_ROLE_LABEL_KEY)) {
      const idValue = resolve(id as unknown as Record<string, unknown>, key);
      const enValue = resolve(en as unknown as Record<string, unknown>, key);
      expect(typeof idValue).toBe("string");
      expect((idValue as string).length).toBeGreaterThan(0);
      expect(idValue).not.toBe(key);
      expect(typeof enValue).toBe("string");
      expect((enValue as string).length).toBeGreaterThan(0);
      expect(enValue).not.toBe(key);
    }
  });

  test("tidak ada kunci label peran di namespace tripList", () => {
    for (const key of Object.values(TRIP_ROLE_LABEL_KEY)) {
      expect(key.startsWith("tripList.")).toBe(false);
    }
  });

  test("nilai label sesuai kamus yang ada", () => {
    expect(resolve(id as unknown as Record<string, unknown>, TRIP_ROLE_LABEL_KEY.LEADER)).toBe("Leader");
    expect(resolve(id as unknown as Record<string, unknown>, TRIP_ROLE_LABEL_KEY.MEMBER)).toBe("Anggota");
    expect(resolve(id as unknown as Record<string, unknown>, TRIP_ROLE_LABEL_KEY.SWEEPER)).toBe("Sweeper");
    expect(resolve(id as unknown as Record<string, unknown>, TRIP_ROLE_LABEL_KEY.MEDIC)).toBe("Medic");
    expect(resolve(en as unknown as Record<string, unknown>, TRIP_ROLE_LABEL_KEY.LEADER)).toBe("Leader");
    expect(resolve(en as unknown as Record<string, unknown>, TRIP_ROLE_LABEL_KEY.MEMBER)).toBe("Member");
  });
});
