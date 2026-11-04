// Klien profil publik — GET /users/:slug/profile (endpoint baru,
// 31 Okt 2026). Hanya data yang boleh publik: nama, verified, statistik
// agregat, riwayat trip selesai.
import { apiRequest } from "./api-client";
import { ApiError } from "./auth-api";
import type { TripType } from "./trips-api";

export interface PublicProfile {
  id: string;
  name: string;
  slug: string;
  isVerified: boolean;
  stats: { totalTrips: number; finishedTrips: number };
  finishedTrips: Array<{
    id: string;
    name: string;
    type: TripType;
    date: string;
  }>;
}

export async function fetchPublicProfile(slug: string): Promise<PublicProfile> {
  try {
    const data = await apiRequest<{ profile: PublicProfile }>(
      `/users/${slug}/profile`,
    );
    return data.profile;
  } catch (error) {
    if (error instanceof ApiError && error.code === "USER_NOT_FOUND") {
      throw new ApiError("publicProfile.errors.notFound", error.code);
    }
    throw error;
  }
}
