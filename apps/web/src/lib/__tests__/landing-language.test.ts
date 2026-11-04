// Web regression suite (TDD) — landing (logged-out) ID|EN toggle:
// the login screen at / is the public landing. Its EN|ID switcher must
// be visible, flip every landing string through the shared $t store,
// and PERSIST: a stored 'en' choice must survive a reload instead of
// being forced back to 'id' by initialLocale (the pre-fix behaviour).
// Default stays Indonesian: unknown/absent stored values fall to 'id'.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { id } from "../i18n/id";
import { en } from "../i18n/en";

const page = readFileSync(
  new URL("../../routes/+page.svelte", import.meta.url),
  "utf8",
);
const i18n = readFileSync(
  new URL("../i18n/index.ts", import.meta.url),
  "utf8",
);

type Tree = Record<string, unknown>;

function resolve(dict: Tree, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc as Tree | undefined)?.[part],
      dict,
    );
}

// Every string the logged-out landing view renders through $t.
const LANDING_KEYS = [
  "app.name",
  "auth.adminOnly",
  "auth.changeIdentifier",
  "auth.denied",
  "auth.deniedHint",
  "auth.email",
  "auth.heading",
  "auth.login",
  "auth.otpCode",
  "auth.otpIntro",
  "auth.resendOtp",
  "auth.sendOtp",
  "auth.subtitle",
  "common.loading",
  "language.en",
  "language.id",
  "language.label",
  "language.shortEn",
  "language.shortId",
  "meta.description",
  "meta.title",
];

describe("landing page language toggle", () => {
  test("logged-out view renders a visible EN | ID switcher", () => {
    const loggedOut = page.slice(
      page.indexOf("{#if !me}"),
      page.indexOf("{#if errorCode"),
    );
    expect(loggedOut).toContain('<div class="lang-switch">');
    expect(loggedOut).toContain("setLocale('en')");
    expect(loggedOut).toContain("setLocale('id')");
    expect(loggedOut).toContain("$t('language.shortEn')");
    expect(loggedOut).toContain("$t('language.shortId')");
    expect(loggedOut).toContain("class:active={$locale === 'en'}");
    expect(loggedOut).toContain("class:active={$locale === 'id'}");
  });

  test("every landing string resolves in both dictionaries", () => {
    for (const key of LANDING_KEYS) {
      expect(typeof resolve(id as unknown as Tree, key)).toBe("string");
      expect(typeof resolve(en as unknown as Tree, key)).toBe("string");
    }
  });

  test("landing strings actually differ between id and en (no copy-paste dict)", () => {
    const differing = LANDING_KEYS.filter(
      (key) =>
        resolve(id as unknown as Tree, key) !==
        resolve(en as unknown as Tree, key),
    );
    // Brand name, language names/short labels, the page title, and the
    // 'Email'/'Login' loanwords are intentionally identical in both
    // dictionaries; everything else must translate, otherwise the
    // toggle would change nothing.
    const identical = [
      "app.name",
      "auth.email",
      "auth.heading",
      "language.en",
      "language.id",
      "language.shortEn",
      "language.shortId",
      "meta.title",
    ];
    expect(differing).toEqual(LANDING_KEYS.filter((k) => !identical.includes(k)));
  });

  test("initial locale honours the stored choice, defaulting to id", () => {
    expect(i18n).toContain("localStorage.getItem('gobareng-locale')");
    expect(i18n).toContain("stored === 'en' || stored === 'id' ? stored : 'id'");
    expect(i18n).toContain("localStorage.setItem('gobareng-locale', next)");
  });
});
