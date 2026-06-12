-- CreateEnum
CREATE TYPE "ClinicalNoteType" AS ENUM ('EVOLUCAO', 'AVALIACAO', 'ENCERRAMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "ClinicalNoteFormat" AS ENUM ('SOAP', 'DAP', 'LIVRE');

-- CreateEnum
CREATE TYPE "ClinicalNoteStatus" AS ENUM ('RASCUNHO', 'ASSINADA');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "prontuarioResponsibleProfessionalId" TEXT,
ADD COLUMN     "prontuarioRetentionYears" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "recordClosedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "sourceAppointmentId" TEXT;

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "templateId" TEXT,
    "noteType" "ClinicalNoteType" NOT NULL DEFAULT 'EVOLUCAO',
    "format" "ClinicalNoteFormat" NOT NULL DEFAULT 'SOAP',
    "sections" JSONB NOT NULL DEFAULT '{}',
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "status" "ClinicalNoteStatus" NOT NULL DEFAULT 'RASCUNHO',
    "signedAt" TIMESTAMP(3),
    "signedByUserId" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteAddendum" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteTemplate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "ClinicalNoteFormat" NOT NULL,
    "sectionDefs" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordDisposal" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "disposedByUserId" TEXT,
    "recordClosedAt" TIMESTAMP(3) NOT NULL,
    "retentionYears" INTEGER NOT NULL,
    "notesCount" INTEGER NOT NULL,
    "addendaCount" INTEGER NOT NULL,
    "oldestSessionDate" TIMESTAMP(3),
    "newestSessionDate" TIMESTAMP(3),
    "contentHashes" JSONB NOT NULL DEFAULT '[]',
    "disposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordDisposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalNote_clinicId_idx" ON "ClinicalNote"("clinicId");

-- CreateIndex
CREATE INDEX "ClinicalNote_clinicId_patientId_sessionDate_idx" ON "ClinicalNote"("clinicId", "patientId", "sessionDate");

-- CreateIndex
CREATE INDEX "ClinicalNote_clinicId_professionalProfileId_status_idx" ON "ClinicalNote"("clinicId", "professionalProfileId", "status");

-- CreateIndex
CREATE INDEX "ClinicalNote_patientId_idx" ON "ClinicalNote"("patientId");

-- CreateIndex
CREATE INDEX "ClinicalNote_appointmentId_idx" ON "ClinicalNote"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalNote_professionalProfileId_appointmentId_key" ON "ClinicalNote"("professionalProfileId", "appointmentId");

-- CreateIndex
CREATE INDEX "NoteAddendum_noteId_idx" ON "NoteAddendum"("noteId");

-- CreateIndex
CREATE INDEX "NoteAddendum_clinicId_idx" ON "NoteAddendum"("clinicId");

-- CreateIndex
CREATE INDEX "NoteTemplate_clinicId_isActive_idx" ON "NoteTemplate"("clinicId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "NoteTemplate_clinicId_name_key" ON "NoteTemplate"("clinicId", "name");

-- CreateIndex
CREATE INDEX "RecordDisposal_clinicId_disposedAt_idx" ON "RecordDisposal"("clinicId", "disposedAt");

-- CreateIndex
CREATE INDEX "Todo_sourceAppointmentId_idx" ON "Todo"("sourceAppointmentId");

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_prontuarioResponsibleProfessionalId_fkey" FOREIGN KEY ("prontuarioResponsibleProfessionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NoteTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_signedByUserId_fkey" FOREIGN KEY ("signedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAddendum" ADD CONSTRAINT "NoteAddendum_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAddendum" ADD CONSTRAINT "NoteAddendum_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ClinicalNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAddendum" ADD CONSTRAINT "NoteAddendum_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteTemplate" ADD CONSTRAINT "NoteTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDisposal" ADD CONSTRAINT "RecordDisposal_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDisposal" ADD CONSTRAINT "RecordDisposal_disposedByUserId_fkey" FOREIGN KEY ("disposedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index for cron idempotency on Todo.sourceAppointmentId.
-- Prisma DSL cannot express partial uniques (WHERE NOT NULL), so it is authored here.
-- Mirrors the pattern of migration 20260503100000_todo_recurrence_day_unique.
CREATE UNIQUE INDEX "Todo_sourceAppointmentId_uniq" ON "Todo"("sourceAppointmentId") WHERE "sourceAppointmentId" IS NOT NULL;

