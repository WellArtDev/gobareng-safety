-- Ganti-email OTP + bersih-bersih hash password lama (PR ini):
-- kolom passwordHash menjadi nullable, lalu SATU UPDATE atomik
-- menol-kan SEMUA nilai hash yang tersisa. Hanya kolom ini yang
-- diubah — tidak ada akun, sesi (refresh token), atau data lain
-- yang disentuh. Setelah migrasi ini, tidak ada kode yang menulis
-- passwordHash lagi (semua pembuat akun mengisi null).
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

UPDATE "User" SET "passwordHash" = NULL WHERE "passwordHash" IS NOT NULL;
