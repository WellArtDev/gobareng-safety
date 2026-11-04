-- AI-R: laporan pasca-trip tersimpan (satu laporan aktif per trip).
CREATE TABLE "TripReport" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripReport_tripId_key" ON "TripReport"("tripId");
CREATE INDEX "TripReport_tripId_idx" ON "TripReport"("tripId");

ALTER TABLE "TripReport" ADD CONSTRAINT "TripReport_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
