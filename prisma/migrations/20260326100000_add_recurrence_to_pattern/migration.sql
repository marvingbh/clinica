-- AlterTable
ALTER TABLE "ExpenseCategoryPattern" ADD COLUMN "recurrenceId" TEXT;

-- AddForeignKey
ALTER TABLE "ExpenseCategoryPattern" ADD CONSTRAINT "ExpenseCategoryPattern_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "ExpenseRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
