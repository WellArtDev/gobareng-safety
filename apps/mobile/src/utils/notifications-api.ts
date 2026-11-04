// Klien notifikasi in-app — GET /notifications (kontrak §9) + tandai
// dibaca. Dipakai layar Notifikasi untuk mengantar penerima SOS umum
// ke halaman detail (baris GENERAL_SOS_ALERT / GENERAL_SOS_CLOSED).
import { apiRequest } from "./api-client";

export interface AppNotification {
  id: string;
  userId: string;
  kind: string;
  tripId: string | null;
  refId: string | null;
  actorName: string | null;
  createdAt: string;
  readAt: string | null;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const data = await apiRequest<{ notifications: AppNotification[] }>("/notifications");
  return data.notifications;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiRequest(`/notifications/${id}/read`, { method: "PATCH" });
}
