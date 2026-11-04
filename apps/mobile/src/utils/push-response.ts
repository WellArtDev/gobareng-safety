// Ketuk notifikasi push trip-dimulai -> layar tracking trip itu.
// Pemicu tracking sedini mungkin untuk anggota (keputusan pemilik 3 Nov
// 2026 16:51 WIB: tracking sejak dari rumah, semua member).
//
// BATAS JUJUR: HP leader TIDAK BISA menyalakan GPS/tracking di HP
// anggota lain dari jauh. Yang bisa dilakukan server hanyalah memberi
// tahu (push + in-app); tracking anggota baru jalan saat anggota itu
// membuka app — ketukan notifikasi ini mengantarnya langsung ke layar
// tracking, tempat pengirim posisi foreground / background task #172
// sudah berjalan untuk trip ACTIVE.
//
// Modul ini sengaja tanpa impor React Native / expo apa pun (seperti
// push-tokens.ts): listener asli di-import DINAMIS di bawah supaya
// bun test tetap jalan dengan modul palsu.
export interface PushResponseNotificationsLike {
  addNotificationResponseReceivedListener(
    cb: (response: {
      notification: {
        request: { content: { data?: Record<string, unknown> | null } };
      };
    }) => void,
  ): { remove: () => void };
}

const realNotifications: PushResponseNotificationsLike = {
  addNotificationResponseReceivedListener: (cb) => {
    let sub: { remove: () => void } | undefined;
    void import("expo-notifications").then((mod) => {
      sub = mod.addNotificationResponseReceivedListener(cb);
    });
    return { remove: () => sub?.remove() };
  },
};

// Murni: type HARUS "TRIP_STARTED" (payload dari tripStartedPushPayload
// server), tripId string tak kosong, dan sesi HARUS ada — tanpa sesi,
// navigasi ke tracking akan dilempar AuthGate ke /login dan deep link
// hilang, jadi lebih baik diam (anggota bisa lewat notif in-app
// setelah login).
export function resolveTripStartedPushTarget(
  data: Record<string, unknown> | null | undefined,
  hasSession: boolean,
): string | null {
  if (!hasSession) return null;
  if (!data || data.type !== "TRIP_STARTED") return null;
  const tripId = data.tripId;
  if (typeof tripId !== "string" || tripId.length === 0) return null;
  return `/trips/${tripId}/tracking`;
}

export function handlePushResponse(
  data: Record<string, unknown> | null | undefined,
  hasSession: boolean,
  navigate: (path: string) => void,
): void {
  const target = resolveTripStartedPushTarget(data, hasSession);
  if (target) navigate(target);
}

let listenerAttached = false;

// Pasang sekali seumur hidup app (AuthGate memanggil tiap ganti rute;
// tanpa flag, tiap panggilan menambah listener -> navigasi ganda).
// Fail-soft: modul notifikasi yang gagal import tidak boleh merusak
// startup — listener dipasang best-effort saja.
export function setupTripStartedPushResponse(
  notifications: PushResponseNotificationsLike = realNotifications,
  hasSession: () => boolean,
  navigate: (path: string) => void,
): void {
  if (listenerAttached) return;
  listenerAttached = true;
  try {
    notifications.addNotificationResponseReceivedListener((response) => {
      try {
        handlePushResponse(
          response.notification.request.content.data,
          hasSession(),
          navigate,
        );
      } catch {
        // Fail-soft: ketukan notifikasi tidak boleh crash app.
      }
    });
  } catch {
    // Fail-soft: tanpa listener, push tetap tampil; anggota membuka
    // tracking manual dari detail trip.
  }
}
