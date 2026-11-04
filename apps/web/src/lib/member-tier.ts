// Tier akun member untuk kolom Status di tabel manajemen Member.
// Sumber: PRD tier organizer — Unverified (belum verifikasi),
// Verified (verifikasi organizer disetujui, gratis), Pro (upgrade
// berbayar terverifikasi, PAY). Pro adalah tier tertinggi.
export type MemberTier = "unverified" | "verified" | "pro";

export function getMemberTier(
  isVerified: boolean,
  isPro: boolean,
): MemberTier {
  if (isPro) return "pro";
  if (isVerified) return "verified";
  return "unverified";
}
