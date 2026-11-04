-- CreateEnum
CREATE TYPE "SosPhotoKind" AS ENUM ('TRIP', 'GENERAL');

-- CreateEnum
CREATE TYPE "SosPhotoAiStatus" AS ENUM ('PENDING', 'AVAILABLE', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "SosPhoto" (
    "id" TEXT NOT NULL,
    "kind" "SosPhotoKind" NOT NULL,
    "sosId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "photoFilename" TEXT NOT NULL,
    "aiDescription" TEXT,
    "aiModel" TEXT,
    "aiStatus" "SosPhotoAiStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SosPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SosPhoto_kind_sosId_idx" ON "SosPhoto"("kind", "sosId");

-- CreateIndex
CREATE INDEX "SosPhoto_senderId_idx" ON "SosPhoto"("senderId");
