// Web regression suite (TDD) — guards that need no browser:
// 1. i18n parity: every key in the id dictionary exists in en and vice
//    versa (same tree shape), so a missing translation can never ship.
// 2. Menu invariants: ids unique, badge styles only where the page
//    passes counts, admin-only pages present for the posko set, and
//    the removed Template Kit menu never comes back silently.
import { describe, expect, test } from "bun:test";
import { id } from "../i18n/id";
import { en } from "../i18n/en";
import { dashboardMenus, poskoMenus, safetyMenus } from "../dashboard-menus";

type Tree = Record<string, unknown>;

function keyPaths(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null
      ? keyPaths(value as Tree, path)
      : [path];
  });
}

describe("i18n parity id <-> en", () => {
  const idKeys = keyPaths(id as unknown as Tree).sort();
  const enKeys = keyPaths(en as unknown as Tree).sort();

  test("en has every id key", () => {
    const missing = idKeys.filter((k) => !enKeys.includes(k));
    expect(missing).toEqual([]);
  });

  test("id has every en key (no orphan English keys)", () => {
    const missing = enKeys.filter((k) => !idKeys.includes(k));
    expect(missing).toEqual([]);
  });

  test("no empty strings in either dictionary", () => {
    const empty = (tree: Tree, prefix = ""): string[] =>
      Object.entries(tree).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "object" && value !== null) return empty(value as Tree, path);
        return value === "" ? [path] : [];
      });
    expect(empty(id as unknown as Tree)).toEqual([]);
    expect(empty(en as unknown as Tree)).toEqual([]);
  });
});

describe("dashboard menus invariants", () => {
  test("ids are unique within every menu set", () => {
    for (const set of [dashboardMenus, poskoMenus, safetyMenus]) {
      const ids = set.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("every labelKey resolves in the id dictionary", () => {
    const keys = keyPaths(id as unknown as Tree);
    for (const set of [dashboardMenus, poskoMenus, safetyMenus]) {
      for (const item of set) {
        expect(keys).toContain(item.labelKey);
      }
    }
  });

  test("posko set: badge styles only on count-bearing pages", () => {
    const badged = poskoMenus.filter((m) => m.badge).map((m) => m.id);
    expect(badged.sort()).toEqual(
      ["moderation", "notifications", "organizer-verification", "proposals", "sos", "trips"].sort()
    );
  });

  test("posko set keeps the admin-only pages and has NO Template Kit menu", () => {
    const ids = poskoMenus.map((m) => m.id);
    for (const required of ['staff', 'organizer-verification', 'organizer', 'moderation']) {
      expect(ids).toContain(required);
    }
    expect(ids).not.toContain('kit');
  });
});
