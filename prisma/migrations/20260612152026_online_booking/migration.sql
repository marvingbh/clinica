-- CreateEnum
CREATE TYPE "OnlineBookingMode" AS ENUM ('AUTO_CONFIRM', 'APPROVAL_REQUIRED');

-- CreateEnum
CREATE TYPE "BookingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ONLINE_BOOKING_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'ONLINE_BOOKING_REJECTED';

-- AlterTable
ALTER TABLE "ProfessionalProfile" ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "publicBookingSlug" TEXT;

-- CreateTable
CREATE TABLE "OnlineBookingSettings" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "OnlineBookingMode" NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    "sessionDurationMinutes" INTEGER NOT NULL DEFAULT 50,
    "minAdvanceHours" INTEGER NOT NULL DEFAULT 12,
    "horizonDays" INTEGER NOT NULL DEFAULT 30,
    "allowedModalities" "AppointmentModality"[] DEFAULT ARRAY['ONLINE', 'PRESENCIAL']::"AppointmentModality"[],
    "maxOpenBookingsPerPhone" INTEGER NOT NULL DEFAULT 2,
    "blockedPhones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineBookingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "status" "BookingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "modality" "AppointmentModality" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT,
    "consentWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "consentEmail" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT,
    "appointmentId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlineBookingSettings_clinicId_key" ON "OnlineBookingSettings"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRequest_appointmentId_key" ON "BookingRequest"("appointmentId");

-- CreateIndex
CREATE INDEX "BookingRequest_clinicId_status_idx" ON "BookingRequest"("clinicId", "status");

-- CreateIndex
CREATE INDEX "BookingRequest_clinicId_scheduledAt_idx" ON "BookingRequest"("clinicId", "scheduledAt");

-- CreateIndex
CREATE INDEX "BookingRequest_clinicId_phone_idx" ON "BookingRequest"("clinicId", "phone");

-- CreateIndex
CREATE INDEX "BookingRequest_professionalProfileId_status_scheduledAt_idx" ON "BookingRequest"("professionalProfileId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ProfessionalProfile_publicBookingSlug_idx" ON "ProfessionalProfile"("publicBookingSlug");

-- AddForeignKey
ALTER TABLE "OnlineBookingSettings" ADD CONSTRAINT "OnlineBookingSettings_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

