// Klien API Glimmer — di atas apiRequest (token + refresh otomatis,
// fail-soft jaringan mati = ApiError "errors.unavailable").
// POST 2xx = server sudah menyimpan + menjawab; selain itu klien TIDAK
// menghapus item dari antrean tertunda (aturan M7).
import { apiRequest } from "./api-client";
import type { GlimmerPriority } from "./glimmer-queue";

export interface GlimmerServerMessage {
  id: string;
  userId: string;
  clientMessageId: string;
  message: string;
  priority: GlimmerPriority;
  answer: string | null;
  model: string | null;
  createdAt: string;
  answeredAt: string | null;
}

export async function sendGlimmerMessage(input: {
  clientMessageId: string;
  message: string;
  priority: GlimmerPriority;
}): Promise<GlimmerServerMessage> {
  return apiRequest<GlimmerServerMessage>("/ai/glimmer", {
    method: "POST",
    body: input,
  });
}

export async function fetchGlimmerMessages(): Promise<GlimmerServerMessage[]> {
  const res = await apiRequest<{ items: GlimmerServerMessage[] }>(
    "/ai/glimmer",
  );
  return res.items;
}
