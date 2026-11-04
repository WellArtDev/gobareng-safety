// Klien pembayaran — upgrade Pro (QRIS + verifikasi manual admin) dan
// tagihan trip berbayar (transfer manual, konfirmasi organizer).
import { apiRequest } from "./api-client";
import { ApiError } from "./auth-api";
import { apiBaseUrl } from "./config";

export type UpgradeRequestStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface UpgradeRequest {
  id: string;
  status: UpgradeRequestStatus;
  amount: number;
}

export interface UpgradeStatus {
  isPro: boolean;
  price: number;
  request: UpgradeRequest | null;
  /** URL gambar QRIS aktif dari dashboard (null/kosong = belum diunggah). */
  proQrisUrl?: string | null;
}

export type TripPaymentStatus = "WAITING" | "CONFIRMED" | "REJECTED";

export interface TripPayment {
  id: string;
  status: TripPaymentStatus;
  amount: number;
}

// Rekening organizer (PR rekening-organizer): hanya dikirim server ke
// member trip berbayar yang sudah gabung, lewat payments/me. Null =
// organizer belum mengisi (trip berbayar lama) -> paid-join menampilkan
// state jujur, bukan kosong dan bukan nomor palsu.
export interface OrganizerBankDetails {
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
}

export interface MyTripPayment {
  payment: TripPayment;
  organizerBank: OrganizerBankDetails | null;
}

export async function fetchUpgradeStatus(): Promise<UpgradeStatus> {
  return apiRequest<UpgradeStatus>("/auth/me/upgrade");
}

// URL gambar QRIS dari API berbentuk path relatif (/uploads/qris/*)
// karena disajikan host API yang sama; layar upgrade butuh URI absolut
// untuk <Image>. URL absolut diteruskan apa adanya.
export function resolveProQrisUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${apiBaseUrl()}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function requestUpgrade(): Promise<UpgradeRequest> {
  try {
    const data = await apiRequest<{ request: UpgradeRequest }>(
      "/auth/me/upgrade",
      { method: "POST", body: {} },
    );
    return data.request;
  } catch (error) {
    if (error instanceof ApiError && error.code === "UPGRADE_ALREADY_PENDING") {
      throw new ApiError("upgrade.errors.alreadyPending", error.code);
    }
    if (error instanceof ApiError && error.code === "ALREADY_PRO") {
      throw new ApiError("upgrade.errors.alreadyPro", error.code);
    }
    throw error;
  }
}

// null = tidak ada tagihan (trip gratis, atau pengguna adalah leader).
export async function fetchMyTripPayment(
  tripId: string,
): Promise<MyTripPayment | null> {
  try {
    const data = await apiRequest<{
      payment: TripPayment;
      organizerBank: OrganizerBankDetails | null;
    }>(`/trip-groups/${tripId}/payments/me`);
    return { payment: data.payment, organizerBank: data.organizerBank ?? null };
  } catch (error) {
    if (error instanceof ApiError && error.code === "PAYMENT_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}
