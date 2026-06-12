-- CreateEnum
CREATE TYPE "WaitlistEntryStatus" AS ENUM ('ATIVA', 'OFERTADA', 'CONVERTIDA', 'REMOVIDA');

-- CreateEnum
CREATE TYPE "WaitlistOfferStatus" AS ENUM ('ENVIADA', 'ACEITA', 'EXPIRADA', 'RECUSADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WAITLIST_OFFER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WAITLIST_OFFER_EXPIRED';

-- AlterTable
-- IF NOT EXISTS: a sibling feature may add this same column in its own migration.
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "waitlistSettings" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT,
    "leadName" TEXT,
    "leadPhone" TEXT,
    "leadEmail" TEXT,
    "professionalProfileId" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "priorityNote" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'ATIVA',
    "removedReason" TEXT,
    "lastOfferedAt" TIMESTAMP(3),
    "convertedAppointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistOffer" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "slotEnd" TIMESTAMP(3) NOT NULL,
    "modality" "AppointmentModality",
    "tokenHash" TEXT NOT NULL,
    "status" "WaitlistOfferStatus" NOT NULL DEFAULT 'ENVIADA',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "appointmentId" TEXT,
    "sourceAppointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistEntry_clinicId_status_idx" ON "WaitlistEntry"("clinicId", "status");

-- CreateIndex
CREATE INDEX "WaitlistEntry_clinicId_professionalProfileId_status_idx" ON "WaitlistEntry"("clinicId", "professionalProfileId", "status");

-- CreateIndex
CREATE INDEX "WaitlistEntry_patientId_idx" ON "WaitlistEntry"("patientId");

-- CreateIndex (partial unique — anti-duplicidade; Prisma DSL não expressa parciais)
-- Impede 2 entradas ATIVA/OFERTADA do mesmo paciente+profissional na mesma clínica.
CREATE UNIQUE INDEX "WaitlistEntry_active_dedupe_uniq"
  ON "WaitlistEntry" ("clinicId", "patientId", COALESCE("professionalProfileId", ''))
  WHERE "status" IN ('ATIVA', 'OFERTADA') AND "patientId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistOffer_tokenHash_key" ON "WaitlistOffer"("tokenHash");

-- CreateIndex
CREATE INDEX "WaitlistOffer_clinicId_status_expiresAt_idx" ON "WaitlistOffer"("clinicId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "WaitlistOffer_clinicId_slotStart_idx" ON "WaitlistOffer"("clinicId", "slotStart");

-- CreateIndex
CREATE INDEX "WaitlistOffer_entryId_idx" ON "WaitlistOffer"("entryId");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistOffer" ADD CONSTRAINT "WaitlistOffer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistOffer" ADD CONSTRAINT "WaitlistOffer_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "WaitlistEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistOffer" ADD CONSTRAINT "WaitlistOffer_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

