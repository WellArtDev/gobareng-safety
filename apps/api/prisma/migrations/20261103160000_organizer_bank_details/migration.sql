-- Rekening organizer untuk trip berbayar: satu paket di level User,
-- dipakai ulang lintas trip. Kolom nullable: organizer tanpa trip
-- berbayar tidak wajib mengisi.
ALTER TABLE "User" ADD COLUMN "bankName" TEXT;
ALTER TABLE "User" ADD COLUMN "bankAccountNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "bankAccountHolder" TEXT;
