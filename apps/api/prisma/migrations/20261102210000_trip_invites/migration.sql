-- INVITE (2 Nov 2026): link undangan trip, hanya dari leader, berlaku
-- sampai trip dimulai. Terpisah dari ShareLink (pantau read-only).
CREATE TABLE "TripInvite" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripInvite_token_key" ON "TripInvite"("token");
CREATE INDEX "TripInvite_tripId_idx" ON "TripInvite"("tripId");

ALTER TABLE "TripInvite" ADD CONSTRAINT "TripInvite_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripInvite" ADD CONSTRAINT "TripInvite_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
