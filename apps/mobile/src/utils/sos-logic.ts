// Logika SOS M2 — alasan kontekstual per tipe trip + auto-level,
// disalin dari sumber kebenaran server (apps/api/src/store.ts,
// kontrak §4). Jangan ubah tanpa menyamakan server.
import type { TripType } from "./trips-api";

export type SosReason =
  | "TERSESAT"
  | "CEDERA"
  | "MEDIS"
  | "LAINNYA"
  | "MOTOR_RUSAK"
  | "BENSIN_HABIS"
  | "BAN_BOCOR"
  | "KECELAKAAN";

export type SosLevel = "EMERGENCY" | "URGENT" | "HELP";

const REASONS_BY_TYPE: Record<TripType, SosReason[]> = {
  HIKING: ["TERSESAT", "CEDERA", "MEDIS", "LAINNYA"],
  TOURING: [
    "MOTOR_RUSAK",
    "BENSIN_HABIS",
    "BAN_BOCOR",
    "KECELAKAAN",
    "CEDERA",
    "MEDIS",
    "LAINNYA",
  ],
};

const LEVEL_BY_REASON: Record<SosReason, SosLevel> = {
  CEDERA: "EMERGENCY",
  KECELAKAAN: "EMERGENCY",
  MEDIS: "EMERGENCY",
  TERSESAT: "URGENT",
  MOTOR_RUSAK: "URGENT",
  BENSIN_HABIS: "HELP",
  BAN_BOCOR: "HELP",
  LAINNYA: "HELP",
};

export function reasonsForTripType(type: TripType): SosReason[] {
  return REASONS_BY_TYPE[type];
}

export function reasonLevel(reason: SosReason): SosLevel {
  return LEVEL_BY_REASON[reason];
}

export function reasonLabelKey(reason: SosReason): string {
  return `sos.reasons.${reason}`;
}

// SOS Umum (tanpa trip, untuk sehari-hari) — 9 template alasan yang
// dikunci Wella 2 Nov 2026, disalin dari sumber kebenaran server
// (apps/api/src/store.ts). Jangan ubah tanpa menyamakan server.
export type GeneralSosReason =
  | "KECELAKAAN_LALU_LINTAS"
  | "KENDARAAN_MOGOK"
  | "BAN_BOCOR_BENSIN_HABIS"
  | "KEJAHATAN"
  | "SAKIT_MENDADAK"
  | "BUTUH_AMBULANS"
  | "KEBAKARAN"
  | "BANJIR_POHON_TUMBANG"
  | "BUTUH_BANTUAN_SEGERA";

export const GENERAL_SOS_REASONS: GeneralSosReason[] = [
  "KECELAKAAN_LALU_LINTAS",
  "KENDARAAN_MOGOK",
  "BAN_BOCOR_BENSIN_HABIS",
  "KEJAHATAN",
  "SAKIT_MENDADAK",
  "BUTUH_AMBULANS",
  "KEBAKARAN",
  "BANJIR_POHON_TUMBANG",
  "BUTUH_BANTUAN_SEGERA",
];

const GENERAL_LEVEL_BY_REASON: Record<GeneralSosReason, SosLevel> = {
  KECELAKAAN_LALU_LINTAS: "EMERGENCY",
  SAKIT_MENDADAK: "EMERGENCY",
  BUTUH_AMBULANS: "EMERGENCY",
  KEBAKARAN: "EMERGENCY",
  KEJAHATAN: "URGENT",
  KENDARAAN_MOGOK: "URGENT",
  BANJIR_POHON_TUMBANG: "URGENT",
  BAN_BOCOR_BENSIN_HABIS: "HELP",
  BUTUH_BANTUAN_SEGERA: "HELP",
};

export function generalReasonLevel(reason: GeneralSosReason): SosLevel {
  return GENERAL_LEVEL_BY_REASON[reason];
}

export function generalReasonLabelKey(reason: GeneralSosReason): string {
  return `sos.general.reasons.${reason}`;
}
