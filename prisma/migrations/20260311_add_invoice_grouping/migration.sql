-- CreateEnum
CREATE TYPE "InvoiceGrouping" AS ENUM ('MONTHLY', 'PER_SESSION');

-- AlterEnum
ALTER TYPE "InvoiceType" ADD VALUE 'PER_SESSION';

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "invoiceGrouping" "InvoiceGrouping" NOT NULL DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "invoiceGrouping" "InvoiceGrouping";

-- CreateIndex
CREATE INDEX "Invoice_clinicId_patientId_professionalProfileId_referenceY_idx" ON "Invoice"("clinicId", "patientId", "professionalProfileId", "referenceYear", "referenceMonth");
