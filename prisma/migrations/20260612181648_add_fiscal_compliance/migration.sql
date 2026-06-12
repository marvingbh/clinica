-- CreateEnum
CREATE TYPE "FiscalRegime" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "ReciboSaudeStatus" AS ENUM ('EXPORTADO', 'EMITIDO', 'ERRO', 'CANCELADO');

-- AlterTable
-- IF NOT EXISTS: "cpf" is shared with feature 009 (a sibling migration may also add it).
-- All three are idempotent so re-applying after the sibling re-adds the column is a no-op.
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "cpf" TEXT;
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "fiscalRegime" "FiscalRegime";
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "fiscalRegimeSince" DATE;

-- CreateTable
CREATE TABLE "FiscalConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "dmedEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cnpj" TEXT,
    "nomeEmpresarial" TEXT,
    "responsavelCpf" TEXT,
    "responsavelNome" TEXT,
    "responsavelDdd" TEXT,
    "responsavelTelefone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReciboSaudeBatch" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "generatedByUserId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileContent" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "resultFileContent" TEXT,
    "resultUploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReciboSaudeBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReciboSaudeEmission" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "reconciliationLinkId" TEXT,
    "paymentKey" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "beneficiaryCpf" TEXT NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "beneficiaryBirthDate" DATE NOT NULL,
    "payerCpf" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "status" "ReciboSaudeStatus" NOT NULL DEFAULT 'EXPORTADO',
    "reciboNumero" TEXT,
    "erro" TEXT,
    "emitidoAt" TIMESTAMP(3),
    "canceladoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReciboSaudeEmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalConfig_clinicId_key" ON "FiscalConfig"("clinicId");

-- CreateIndex
CREATE INDEX "ReciboSaudeBatch_clinicId_createdAt_idx" ON "ReciboSaudeBatch"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "ReciboSaudeBatch_clinicId_professionalProfileId_idx" ON "ReciboSaudeBatch"("clinicId", "professionalProfileId");

-- CreateIndex
CREATE INDEX "ReciboSaudeEmission_clinicId_status_idx" ON "ReciboSaudeEmission"("clinicId", "status");

-- CreateIndex
CREATE INDEX "ReciboSaudeEmission_batchId_idx" ON "ReciboSaudeEmission"("batchId");

-- CreateIndex
CREATE INDEX "ReciboSaudeEmission_clinicId_professionalProfileId_paymentD_idx" ON "ReciboSaudeEmission"("clinicId", "professionalProfileId", "paymentDate");

-- CreateIndex
CREATE INDEX "ReciboSaudeEmission_patientId_idx" ON "ReciboSaudeEmission"("patientId");

-- CreateIndex
CREATE INDEX "ReciboSaudeEmission_invoiceId_idx" ON "ReciboSaudeEmission"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ReciboSaudeEmission_clinicId_paymentKey_key" ON "ReciboSaudeEmission"("clinicId", "paymentKey");

-- AddForeignKey
ALTER TABLE "FiscalConfig" ADD CONSTRAINT "FiscalConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboSaudeBatch" ADD CONSTRAINT "ReciboSaudeBatch_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboSaudeBatch" ADD CONSTRAINT "ReciboSaudeBatch_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboSaudeBatch" ADD CONSTRAINT "ReciboSaudeBatch_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboSaudeEmission" ADD CONSTRAINT "ReciboSaudeEmission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboSaudeEmission" ADD CONSTRAINT "ReciboSaudeEmission_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ReciboSaudeBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboSaudeEmission" ADD CONSTRAINT "ReciboSaudeEmission_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboSaudeEmission" ADD CONSTRAINT "ReciboSaudeEmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboSaudeEmission" ADD CONSTRAINT "ReciboSaudeEmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

