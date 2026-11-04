-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "description" TEXT,
ADD COLUMN     "region" TEXT;

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mountain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "elevationM" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "difficultyKey" TEXT NOT NULL,

    CONSTRAINT "Mountain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MountainRoute" (
    "id" TEXT NOT NULL,
    "mountainId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meetingPoint" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "gainM" INTEGER NOT NULL,
    "estHours" DOUBLE PRECISION NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MountainRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityPost_communityId_createdAt_idx" ON "CommunityPost"("communityId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_createdAt_idx" ON "CommunityComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "MountainRoute_mountainId_idx" ON "MountainRoute"("mountainId");

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MountainRoute" ADD CONSTRAINT "MountainRoute_mountainId_fkey" FOREIGN KEY ("mountainId") REFERENCES "Mountain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
