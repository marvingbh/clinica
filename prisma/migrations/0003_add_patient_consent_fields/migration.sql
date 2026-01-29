-- AlterTable: Add LGPD consent fields to Patient
ALTER TABLE "Patient" ADD COLUMN "consentWhatsApp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Patient" ADD COLUMN "consentWhatsAppAt" TIMESTAMP(3);
ALTER TABLE "Patient" ADD COLUMN "consentEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Patient" ADD COLUMN "consentEmailAt" TIMESTAMP(3);
