-- CreateEnum
CREATE TYPE "IntakeSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'INTAKE_FORM_SUBMITTED';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "consentPhotoVideo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentPhotoVideoAt" TIMESTAMP(3),
ADD COLUMN     "consentSessionRecording" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentSessionRecordingAt" TIMESTAMP(3),
ADD COLUMN     "fatherPhone" TEXT,
ADD COLUMN     "motherPhone" TEXT,
ADD COLUMN     "schoolShift" TEXT,
ADD COLUMN     "schoolUnit" TEXT;

-- CreateTable
CREATE TABLE "IntakeSubmission" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "status" "IntakeSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "childName" TEXT NOT NULL,
    "childBirthDate" DATE NOT NULL,
    "guardianName" TEXT NOT NULL,
    "guardianCpfCnpj" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "addressStreet" TEXT NOT NULL,
    "addressNumber" TEXT,
    "addressNeighborhood" TEXT,
    "addressCity" TEXT,
    "addressState" VARCHAR(2),
    "addressZip" VARCHAR(8) NOT NULL,
    "schoolName" TEXT,
    "schoolUnit" TEXT,
    "schoolShift" TEXT,
    "motherName" TEXT,
    "motherPhone" TEXT,
    "fatherName" TEXT,
    "fatherPhone" TEXT,
    "consentPhotoVideo" BOOLEAN NOT NULL DEFAULT false,
    "consentSessionRecording" BOOLEAN NOT NULL DEFAULT false,
    "patientId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeSubmission_clinicId_status_idx" ON "IntakeSubmission"("clinicId", "status");

-- CreateIndex
CREATE INDEX "IntakeSubmission_clinicId_submittedAt_idx" ON "IntakeSubmission"("clinicId", "submittedAt");

-- AddForeignKey
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
