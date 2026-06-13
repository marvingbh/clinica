-- CreateEnum
CREATE TYPE "ScaleAdministrationSource" AS ENUM ('LINK_PACIENTE', 'EM_SESSAO');

-- CreateEnum
CREATE TYPE "ScaleAdministrationStatus" AS ENUM ('ENVIADA', 'CONCLUIDA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "ScaleCadenceType" AS ENUM ('ANTES_DE_SESSAO', 'A_CADA_N_SEMANAS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SCALE_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'SCALE_RISK_ALERT';

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "scaleRiskMessage" TEXT;

-- CreateTable
CREATE TABLE "ScaleAdministration" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "appointmentId" TEXT,
    "scaleCode" TEXT NOT NULL,
    "scaleVersion" INTEGER NOT NULL DEFAULT 1,
    "source" "ScaleAdministrationSource" NOT NULL,
    "status" "ScaleAdministrationStatus" NOT NULL DEFAULT 'ENVIADA',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "totalScore" INTEGER,
    "severityLabel" TEXT,
    "riskFlag" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScaleAdministration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScaleSchedule" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "scaleCode" TEXT NOT NULL,
    "cadenceType" "ScaleCadenceType" NOT NULL,
    "intervalWeeks" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pausedReason" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScaleSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScaleAdministration_tokenHash_key" ON "ScaleAdministration"("tokenHash");

-- CreateIndex
CREATE INDEX "ScaleAdministration_clinicId_idx" ON "ScaleAdministration"("clinicId");

-- CreateIndex
CREATE INDEX "ScaleAdministration_patientId_scaleCode_completedAt_idx" ON "ScaleAdministration"("patientId", "scaleCode", "completedAt");

-- CreateIndex
CREATE INDEX "ScaleAdministration_clinicId_status_idx" ON "ScaleAdministration"("clinicId", "status");

-- CreateIndex
CREATE INDEX "ScaleAdministration_professionalProfileId_idx" ON "ScaleAdministration"("professionalProfileId");

-- CreateIndex
CREATE INDEX "ScaleAdministration_scheduleId_idx" ON "ScaleAdministration"("scheduleId");

-- CreateIndex
CREATE INDEX "ScaleAdministration_appointmentId_idx" ON "ScaleAdministration"("appointmentId");

-- CreateIndex
CREATE INDEX "ScaleAdministration_clinicId_riskFlag_idx" ON "ScaleAdministration"("clinicId", "riskFlag");

-- CreateIndex
CREATE INDEX "ScaleSchedule_clinicId_active_idx" ON "ScaleSchedule"("clinicId", "active");

-- CreateIndex
CREATE INDEX "ScaleSchedule_patientId_idx" ON "ScaleSchedule"("patientId");

-- CreateIndex
CREATE INDEX "ScaleSchedule_professionalProfileId_idx" ON "ScaleSchedule"("professionalProfileId");

-- AddForeignKey
ALTER TABLE "ScaleAdministration" ADD CONSTRAINT "ScaleAdministration_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleAdministration" ADD CONSTRAINT "ScaleAdministration_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleAdministration" ADD CONSTRAINT "ScaleAdministration_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleAdministration" ADD CONSTRAINT "ScaleAdministration_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScaleSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleAdministration" ADD CONSTRAINT "ScaleAdministration_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleSchedule" ADD CONSTRAINT "ScaleSchedule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleSchedule" ADD CONSTRAINT "ScaleSchedule_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleSchedule" ADD CONSTRAINT "ScaleSchedule_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Partial unique: at most one ACTIVE schedule per (patient, scale).
-- Prisma DSL can't express partial uniques (same pattern as Todo's idempotency
-- index), so it lives only here in the migration SQL.
CREATE UNIQUE INDEX "ScaleSchedule_patient_scale_active_uniq"
  ON "ScaleSchedule"("patientId", "scaleCode") WHERE "active" = true;
