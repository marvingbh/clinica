-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "telehealthEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "telehealthStartedAt" TIMESTAMP(3);

