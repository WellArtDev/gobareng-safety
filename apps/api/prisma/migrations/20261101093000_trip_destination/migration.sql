-- Touring: tujuan trip (dipilih lewat peta + search di wizard touring).
ALTER TABLE "Trip" ADD COLUMN "destination" TEXT;
ALTER TABLE "Trip" ADD COLUMN "destinationLat" DOUBLE PRECISION;
ALTER TABLE "Trip" ADD COLUMN "destinationLon" DOUBLE PRECISION;
