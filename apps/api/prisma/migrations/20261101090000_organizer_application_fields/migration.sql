-- Pengajuan organizer: nama organizer, alamat, dan file KTP privat
-- (nama file saja; file-nya di folder privat di luar /uploads publik).
ALTER TABLE "OrganizerVerification" ADD COLUMN "organizerName" TEXT;
ALTER TABLE "OrganizerVerification" ADD COLUMN "address" TEXT;
ALTER TABLE "OrganizerVerification" ADD COLUMN "identityDocumentFilename" TEXT;
