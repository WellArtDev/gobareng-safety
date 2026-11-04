-- Start Trip otomatis Berangkat (keputusan pemilik 3 Nov 2026 16:51 WIB):
-- notifikasi in-app baru untuk semua anggota saat trip dimulai.
-- Hanya menambah nilai enum — tidak mengubah baris yang sudah ada.
ALTER TYPE "NotificationKind" ADD VALUE 'TRIP_STARTED';
