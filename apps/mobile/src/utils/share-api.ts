// Klien share-link — kontrak §16: tautan pantau read-only bertoken.
// Tampilan publik (/shared-trips/:token) tanpa auth; buat/daftar/cabut
// butuh member. URL pantau untuk dibagikan: {webBase}/pantau/{token}
// (landing web, BUKAN api base — alamat lama api-base tidak pernah
// jalan dan dibiarkan mati, tanpa redirect, per keputusan 2 Nov 2026).
import { apiRequest } from "./api-client";
import { ApiError } from "./auth-api";
import { webBaseUrl } from "./config";
import type { PublicUser } from "./auth-api";
import type { Location, SosAlert } from "./locations-api";
import type { TripRole, TripStatus, TripType } from "./trips-api";

export type ShareScope = "EMERGENCY_CONTACT" | "ANYONE";

export interface ShareLink {
  id: string;
  tripId: string;
  label: string;
  scope: ShareScope;
  token: string;
  createdBy: string;
}

export interface SharedPosition {
  userId: string;
  role: TripRole;
  user: PublicUser;
  location: Location | null;
}

export interface SharedTripView {
  trip: { id: string; name: string; type: TripType; status: TripStatus };
  scope: ShareScope;
  locations: Location[];
  positions: SharedPosition[];
  activeSos: SosAlert[];
  status: "SAFE" | "SOS_ACTIVE";
}

export async function createShareLink(
  tripId: string,
  label: string,
  scope: ShareScope,
): Promise<ShareLink> {
  const data = await apiRequest<{ shareLink: ShareLink }>(
    `/trip-groups/${tripId}/share-links`,
    { method: "POST", body: { label, scope } },
  );
  return data.shareLink;
}

export async function fetchShareLinks(tripId: string): Promise<ShareLink[]> {
  const data = await apiRequest<{ shareLinks: ShareLink[] }>(
    `/trip-groups/${tripId}/share-links`,
  );
  return data.shareLinks;
}

export async function revokeShareLink(
  tripId: string,
  linkId: string,
): Promise<void> {
  await apiRequest(`/trip-groups/${tripId}/share-links/${linkId}`, {
    method: "DELETE",
  });
}

export async function fetchSharedTrip(token: string): Promise<SharedTripView> {
  try {
    return await apiRequest<SharedTripView>(`/shared-trips/${token}`);
  } catch (error) {
    if (error instanceof ApiError && error.code === "SHARE_LINK_NOT_FOUND") {
      throw new ApiError("share.errors.linkGone", error.code);
    }
    throw error;
  }
}

// URL landing web pantau (publik, read-only) untuk dibagikan.
export function watchUrlForToken(token: string): string {
  return `${webBaseUrl()}/pantau/${token}`;
}

// Tautan berbagi WhatsApp (dipakai layar Bagikan + layar Invite):
// teks + URL di-encode sebagai satu pesan wa.me.
export function waShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
