-- Tabel Member: kolom negara (kode ISO alpha-2, nullable) untuk go
-- international; di dashboard tampil sebagai ikon bendera saja.
ALTER TABLE "User" ADD COLUMN "country" TEXT;
