-- CreateEnum
CREATE TYPE "PortalSessionScope" AS ENUM ('FULL', 'AGENDA');

-- CreateEnum
CREATE TYPE "PortalRequestType" AS ENUM ('RESCHEDULE', 'UPDATE_DATA', 'LGPD_EXPORT');

-- CreateEnum
CREATE TYPE "PortalRequestStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PATIENT_PORTAL_OTP';

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "allowPatientPortal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "patientPortalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "portalCancelMinHours" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "PatientPortalSession" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "patientId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "scope" "PortalSessionScope" NOT NULL DEFAULT 'FULL',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPortalOtp" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPortalOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalRequest" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "type" "PortalRequestType" NOT NULL,
    "status" "PortalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "resolutionNotes" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientPortalSession_tokenHash_key" ON "PatientPortalSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PatientPortalSession_clinicId_identifier_idx" ON "PatientPortalSession"("clinicId", "identifier");

-- CreateIndex
CREATE INDEX "PatientPortalSession_expiresAt_idx" ON "PatientPortalSession"("expiresAt");

-- CreateIndex
CREATE INDEX "PatientPortalSession_patientId_idx" ON "PatientPortalSession"("patientId");

-- CreateIndex
CREATE INDEX "PatientPortalOtp_clinicId_identifier_expiresAt_idx" ON "PatientPortalOtp"("clinicId", "identifier", "expiresAt");

-- CreateIndex
CREATE INDEX "PatientPortalOtp_expiresAt_idx" ON "PatientPortalOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "PortalRequest_clinicId_status_idx" ON "PortalRequest"("clinicId", "status");

-- CreateIndex
CREATE INDEX "PortalRequest_clinicId_createdAt_idx" ON "PortalRequest"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalRequest_patientId_idx" ON "PortalRequest"("patientId");

-- CreateIndex
CREATE INDEX "PortalRequest_appointmentId_idx" ON "PortalRequest"("appointmentId");

-- AddForeignKey
ALTER TABLE "PatientPortalSession" ADD CONSTRAINT "PatientPortalSession_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalSession" ADD CONSTRAINT "PatientPortalSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalOtp" ADD CONSTRAINT "PatientPortalOtp_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalRequest" ADD CONSTRAINT "PortalRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalRequest" ADD CONSTRAINT "PortalRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalRequest" ADD CONSTRAINT "PortalRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalRequest" ADD CONSTRAINT "PortalRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

