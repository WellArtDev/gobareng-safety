// Provider tema — pola sama dengan i18n (LanguageProvider): Context +
// useMemo. Kebijakan mengikuti web (apps/web/src/lib/theme.ts): selalu
// mulai light, toggle manual, abaikan prefers-color-scheme.
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { colors, colorsDark, type ThemeColors } from "./tokens";
import type { ThemeMode } from "@/utils/settings-store";

type ThemeContextValue = {
  theme: ThemeMode;
  colors: ThemeColors;
  setTheme: (theme: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  colors,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colors: theme === "dark" ? colorsDark : colors,
      setTheme,
    }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Helper untuk layar: factory styles dibekukan per palet via useMemo.
export function useThemedStyles<T>(makeStyles: (c: ThemeColors) => T): T {
  const { colors: themeColors } = useTheme();
  return useMemo(() => makeStyles(themeColors), [makeStyles, themeColors]);
}
