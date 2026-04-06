-- AlterTable: Add splitInvoiceByProfessional to Patient
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "splitInvoiceByProfessional" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: Unique constraint on SessionCredit.originAppointmentId to prevent duplicate credits
-- First clean up any existing duplicates (keep the first one per originAppointmentId)
DELETE FROM "SessionCredit"
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "originAppointmentId" ORDER BY "createdAt") as rn
    FROM "SessionCredit"
  ) sub
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "SessionCredit_originAppointmentId_key" ON "SessionCredit"("originAppointmentId");
