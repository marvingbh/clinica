-- CreateEnum
CREATE TYPE "PatientDocumentSource" AS ENUM ('UPLOAD', 'GERADO', 'ASSINADO', 'FORMULARIO');

-- CreateEnum
CREATE TYPE "PatientDocumentCategory" AS ENUM ('EXAME', 'ENCAMINHAMENTO', 'DOCUMENTO', 'CONTRATO', 'OUTRO');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "maxStorageMb" INTEGER NOT NULL DEFAULT 1024;

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "restrictExamesToProfessionals" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "uploaderUserId" TEXT,
    "source" "PatientDocumentSource" NOT NULL DEFAULT 'UPLOAD',
    "category" "PatientDocumentCategory" NOT NULL DEFAULT 'DOCUMENTO',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "description" TEXT,
    "sharedWithPatient" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientDocument_storageKey_key" ON "PatientDocument"("storageKey");

-- CreateIndex
CREATE INDEX "PatientDocument_clinicId_idx" ON "PatientDocument"("clinicId");

-- CreateIndex
CREATE INDEX "PatientDocument_clinicId_patientId_deletedAt_createdAt_idx" ON "PatientDocument"("clinicId", "patientId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "PatientDocument_deletedAt_idx" ON "PatientDocument"("deletedAt");

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

