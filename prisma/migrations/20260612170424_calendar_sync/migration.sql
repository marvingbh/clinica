-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'ICS');

-- CreateEnum
CREATE TYPE "CalendarIntegrationStatus" AS ENUM ('ATIVA', 'ERRO', 'REVOGADA');

-- CreateEnum
CREATE TYPE "CalendarPrivacyMode" AS ENUM ('TOTAL', 'PRIMEIRO_NOME');

-- CreateEnum
CREATE TYPE "CalendarSyncOperation" AS ENUM ('UPSERT', 'DELETE');

-- CreateEnum
CREATE TYPE "CalendarSyncJobStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CALENDAR_SYNC_ERROR';

-- CreateTable
CREATE TABLE "CalendarIntegration" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "status" "CalendarIntegrationStatus" NOT NULL DEFAULT 'ATIVA',
    "privacyMode" "CalendarPrivacyMode" NOT NULL DEFAULT 'TOTAL',
    "syncNonBlocking" BOOLEAN NOT NULL DEFAULT false,
    "encryptedRefreshToken" TEXT,
    "googleAccountEmail" TEXT,
    "targetCalendarId" TEXT DEFAULT 'primary',
    "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "inboundEnabled" BOOLEAN NOT NULL DEFAULT false,
    "selectedCalendarIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "busyBlocksFetchedAt" TIMESTAMP(3),
    "icsToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventLink" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "lastSyncHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEventLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncJob" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "operation" "CalendarSyncOperation" NOT NULL,
    "status" "CalendarSyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusyBlock" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "sourceCalendarId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusyBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarIntegration_icsToken_key" ON "CalendarIntegration"("icsToken");

-- CreateIndex
CREATE INDEX "CalendarIntegration_clinicId_idx" ON "CalendarIntegration"("clinicId");

-- CreateIndex
CREATE INDEX "CalendarIntegration_clinicId_status_idx" ON "CalendarIntegration"("clinicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarIntegration_userId_provider_key" ON "CalendarIntegration"("userId", "provider");

-- CreateIndex
CREATE INDEX "CalendarEventLink_clinicId_idx" ON "CalendarEventLink"("clinicId");

-- CreateIndex
CREATE INDEX "CalendarEventLink_appointmentId_idx" ON "CalendarEventLink"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventLink_integrationId_appointmentId_key" ON "CalendarEventLink"("integrationId", "appointmentId");

-- CreateIndex
CREATE INDEX "CalendarSyncJob_status_nextRetryAt_idx" ON "CalendarSyncJob"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "CalendarSyncJob_clinicId_idx" ON "CalendarSyncJob"("clinicId");

-- CreateIndex
CREATE INDEX "CalendarSyncJob_appointmentId_idx" ON "CalendarSyncJob"("appointmentId");

-- CreateIndex
CREATE INDEX "BusyBlock_clinicId_professionalProfileId_startAt_idx" ON "BusyBlock"("clinicId", "professionalProfileId", "startAt");

-- CreateIndex
CREATE INDEX "BusyBlock_integrationId_idx" ON "BusyBlock"("integrationId");

-- AddForeignKey
ALTER TABLE "CalendarIntegration" ADD CONSTRAINT "CalendarIntegration_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarIntegration" ADD CONSTRAINT "CalendarIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "CalendarIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncJob" ADD CONSTRAINT "CalendarSyncJob_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusyBlock" ADD CONSTRAINT "BusyBlock_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusyBlock" ADD CONSTRAINT "BusyBlock_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "CalendarIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusyBlock" ADD CONSTRAINT "BusyBlock_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Partial unique index: dedupes re-enqueued PENDING jobs per (appointmentId, operation).
-- createMany({ skipDuplicates: true }) relies on this to swallow duplicate enqueues.
CREATE UNIQUE INDEX "CalendarSyncJob_pending_uniq" ON "CalendarSyncJob"("appointmentId", "operation") WHERE "status" = 'PENDING';
