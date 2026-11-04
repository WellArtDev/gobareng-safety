-- Usulan gunung & jalur buatan user (antre persetujuan admin).
-- Baris katalog lama = MDPL (default), jadi seed hanya mengelola MDPL.
ALTER TABLE "Mountain" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MDPL';
ALTER TABLE "MountainRoute" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MDPL';
ALTER TABLE "RoutePost" ADD COLUMN "isGathering" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MountainProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "elevationM" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "MountainProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MountainProposal_userId_createdAt_idx" ON "MountainProposal"("userId", "createdAt");
CREATE INDEX "MountainProposal_status_createdAt_idx" ON "MountainProposal"("status", "createdAt");
ALTER TABLE "MountainProposal" ADD CONSTRAINT "MountainProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RouteProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mountainId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "RouteProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RouteProposal_userId_createdAt_idx" ON "RouteProposal"("userId", "createdAt");
CREATE INDEX "RouteProposal_status_createdAt_idx" ON "RouteProposal"("status", "createdAt");
ALTER TABLE "RouteProposal" ADD CONSTRAINT "RouteProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouteProposal" ADD CONSTRAINT "RouteProposal_mountainId_fkey" FOREIGN KEY ("mountainId") REFERENCES "Mountain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RouteProposalPost" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "isGathering" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "RouteProposalPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RouteProposalPost_proposalId_order_idx" ON "RouteProposalPost"("proposalId", "order");
ALTER TABLE "RouteProposalPost" ADD CONSTRAINT "RouteProposalPost_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "RouteProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
