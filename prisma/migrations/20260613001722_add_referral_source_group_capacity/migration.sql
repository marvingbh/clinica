-- CreateEnum
CREATE TYPE "ReferralSource" AS ENUM ('INDICACAO', 'INSTAGRAM', 'GOOGLE', 'SITE', 'CONVENIO', 'OUTRO');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "referralSource" "ReferralSource",
ADD COLUMN     "referralSourceDetail" TEXT;

-- AlterTable
ALTER TABLE "IntakeSubmission" ADD COLUMN     "referralSource" "ReferralSource",
ADD COLUMN     "referralSourceDetail" TEXT;

-- AlterTable
ALTER TABLE "TherapyGroup" ADD COLUMN     "capacity" INTEGER;

-- CreateIndex
CREATE INDEX "Patient_clinicId_createdAt_idx" ON "Patient"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "Patient_clinicId_referralSource_idx" ON "Patient"("clinicId", "referralSource");

