-- AlterTable
-- Growth-history demo field for Rute Populer "↑ N%": participants the
-- destination had last month. null = history unknown.
ALTER TABLE "Trip" ADD COLUMN "prevJoined" INTEGER;
