-- CreateEnum
CREATE TYPE "WaRecipientKind" AS ENUM ('EMERGENCY_CONTACT', 'LEADER', 'BYSTANDER');

-- CreateEnum
CREATE TYPE "WaSendStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED_UNCONFIGURED');

-- CreateTable
CREATE TABLE "WaDispatchLog" (
    "id" TEXT NOT NULL,
    "sosId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "recipient" "WaRecipientKind" NOT NULL,
    "status" "WaSendStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaDispatchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaDispatchLog_sosId_idx" ON "WaDispatchLog"("sosId");

-- CreateIndex
CREATE INDEX "WaDispatchLog_status_createdAt_idx" ON "WaDispatchLog"("status", "createdAt");
