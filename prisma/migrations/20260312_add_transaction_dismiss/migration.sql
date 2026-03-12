-- CreateEnum
CREATE TYPE "TransactionDismissReason" AS ENUM ('DUPLICATE', 'NOT_PATIENT');

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN "dismissReason" "TransactionDismissReason",
ADD COLUMN "dismissedAt" TIMESTAMP(3),
ADD COLUMN "dismissedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
