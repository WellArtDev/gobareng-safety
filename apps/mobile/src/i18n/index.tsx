// Provider i18n — default Indonesia; menambah bahasa = tambah satu file
// terjemahan bertipe Translations + daftarkan di dictionaries, tanpa
// mengubah kode layar (aturan CONTRIBUTING).
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { en } from "./en";
import { id } from "./id";

export type Translations = typeof id;
export type Locale = "id" | "en";

const dictionaries: Record<Locale, Translations> = { en, id };

function resolve(dict: Translations, key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc as Record<string, unknown> | undefined)?.[part],
      dict,
    );
  return typeof value === "string" ? value : key;
}

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  locale: "id",
  setLocale: () => {},
  t: (key) => key,
});

function interpolate(text: string, params?: Record<string, string>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? params[name] : match,
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("id");
  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) =>
        interpolate(resolve(dictionaries[locale], key), params),
    }),
    [locale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
