// Web regression suite (TDD) — /safety carries its own ID|EN switcher:
// fullscreen ops use (documentElement) hides the dashboard shell header,
// so the shell's language buttons are unreachable there. The switcher
// lives in the safety page's own header and flips the shared locale
// store (persisted to localStorage), so the whole page re-renders in
// the chosen language without leaving fullscreen or reloading.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { id } from "../i18n/id";
import { en } from "../i18n/en";

const src = readFileSync(
  new URL("../../routes/safety/+page.svelte", import.meta.url),
  "utf8",
);

describe("safety page language switcher", () => {
  test("page imports the shared locale store and setter", () => {
    expect(src).toContain("import { locale, setLocale, t } from '#lib/i18n/index';");
  });

  test("header actions contain ID and EN buttons calling setLocale", () => {
    const actions = src.slice(
      src.indexOf('<div class="cc-actions">'),
      src.indexOf('<button class="cc-btn" onclick={() => void loadOverview()}'),
    );
    expect(actions).toContain("setLocale('id')");
    expect(actions).toContain("setLocale('en')");
    expect(actions).toContain("$t('language.shortId')");
    expect(actions).toContain("$t('language.shortEn')");
    expect(actions).toContain("class:active={$locale === 'id'}");
    expect(actions).toContain("class:active={$locale === 'en'}");
  });

  test("short language labels exist in both dictionaries", () => {
    const idLang = (id as unknown as { language: Record<string, string> }).language;
    const enLang = (en as unknown as { language: Record<string, string> }).language;
    expect(idLang.shortId).toBe("ID");
    expect(idLang.shortEn).toBe("EN");
    expect(enLang.shortId).toBe("ID");
    expect(enLang.shortEn).toBe("EN");
  });
});
