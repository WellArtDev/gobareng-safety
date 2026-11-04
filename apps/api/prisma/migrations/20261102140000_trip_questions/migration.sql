-- AI-Q (2 Nov 2026): riwayat tanya-jawab member per trip.
CREATE TABLE "TripQuestion" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "notFound" BOOLEAN NOT NULL DEFAULT false,
    "sources" TEXT[] NOT NULL DEFAULT '{}',
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TripQuestion_tripId_createdAt_idx" ON "TripQuestion"("tripId", "createdAt");

ALTER TABLE "TripQuestion" ADD CONSTRAINT "TripQuestion_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripQuestion" ADD CONSTRAINT "TripQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
