-- AI-G Glimmer: antrean offline asisten (ingest idempotent per pengguna).
CREATE TABLE "AiGlimmerMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "answer" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "AiGlimmerMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiGlimmerMessage_userId_clientMessageId_key" ON "AiGlimmerMessage"("userId", "clientMessageId");
CREATE INDEX "AiGlimmerMessage_userId_createdAt_idx" ON "AiGlimmerMessage"("userId", "createdAt");

ALTER TABLE "AiGlimmerMessage" ADD CONSTRAINT "AiGlimmerMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
