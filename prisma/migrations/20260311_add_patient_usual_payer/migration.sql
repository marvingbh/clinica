-- CreateTable
CREATE TABLE "PatientUsualPayer" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientUsualPayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientUsualPayer_patientId_payerName_key" ON "PatientUsualPayer"("patientId", "payerName");

-- CreateIndex
CREATE INDEX "PatientUsualPayer_clinicId_payerName_idx" ON "PatientUsualPayer"("clinicId", "payerName");

-- AddForeignKey
ALTER TABLE "PatientUsualPayer" ADD CONSTRAINT "PatientUsualPayer_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientUsualPayer" ADD CONSTRAINT "PatientUsualPayer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
