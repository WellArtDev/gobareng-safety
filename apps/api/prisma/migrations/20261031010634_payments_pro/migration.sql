-- CreateEnum
CREATE TYPE "UpgradeStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TripPaymentStatus" AS ENUM ('WAITING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "price" INTEGER;

-- CreateTable
CREATE TABLE "UpgradeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "UpgradeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,

    CONSTRAINT "UpgradeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPayment" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "TripPaymentStatus" NOT NULL DEFAULT 'WAITING',
    "proofNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "TripPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UpgradeRequest_userId_idx" ON "UpgradeRequest"("userId");

-- CreateIndex
CREATE INDEX "UpgradeRequest_status_createdAt_idx" ON "UpgradeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TripPayment_status_idx" ON "TripPayment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TripPayment_tripId_userId_key" ON "TripPayment"("tripId", "userId");

-- AddForeignKey
ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPayment" ADD CONSTRAINT "TripPayment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPayment" ADD CONSTRAINT "TripPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
