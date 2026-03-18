-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "sessionGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_sessionGroupId_idx" ON "Appointment"("sessionGroupId");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_sessionGroupId_idx" ON "Appointment"("clinicId", "sessionGroupId");
