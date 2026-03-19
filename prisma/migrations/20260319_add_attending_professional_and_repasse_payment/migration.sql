-- AlterTable: Add attendingProfessionalId to Appointment
ALTER TABLE "Appointment" ADD COLUMN "attendingProfessionalId" TEXT;

-- AlterTable: Add attendingProfessionalId to InvoiceItem
ALTER TABLE "InvoiceItem" ADD COLUMN "attendingProfessionalId" TEXT;

-- CreateTable: RepassePayment
CREATE TABLE "RepassePayment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "referenceMonth" INTEGER NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "grossAmount" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL,
    "repasseAmount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepassePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepassePayment_clinicId_idx" ON "RepassePayment"("clinicId");

-- CreateIndex
CREATE INDEX "RepassePayment_professionalProfileId_idx" ON "RepassePayment"("professionalProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "RepassePayment_clinicId_professionalProfileId_referenceMonth_referenceYear_key" ON "RepassePayment"("clinicId", "professionalProfileId", "referenceMonth", "referenceYear");

-- CreateIndex
CREATE INDEX "Appointment_attendingProfessionalId_idx" ON "Appointment"("attendingProfessionalId");

-- CreateIndex
CREATE INDEX "InvoiceItem_attendingProfessionalId_idx" ON "InvoiceItem"("attendingProfessionalId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_attendingProfessionalId_fkey" FOREIGN KEY ("attendingProfessionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_attendingProfessionalId_fkey" FOREIGN KEY ("attendingProfessionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepassePayment" ADD CONSTRAINT "RepassePayment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepassePayment" ADD CONSTRAINT "RepassePayment_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
