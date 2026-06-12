-- CreateEnum
CREATE TYPE "AiUsageStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AiFeedback" AS ENUM ('POSITIVE', 'NEGATIVE');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "aiMonthlyCredits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiHistoryContext" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiTermsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "aiTermsAcceptedByUserId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT,
    "noteId" TEXT,
    "patientId" TEXT,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "status" "AiUsageStatus" NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "feedback" "AiFeedback",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_clinicId_createdAt_idx" ON "AiUsage"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_clinicId_userId_createdAt_idx" ON "AiUsage"("clinicId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_noteId_idx" ON "AiUsage"("noteId");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

