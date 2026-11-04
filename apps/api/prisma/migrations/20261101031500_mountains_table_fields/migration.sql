-- Tabel Gunung (1 Nov 2026): provinsi, gambar, tipe vulkanik, status app,
-- deskripsi + koordinat — kolom sesuai struktur nama_gunung.json.
ALTER TABLE "Mountain" ADD COLUMN "province" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Mountain" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Mountain" ADD COLUMN "volcanoActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mountain" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Mountain" ADD COLUMN "description" TEXT;
ALTER TABLE "Mountain" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Mountain" ADD COLUMN "lon" DOUBLE PRECISION;
