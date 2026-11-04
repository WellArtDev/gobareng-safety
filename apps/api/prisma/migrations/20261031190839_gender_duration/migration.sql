-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "durationDays" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gender" "Gender";
