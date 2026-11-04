// Gate modul AI (infrastruktur toggle Pengaturan, Wella 2 Nov 2026).
//
// CARA PAKAI (wajib saat rebase PR AI): tiap handler endpoint AI
// memanggil requireAiModule DI AWAL — setelah auth, sebelum kerja
// apa pun — dengan kunci modulnya sendiri:
//   requireAiModule(await db.platformSettings(), "aiV"); // SOS suara
// Modul yang dimatikan admin menolak dengan 403 AI_MODULE_DISABLED,
// TANPA fallback diam-diam dan tanpa jawaban karangan.
//
// BATAS PR INI: file ini hanya infrastruktur. Keenam endpoint AI
// masih di PR terpisah (#137, #142, #140, #133, #136, #132) yang
// BELUM merge — endpoint-endpoint itu BELUM ter-gate sampai rebase
// masing-masing menambahkan satu baris requireAiModule di atas.
import { forbidden } from "./errors.js";
import type { PlatformSettings } from "./db.js";

// Kunci = kolom PlatformSetting; label = nama modul di kartu Pengaturan.
export type AiModuleKey = "aiV" | "aiP" | "aiL" | "aiQ" | "aiR" | "aiG";

export const AI_MODULES: { key: AiModuleKey; label: string }[] = [
  { key: "aiV", label: "SOS Suara" },
  { key: "aiP", label: "SOS Foto" },
  { key: "aiL", label: "Agen Leader" },
  { key: "aiQ", label: "Q&A Member" },
  { key: "aiR", label: "Laporan Trip" },
  { key: "aiG", label: "Glimmer" },
];

// Flag yang belum tersimpan (mis. DB lama sebelum kunci ini ada)
// dianggap NYALA, sesuai default ON di PLATFORM_SETTING_DEFAULTS.
export function aiModuleEnabled(
  settings: Partial<Pick<PlatformSettings, AiModuleKey>>,
  key: AiModuleKey,
): boolean {
  return settings[key] !== false;
}

export function requireAiModule(
  settings: Partial<Pick<PlatformSettings, AiModuleKey>>,
  key: AiModuleKey,
): void {
  if (!aiModuleEnabled(settings, key)) {
    throw forbidden("AI_MODULE_DISABLED");
  }
}
