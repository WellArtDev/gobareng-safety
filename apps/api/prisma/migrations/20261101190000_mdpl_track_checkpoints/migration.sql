-- Track jalur (geometri MultiLineString versi shifted MDPL) + kolom
-- checkpoint pada RoutePost (pos MDPL: lat/lon shifted, elevasi, flag
-- auto_checkpoint/is_target). Kolom baru nullable/default supaya data
-- jalur admin lama tetap valid.
ALTER TABLE "MountainRoute" ADD COLUMN "track" JSONB;
ALTER TABLE "RoutePost" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "RoutePost" ADD COLUMN "lon" DOUBLE PRECISION;
ALTER TABLE "RoutePost" ADD COLUMN "elevationM" INTEGER;
ALTER TABLE "RoutePost" ADD COLUMN "autoCheckpoint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RoutePost" ADD COLUMN "isTarget" BOOLEAN NOT NULL DEFAULT false;
