// Klien undangan trip (INVITE 2 Nov 2026) — BERBEDA dari share-link:
// undangan membuat orang jadi anggota trip, bukan sekadar memantau.
// Hanya leader trip yang boleh membuat/melihat/mencabut (server
// menolak anggota lain + admin). Link berlaku sampai trip dimulai.
// Kuota dihitung dari MEMBER YANG SUDAH JOIN, bukan jumlah link.
import { apiRequest } from "./api-client";
import { webBaseUrl } from "./config";

export interface TripInvite {
  id: string;
  tripId: string;
  label: string;
  token: string;
  createdBy: string;
  revokedAt: string | null;
}

export async function createTripInvite(
  tripId: string,
  label: string,
): Promise<TripInvite> {
  const data = await apiRequest<{ invite: TripInvite }>(
    `/trip-groups/${tripId}/invites`,
    { method: "POST", body: { label } },
  );
  return data.invite;
}

export async function fetchTripInvites(tripId: string): Promise<TripInvite[]> {
  const data = await apiRequest<{ invites: TripInvite[] }>(
    `/trip-groups/${tripId}/invites`,
  );
  return data.invites;
}

export async function revokeTripInvite(
  tripId: string,
  inviteId: string,
): Promise<void> {
  await apiRequest(`/trip-groups/${tripId}/invites/${inviteId}`, {
    method: "DELETE",
  });
}

export async function updateTripQuota(
  tripId: string,
  quota: number,
): Promise<void> {
  await apiRequest(`/trip-groups/${tripId}/quota`, {
    method: "PATCH",
    body: { quota },
  });
}

// URL landing web undangan (publik) untuk dibagikan.
export function inviteUrlForToken(token: string): string {
  return `${webBaseUrl()}/undang/${token}`;
}

// Kuota penuh = anggota sudah join >= kuota. Kuota null = tanpa batas
// (tidak pernah penuh). Dipakai untuk menonaktifkan tombol Undang
// Anggota (lapis UI; server tetap menolak join via undangan saat penuh).
export function isQuotaFull(
  quota: number | null | undefined,
  memberCount: number,
): boolean {
  if (quota === null || quota === undefined) return false;
  return memberCount >= quota;
}

// Validasi klien untuk ubah kuota (server memvalidasi ulang):
// bilangan bulat, minimal 2, dan minimal = jumlah anggota saat ini.
// Mengembalikan kunci error i18n atau null bila valid.
export function validateQuotaChange(
  raw: string,
  memberCount: number,
): string | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return "invite.quotaInvalid";
  const value = Number(trimmed);
  if (value < 2) return "invite.quotaTooSmall";
  if (value < memberCount) return "invite.quotaBelowMembers";
  return null;
}

// HP pengguna kosong (null/kosong/spasi saja) -> form buat trip wajib
// mengarahkan ke Isi Data Profil; penegakan utama tetap di API.
export function isPhoneMissing(phone: string | null | undefined): boolean {
  return !phone || phone.trim().length === 0;
}
