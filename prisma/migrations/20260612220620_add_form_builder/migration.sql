-- CreateEnum
CREATE TYPE "FormResponseStatus" AS ENUM ('ENVIADO', 'EM_PREENCHIMENTO', 'CONCLUIDO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "FormSentVia" AS ENUM ('WHATSAPP', 'EMAIL', 'LINK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'FORM_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'FORM_COMPLETED';

-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoSendOnIntakeApproval" BOOLEAN NOT NULL DEFAULT false,
    "draftFields" JSONB NOT NULL DEFAULT '[]',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormVersion" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "formVersionId" TEXT NOT NULL,
    "professionalProfileId" TEXT,
    "sentByUserId" TEXT,
    "status" "FormResponseStatus" NOT NULL DEFAULT 'ENVIADO',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "sentVia" "FormSentVia" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormTemplate_clinicId_isActive_idx" ON "FormTemplate"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "FormTemplate_clinicId_idx" ON "FormTemplate"("clinicId");

-- CreateIndex
CREATE INDEX "FormVersion_clinicId_idx" ON "FormVersion"("clinicId");

-- CreateIndex
CREATE INDEX "FormVersion_templateId_idx" ON "FormVersion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "FormVersion_templateId_version_key" ON "FormVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_tokenHash_key" ON "FormResponse"("tokenHash");

-- CreateIndex
CREATE INDEX "FormResponse_clinicId_patientId_idx" ON "FormResponse"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "FormResponse_clinicId_status_idx" ON "FormResponse"("clinicId", "status");

-- CreateIndex
CREATE INDEX "FormResponse_patientId_idx" ON "FormResponse"("patientId");

-- CreateIndex
CREATE INDEX "FormResponse_formVersionId_idx" ON "FormResponse"("formVersionId");

-- CreateIndex
CREATE INDEX "FormResponse_professionalProfileId_idx" ON "FormResponse"("professionalProfileId");

-- AddForeignKey
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "FormVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

