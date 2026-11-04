-- Jalur: status aktif (aksi Nonaktifkan/Aktifkan) + daftar pos berurutan
-- dari basecamp sampai puncak (RoutePost, ikut terhapus via Cascade).
ALTER TABLE "MountainRoute" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "RoutePost" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "RoutePost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoutePost_routeId_order_idx" ON "RoutePost"("routeId", "order");

ALTER TABLE "RoutePost" ADD CONSTRAINT "RoutePost_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "MountainRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
