-- Magic link juri tanpa OTP (3 Nov 2026, tenggat pengumuman 10 Nov 2026
-- 23:59 WIB = 2026-11-10 16:59:59 UTC — literal tanpa zona, Prisma
-- membaca TIMESTAMP sebagai UTC, sama seperti nilai Date di kode).
-- Hanya HASH sha256 token yang disimpan di sini — nilai asli tautan
-- tidak ada di repo ini, hanya di laporan serah terima ke pemilik.
-- Tautan dapat dipakai berulang sampai tenggat; sesi/refresh yang
-- diterbitkan dari tautan ikut mati di tenggat (lihat magic-link.ts).
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");
CREATE INDEX "MagicLinkToken_userId_createdAt_idx" ON "MagicLinkToken"("userId", "createdAt");

ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dua akun juri (admin). Sengaja TIDAK membuat baris OrganizerVerification:
-- akun juri bukan pendaftar PRO, jadi tidak mengotori antrean organizer.
-- emailVerifiedAt/phoneVerifiedAt/accountVerifiedAt diisi supaya gate SOS
-- (isVerified ATAU accountVerifiedAt) lolos; isVerified organizer tetap
-- false — jalur verifikasi organizer tidak tersentuh. Akun-akun ini
-- tidak punya mailbox yang bisa menerima OTP, jadi praktisnya hanya
-- bisa login lewat magic link (OTP ke alamat ini tidak akan sampai).
INSERT INTO "User" ("id", "email", "name", "slug", "isAdmin", "role", "isVerified", "emailVerifiedAt", "phoneVerifiedAt", "accountVerifiedAt")
VALUES ('96e21f25-3e2a-4eb3-bcfa-5d83d3a1c3b5', 'juri@gobareng.app', 'Juri', 'juri', true, 'admin', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "User" ("id", "email", "name", "slug", "isAdmin", "role", "isVerified", "emailVerifiedAt", "phoneVerifiedAt", "accountVerifiedAt")
VALUES ('2b55c282-3e27-4c56-b041-686c52a3b5df', 'demo-juri@gobareng.app', 'Demo Juri', 'demo-juri', true, 'admin', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "MagicLinkToken" ("id", "userId", "label", "tokenHash", "expiresAt")
SELECT '3f46a3f5-5c99-4e72-82d4-038ca2d793d7', u."id", 'juri', '6513a079b11d91df89ee929360bf031f6bb9213adeb5bcb694fa237b8b2162d4', TIMESTAMP '2026-11-10 16:59:59'
FROM "User" u WHERE u."email" = 'juri@gobareng.app'
AND NOT EXISTS (SELECT 1 FROM "MagicLinkToken" t WHERE t."tokenHash" = '6513a079b11d91df89ee929360bf031f6bb9213adeb5bcb694fa237b8b2162d4');

INSERT INTO "MagicLinkToken" ("id", "userId", "label", "tokenHash", "expiresAt")
SELECT '01273847-c90a-4d8b-a4a9-0d9e46ca640a', u."id", 'demo-juri', '480f45a6eb9ea1d91053abbfe15d86e4cfec71e448c30e375c8109382ef38452', TIMESTAMP '2026-11-10 16:59:59'
FROM "User" u WHERE u."email" = 'demo-juri@gobareng.app'
AND NOT EXISTS (SELECT 1 FROM "MagicLinkToken" t WHERE t."tokenHash" = '480f45a6eb9ea1d91053abbfe15d86e4cfec71e448c30e375c8109382ef38452');
