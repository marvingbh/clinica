-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('PACIENTE', 'RESPONSAVEL');

-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('PENDENTE', 'VISUALIZADO', 'ASSINADO', 'RECUSADO', 'EXPIRADO', 'CANCELADO', 'INVALIDADO');

-- CreateEnum
CREATE TYPE "SignatureEnvelopeStatus" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDO', 'RECUSADO', 'EXPIRADO', 'CANCELADO', 'INVALIDADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_SIGNATURE_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_SIGNATURE_OTP';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_SIGNATURE_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_SIGNED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'TCLE';
ALTER TYPE "DocumentType" ADD VALUE 'CONSENTIMENTO_MENOR';
ALTER TYPE "DocumentType" ADD VALUE 'CONSENTIMENTO_IMAGEM';
ALTER TYPE "DocumentType" ADD VALUE 'CONSENTIMENTO_GRAVACAO';
ALTER TYPE "DocumentType" ADD VALUE 'TERMO_LGPD';

-- CreateTable
CREATE TABLE "SignatureEnvelope" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "status" "SignatureEnvelopeStatus" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "originalSha256" TEXT NOT NULL,
    "signedPdf" BYTEA,
    "signedSha256" TEXT,
    "verificationCode" TEXT,
    "countersignedAt" TIMESTAMP(3),
    "countersignature" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerCpf" TEXT,
    "signerEmail" TEXT,
    "signerPhone" TEXT,
    "role" "SignerRole" NOT NULL,
    "signingOrder" INTEGER NOT NULL DEFAULT 1,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'PENDENTE',
    "tokenHash" TEXT NOT NULL,
    "linkSentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "otpChannel" "NotificationChannel",
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureOtp" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignatureEnvelope_verificationCode_key" ON "SignatureEnvelope"("verificationCode");

-- CreateIndex
CREATE INDEX "SignatureEnvelope_clinicId_status_idx" ON "SignatureEnvelope"("clinicId", "status");

-- CreateIndex
CREATE INDEX "SignatureEnvelope_clinicId_patientId_idx" ON "SignatureEnvelope"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "SignatureEnvelope_documentId_idx" ON "SignatureEnvelope"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_tokenHash_key" ON "SignatureRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "SignatureRequest_clinicId_status_idx" ON "SignatureRequest"("clinicId", "status");

-- CreateIndex
CREATE INDEX "SignatureRequest_envelopeId_signingOrder_idx" ON "SignatureRequest"("envelopeId", "signingOrder");

-- CreateIndex
CREATE INDEX "SignatureRequest_status_expiresAt_idx" ON "SignatureRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "SignatureOtp_requestId_expiresAt_idx" ON "SignatureOtp"("requestId", "expiresAt");

-- CreateIndex
CREATE INDEX "SignatureOtp_expiresAt_idx" ON "SignatureOtp"("expiresAt");

-- AddForeignKey
ALTER TABLE "SignatureEnvelope" ADD CONSTRAINT "SignatureEnvelope_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureEnvelope" ADD CONSTRAINT "SignatureEnvelope_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureEnvelope" ADD CONSTRAINT "SignatureEnvelope_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureEnvelope" ADD CONSTRAINT "SignatureEnvelope_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "SignatureEnvelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureOtp" ADD CONSTRAINT "SignatureOtp_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureOtp" ADD CONSTRAINT "SignatureOtp_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

