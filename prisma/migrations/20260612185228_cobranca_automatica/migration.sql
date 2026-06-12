-- CreateEnum
CREATE TYPE "StripeConnectStatus" AS ENUM ('DISCONNECTED', 'ONBOARDING', 'ACTIVE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "PaymentChargeStatus" AS ENUM ('ABERTA', 'PAGA', 'EXPIRADA', 'CANCELADA', 'REEMBOLSADA');

-- CreateEnum
CREATE TYPE "ReconciliationSource" AS ENUM ('BANK', 'STRIPE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_LINK';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_REMINDER';

-- AlterEnum
ALTER TYPE "TransactionDismissReason" ADD VALUE 'STRIPE_PAYOUT';

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "applicationFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "stripeConnectAccountId" TEXT,
ADD COLUMN     "stripeConnectStatus" "StripeConnectStatus" NOT NULL DEFAULT 'DISCONNECTED';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "dunningOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "invoiceId" TEXT;

-- AlterTable
ALTER TABLE "ReconciliationLink" ADD COLUMN     "paymentChargeId" TEXT,
ADD COLUMN     "source" "ReconciliationSource" NOT NULL DEFAULT 'BANK',
ALTER COLUMN "transactionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "NfseConfig" ADD COLUMN     "autoEmitOnPayment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PaymentCharge" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "PaymentChargeStatus" NOT NULL DEFAULT 'ABERTA',
    "amount" DECIMAL(10,2) NOT NULL,
    "applicationFeeAmount" DECIMAL(10,2),
    "stripeFeeAmount" DECIMAL(10,2),
    "netAmount" DECIMAL(10,2),
    "paymentMethod" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "sessionCreatedAt" TIMESTAMP(3),
    "regenerationCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdViaDunning" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "payoutMatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DunningConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "offsets" INTEGER[] DEFAULT ARRAY[-3, 0, 3, 7]::INTEGER[],
    "sendWhatsApp" BOOLEAN NOT NULL DEFAULT true,
    "sendEmail" BOOLEAN NOT NULL DEFAULT true,
    "maxAttempts" INTEGER NOT NULL DEFAULT 4,
    "linkExpirationDays" INTEGER NOT NULL DEFAULT 7,
    "autoChargeOnInvoiceCreation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DunningConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCharge_stripeCheckoutSessionId_key" ON "PaymentCharge"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCharge_stripePaymentIntentId_key" ON "PaymentCharge"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "PaymentCharge_clinicId_idx" ON "PaymentCharge"("clinicId");

-- CreateIndex
CREATE INDEX "PaymentCharge_invoiceId_idx" ON "PaymentCharge"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentCharge_clinicId_status_idx" ON "PaymentCharge"("clinicId", "status");

-- CreateIndex
CREATE INDEX "PaymentCharge_clinicId_status_expiresAt_idx" ON "PaymentCharge"("clinicId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DunningConfig_clinicId_key" ON "DunningConfig"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_stripeConnectAccountId_key" ON "Clinic"("stripeConnectAccountId");

-- CreateIndex
CREATE INDEX "Notification_invoiceId_idx" ON "Notification"("invoiceId");

-- CreateIndex
CREATE INDEX "Notification_invoiceId_type_createdAt_idx" ON "Notification"("invoiceId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ReconciliationLink_paymentChargeId_idx" ON "ReconciliationLink"("paymentChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationLink_paymentChargeId_invoiceId_key" ON "ReconciliationLink"("paymentChargeId", "invoiceId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationLink" ADD CONSTRAINT "ReconciliationLink_paymentChargeId_fkey" FOREIGN KEY ("paymentChargeId") REFERENCES "PaymentCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCharge" ADD CONSTRAINT "PaymentCharge_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCharge" ADD CONSTRAINT "PaymentCharge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCharge" ADD CONSTRAINT "PaymentCharge_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningConfig" ADD CONSTRAINT "DunningConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one source per reconciliation link: BANK rows have transactionId,
-- STRIPE rows have paymentChargeId. Existing rows (all BANK) satisfy this.
ALTER TABLE "ReconciliationLink" ADD CONSTRAINT "ReconciliationLink_one_source_chk"
  CHECK (("transactionId" IS NOT NULL AND "paymentChargeId" IS NULL)
      OR ("transactionId" IS NULL AND "paymentChargeId" IS NOT NULL));

