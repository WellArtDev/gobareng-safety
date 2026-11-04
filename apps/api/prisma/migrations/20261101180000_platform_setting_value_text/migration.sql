-- Setting teks di Pengaturan dashboard (WhatsApp Brevo dkk):
-- nilai teks disimpan terpisah supaya baris toggle Boolean lama
-- tidak berubah maknanya; kosong = fallback ke env VPS.
ALTER TABLE "PlatformSetting" ADD COLUMN "valueText" TEXT;
