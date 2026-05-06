-- Pairs an overpayment CREDIT BankTransaction with the outgoing refund
-- DEBIT that returned the difference to the payer. Resolves both halves
-- of the operation in one row.
CREATE TABLE "TransactionRefundLink" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "creditTransactionId" TEXT NOT NULL,
    "debitTransactionId" TEXT NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedByUserId" TEXT,

    CONSTRAINT "TransactionRefundLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransactionRefundLink_creditTransactionId_debitTransactionId_key"
    ON "TransactionRefundLink"("creditTransactionId", "debitTransactionId");

CREATE INDEX "TransactionRefundLink_clinicId_idx" ON "TransactionRefundLink"("clinicId");
CREATE INDEX "TransactionRefundLink_creditTransactionId_idx" ON "TransactionRefundLink"("creditTransactionId");
CREATE INDEX "TransactionRefundLink_debitTransactionId_idx" ON "TransactionRefundLink"("debitTransactionId");

ALTER TABLE "TransactionRefundLink"
    ADD CONSTRAINT "TransactionRefundLink_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransactionRefundLink"
    ADD CONSTRAINT "TransactionRefundLink_creditTransactionId_fkey"
    FOREIGN KEY ("creditTransactionId") REFERENCES "BankTransaction"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransactionRefundLink"
    ADD CONSTRAINT "TransactionRefundLink_debitTransactionId_fkey"
    FOREIGN KEY ("debitTransactionId") REFERENCES "BankTransaction"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransactionRefundLink"
    ADD CONSTRAINT "TransactionRefundLink_linkedByUserId_fkey"
    FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
