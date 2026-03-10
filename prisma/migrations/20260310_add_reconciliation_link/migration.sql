-- CreateTable
CREATE TABLE "ReconciliationLink" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledByUserId" TEXT,

    CONSTRAINT "ReconciliationLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationLink_transactionId_idx" ON "ReconciliationLink"("transactionId");
CREATE INDEX "ReconciliationLink_invoiceId_idx" ON "ReconciliationLink"("invoiceId");
CREATE INDEX "ReconciliationLink_clinicId_idx" ON "ReconciliationLink"("clinicId");

-- AddForeignKey
ALTER TABLE "ReconciliationLink" ADD CONSTRAINT "ReconciliationLink_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationLink" ADD CONSTRAINT "ReconciliationLink_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationLink" ADD CONSTRAINT "ReconciliationLink_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationLink" ADD CONSTRAINT "ReconciliationLink_reconciledByUserId_fkey"
    FOREIGN KEY ("reconciledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate existing reconciliation data to ReconciliationLink
INSERT INTO "ReconciliationLink" ("id", "clinicId", "transactionId", "invoiceId", "amount", "reconciledAt", "reconciledByUserId")
SELECT
    gen_random_uuid()::text,
    bt."clinicId",
    bt."id",
    bt."reconciledInvoiceId",
    bt."amount",
    COALESCE(bt."reconciledAt", NOW()),
    bt."reconciledByUserId"
FROM "BankTransaction" bt
WHERE bt."reconciledInvoiceId" IS NOT NULL;

-- Delete synthetic split records (they are now represented as links)
DELETE FROM "BankTransaction" WHERE "externalId" LIKE '%:split-%';

-- DropForeignKey
ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_reconciledInvoiceId_fkey";
ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_reconciledByUserId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "BankTransaction_reconciledInvoiceId_idx";

-- AlterTable
ALTER TABLE "BankTransaction" DROP COLUMN IF EXISTS "reconciledInvoiceId";
ALTER TABLE "BankTransaction" DROP COLUMN IF EXISTS "reconciledAt";
ALTER TABLE "BankTransaction" DROP COLUMN IF EXISTS "reconciledByUserId";
