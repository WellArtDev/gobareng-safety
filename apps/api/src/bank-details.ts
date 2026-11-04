// Rekening organizer untuk trip berbayar — validasi satu paket.
// Rekening dipakai ulang lintas trip dan hanya dibaca lewat jalur
// khusus (bankDetailsOf / GET /auth/me/bank-details); sengaja TIDAK
// masuk mapUser/publicUser supaya tidak bocor ke daftar member maupun
// profil publik.
export interface BankDetails {
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
}

/** Spasi/dash di nomor rekening diabaikan (input "123 456-7890" sah). */
export function normalizeAccountNumber(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/** Nomor rekening: hanya digit, 6–20 digit setelah normalisasi. */
export function isValidAccountNumber(raw: string): boolean {
  return /^\d{6,20}$/.test(normalizeAccountNumber(raw));
}

export type BankUpdate =
  | { kind: "absent" }
  | { kind: "clear" }
  | { kind: "set"; details: BankDetails }
  | { kind: "invalid" };

const KEYS = ["bankName", "bankAccountNumber", "bankAccountHolder"] as const;

/**
 * Parse field rekening dari body PATCH /me.
 * - Tidak ada kunci rekening sama sekali -> absent (rekening tak berubah).
 * - Kunci tidak lengkap, atau nilai bukan string tak-kosong, atau nomor
 *   tak valid -> invalid (400 INVALID_PAYLOAD).
 * - Ketiganya null/kosong -> clear (hapus rekening).
 * - Ketiganya terisi valid -> set.
 */
export function parseBankUpdate(body: Record<string, unknown>): BankUpdate {
  const present = KEYS.filter((k) => body[k] !== undefined);
  if (present.length === 0) return { kind: "absent" };
  if (present.length !== KEYS.length) return { kind: "invalid" };
  const values = KEYS.map((k) => body[k]);
  if (
    values.every(
      (v) => v === null || (typeof v === "string" && v.trim() === ""),
    )
  ) {
    return { kind: "clear" };
  }
  if (!values.every((v) => typeof v === "string" && v.trim() !== "")) {
    return { kind: "invalid" };
  }
  const [bankName, rawNumber, bankAccountHolder] = values as string[];
  if (!isValidAccountNumber(rawNumber)) return { kind: "invalid" };
  return {
    kind: "set",
    details: {
      bankName: bankName.trim(),
      bankAccountNumber: normalizeAccountNumber(rawNumber),
      bankAccountHolder: bankAccountHolder.trim(),
    },
  };
}
