// Token desain — SATU-SATUNYA sumber: design/app-mockup/index.html :root
// (31 layar). Nilai disalin persis; jangan karang warna baru.
const lightColors = {
  primary: "#18a957",
  primaryDark: "#128a46",
  primarySoft: "#e5f6ec",
  accent: "#f5821f",
  catPendakian: "#16a34a",
  catPendakianBg: "#e7f6ec",
  catTouring: "#f97316",
  catTouringBg: "#fff2e5",
  catOpen: "#2563eb",
  catOpenBg: "#e8effd",
  catPrivate: "#7c3aed",
  catPrivateBg: "#f1eafd",
  bg: "#f4f7f9",
  surface: "#ffffff",
  surface2: "#eef2f5",
  text: "#12212b",
  text2: "#5b6b76",
  text3: "#93a3ad",
  line: "#e3eaee",
  danger: "#e5484d",
  warning: "#d97706",
  warningBg: "#fdf0e0",
  success: "#16a34a",
  successBg: "#e7f6ec",
  stMember: "#22c55e",
  stLeader: "#e3a008",
  stSweeper: "#f97316",
  stSos: "#dc2626",
  stSosDark: "#b91c1c",
  stInfo: "#2563eb",
  gold: "#c99612",
  goldBg: "#fdf3d7",
  errBg: "#fee2e2",
} as const;

// Satu bentuk untuk kedua palet — TS menjaga paritas kunci light/dark.
export type ThemeColors = { readonly [K in keyof typeof lightColors]: string };

export const colors: ThemeColors = lightColors;

// Palet gelap — sumber: design/app-mockup/index.html :root[data-theme="dark"].
// Token tanpa padanan eksplisit di mockup: aksen/status dibiarkan sama
// (mockup juga tidak menimpanya); errBg diturunkan gelap agar kontras.
export const colorsDark: ThemeColors = {
  primary: "#18a957",
  primaryDark: "#128a46",
  primarySoft: "#123526",
  accent: "#f5821f",
  catPendakian: "#16a34a",
  catPendakianBg: "#123526",
  catTouring: "#f97316",
  catTouringBg: "#3a2410",
  catOpen: "#2563eb",
  catOpenBg: "#16294d",
  catPrivate: "#7c3aed",
  catPrivateBg: "#2d1c52",
  bg: "#0d151b",
  surface: "#16222b",
  surface2: "#1d2c37",
  text: "#eef4f7",
  text2: "#a7b8c1",
  text3: "#6e828d",
  line: "#26363f",
  danger: "#e5484d",
  warning: "#d97706",
  warningBg: "#3a2a10",
  success: "#16a34a",
  successBg: "#123526",
  stMember: "#22c55e",
  stLeader: "#e3a008",
  stSweeper: "#f97316",
  stSos: "#dc2626",
  stSosDark: "#b91c1c",
  stInfo: "#2563eb",
  gold: "#c99612",
  goldBg: "#3a2f10",
  errBg: "#3a181c",
};

export const fontSizes = {
  display: 26,
  title: 20,
  h: 16,
  body: 14,
  sm: 12.5,
  xs: 11,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

// --shadow-card: 0 2px 10px rgba(18,33,43,.07)
export const shadowCard = {
  shadowColor: "#12212b",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
  elevation: 2,
} as const;
