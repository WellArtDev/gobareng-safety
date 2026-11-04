-- CreateEnum
CREATE TYPE "OrganizerVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "OrganizerVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT,
    "organizerType" "TripType",
    "region" TEXT,
    "avatarUrl" TEXT,
    "identityDocumentComplete" BOOLEAN NOT NULL DEFAULT false,
    "profileComplete" BOOLEAN NOT NULL DEFAULT false,
    "status" "OrganizerVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "OrganizerVerification_pkey" PRIMARY KEY ("id")
);

-- Backfill one minimal application for every account already in the queue.
INSERT INTO "OrganizerVerification" (
    "id",
    "userId",
    "status",
    "submittedAt"
)
SELECT
    CONCAT('verification-', "id"),
    "id",
    'PENDING'::"OrganizerVerificationStatus",
    CURRENT_TIMESTAMP
FROM "User"
WHERE "role" = 'user'
  AND "isVerified" = false
  AND "verificationRejectedAt" IS NULL;

-- The API also reconciles this predicate before every admin queue read.
-- That closes the rolling-deploy window where an older app instance could
-- register a user after this one-time snapshot but before dual-write is live.

-- CreateIndex
CREATE INDEX "OrganizerVerification_status_submittedAt_idx"
ON "OrganizerVerification"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "OrganizerVerification_userId_idx"
ON "OrganizerVerification"("userId");

-- Only one active application may exist for a user; historical decisions remain.
CREATE UNIQUE INDEX "OrganizerVerification_one_pending_per_user_idx"
ON "OrganizerVerification"("userId")
WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "OrganizerVerification"
ADD CONSTRAINT "OrganizerVerification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerVerification"
ADD CONSTRAINT "OrganizerVerification_tripId_fkey"
FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerVerification"
ADD CONSTRAINT "OrganizerVerification_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
