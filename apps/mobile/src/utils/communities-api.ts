// Klien komunitas — kontrak §12: daftar komunitas, detail, gabung/
// keluar, dan feed diskusi. Sumber kebenaran = DB server; tidak ada
// lagi data contoh di klien (CLUBS hardcode dihapus 3 Nov 2026).
import { apiRequest } from "./api-client";
import { ApiError } from "./auth-api";

export interface CommunitySummary {
  id: string;
  name: string;
  memberCount: number;
}

export interface CommunityMember {
  userId: string;
  name: string;
  slug: string;
}

export interface CommunityDetail {
  id: string;
  name: string;
  description: string | null;
  region: string | null;
  memberCount: number;
  members: CommunityMember[];
}

export interface CommunityFeedPost {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  commentCount: number;
  createdAt: string;
}

export async function fetchCommunities(): Promise<CommunitySummary[]> {
  const data = await apiRequest<{ communities: CommunitySummary[] }>(
    "/communities",
  );
  return data.communities;
}

export async function fetchCommunity(
  id: string,
): Promise<CommunityDetail | null> {
  try {
    const data = await apiRequest<{ community: CommunityDetail }>(
      `/communities/${id}`,
    );
    return data.community;
  } catch (error) {
    // 404 = komunitas memang tidak ada; gagal lain dilempar supaya
    // layar bisa menampilkan error jujur, bukan "tidak ditemukan".
    if (error instanceof ApiError && error.code === "NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

export async function joinCommunity(id: string): Promise<boolean> {
  const data = await apiRequest<{ joined: boolean }>(
    `/communities/${id}/join`,
    { method: "POST" },
  );
  return data.joined;
}

export async function leaveCommunity(id: string): Promise<boolean> {
  const data = await apiRequest<{ left: boolean }>(
    `/communities/${id}/leave`,
    { method: "POST" },
  );
  return data.left;
}

export async function fetchCommunityFeed(
  id: string,
): Promise<CommunityFeedPost[]> {
  const data = await apiRequest<{ posts: CommunityFeedPost[] }>(
    `/communities/${id}/feed`,
  );
  return data.posts;
}
