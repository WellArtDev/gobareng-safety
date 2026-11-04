-- Tautan rute trip hiking (3 Nov 2026): gunung + jalur yang dipilih
-- di wizard, disimpan di trip baru. Kolom nullable: touring dan trip
-- hiking lama tetap tanpa tautan. Hapus gunung/jalur dari katalog
-- tidak menghapus trip — tautan jadi null (SET NULL).
ALTER TABLE "Trip" ADD COLUMN "mountainId" TEXT;
ALTER TABLE "Trip" ADD COLUMN "routeId" TEXT;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_mountainId_fkey" FOREIGN KEY ("mountainId") REFERENCES "Mountain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "MountainRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
