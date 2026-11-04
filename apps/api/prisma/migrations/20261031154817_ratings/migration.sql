-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rating_organizerId_idx" ON "Rating"("organizerId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_tripId_raterId_key" ON "Rating"("tripId", "raterId");
