-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DECLARACAO_COMPARECIMENTO', 'ATESTADO_PSICOLOGICO', 'RELATORIO_PSICOLOGICO', 'LAUDO_PSICOLOGICO', 'PARECER_PSICOLOGICO', 'ENCAMINHAMENTO', 'CONTRATO_TERAPEUTICO', 'RECIBO_REEMBOLSO');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "restrictClinicalDocsToProfessionals" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClinicDocumentTemplate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicDocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalProfileId" TEXT,
    "appointmentId" TEXT,
    "templateId" TEXT,
    "templateType" "DocumentType" NOT NULL,
    "templateName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentSnapshot" TEXT NOT NULL,
    "mergeData" JSONB NOT NULL,
    "pdfData" BYTEA NOT NULL,
    "generatedByUserId" TEXT,
    "sentToEmail" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicDocumentTemplate_clinicId_type_idx" ON "ClinicDocumentTemplate"("clinicId", "type");

-- CreateIndex
CREATE INDEX "ClinicDocumentTemplate_clinicId_isActive_idx" ON "ClinicDocumentTemplate"("clinicId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicDocumentTemplate_clinicId_type_name_key" ON "ClinicDocumentTemplate"("clinicId", "type", "name");

-- CreateIndex
CREATE INDEX "GeneratedDocument_clinicId_patientId_createdAt_idx" ON "GeneratedDocument"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedDocument_clinicId_createdAt_idx" ON "GeneratedDocument"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedDocument_clinicId_templateType_idx" ON "GeneratedDocument"("clinicId", "templateType");

-- CreateIndex
CREATE INDEX "GeneratedDocument_professionalProfileId_idx" ON "GeneratedDocument"("professionalProfileId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_appointmentId_idx" ON "GeneratedDocument"("appointmentId");

-- AddForeignKey
ALTER TABLE "ClinicDocumentTemplate" ADD CONSTRAINT "ClinicDocumentTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClinicDocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

