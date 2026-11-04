-- Impor katalog (1 Nov 2026): statistik jalur boleh null — impor dari
-- nama_gunung.json hanya punya nama jalur, tanpa jarak/gain/durasi.
-- Null = tidak diketahui, bukan 0.
ALTER TABLE "MountainRoute" ALTER COLUMN "distanceKm" DROP NOT NULL;
ALTER TABLE "MountainRoute" ALTER COLUMN "gainM" DROP NOT NULL;
ALTER TABLE "MountainRoute" ALTER COLUMN "estHours" DROP NOT NULL;
