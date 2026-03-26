-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseFrequency" AS ENUM ('MONTHLY', 'YEARLY');

-- AlterEnum
ALTER TYPE "TransactionDismissReason" ADD VALUE 'PERSONAL_EXPENSE';
ALTER TYPE "TransactionDismissReason" ADD VALUE 'TRANSFER';

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "categoryId" TEXT,
    "recurrenceId" TEXT,
    "description" TEXT NOT NULL,
    "supplierName" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" "ExpenseStatus" NOT NULL DEFAULT 'OPEN',
    "paymentMethod" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseRecurrence" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "supplierName" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" TEXT,
    "frequency" "ExpenseFrequency" NOT NULL DEFAULT 'MONTHLY',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "lastGeneratedDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseReconciliationLink" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledByUserId" TEXT,

    CONSTRAINT "ExpenseReconciliationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategoryPattern" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "categoryId" TEXT,
    "normalizedDescription" TEXT NOT NULL,
    "supplierName" TEXT,
    "matchCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategoryPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseCategory_clinicId_idx" ON "ExpenseCategory"("clinicId");
CREATE UNIQUE INDEX "ExpenseCategory_clinicId_name_key" ON "ExpenseCategory"("clinicId", "name");

-- CreateIndex
CREATE INDEX "Expense_clinicId_idx" ON "Expense"("clinicId");
CREATE INDEX "Expense_clinicId_status_idx" ON "Expense"("clinicId", "status");
CREATE INDEX "Expense_clinicId_dueDate_idx" ON "Expense"("clinicId", "dueDate");
CREATE INDEX "Expense_clinicId_categoryId_idx" ON "Expense"("clinicId", "categoryId");
CREATE INDEX "Expense_recurrenceId_idx" ON "Expense"("recurrenceId");

-- CreateIndex
CREATE INDEX "ExpenseRecurrence_clinicId_idx" ON "ExpenseRecurrence"("clinicId");
CREATE INDEX "ExpenseRecurrence_clinicId_active_idx" ON "ExpenseRecurrence"("clinicId", "active");

-- CreateIndex
CREATE INDEX "ExpenseReconciliationLink_expenseId_idx" ON "ExpenseReconciliationLink"("expenseId");
CREATE INDEX "ExpenseReconciliationLink_clinicId_idx" ON "ExpenseReconciliationLink"("clinicId");
CREATE UNIQUE INDEX "ExpenseReconciliationLink_transactionId_expenseId_key" ON "ExpenseReconciliationLink"("transactionId", "expenseId");

-- CreateIndex
CREATE INDEX "ExpenseCategoryPattern_clinicId_idx" ON "ExpenseCategoryPattern"("clinicId");
CREATE UNIQUE INDEX "ExpenseCategoryPattern_clinicId_normalizedDescription_key" ON "ExpenseCategoryPattern"("clinicId", "normalizedDescription");

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "ExpenseRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpenseRecurrence" ADD CONSTRAINT "ExpenseRecurrence_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExpenseReconciliationLink" ADD CONSTRAINT "ExpenseReconciliationLink_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseReconciliationLink" ADD CONSTRAINT "ExpenseReconciliationLink_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseReconciliationLink" ADD CONSTRAINT "ExpenseReconciliationLink_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseReconciliationLink" ADD CONSTRAINT "ExpenseReconciliationLink_reconciledByUserId_fkey" FOREIGN KEY ("reconciledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpenseCategoryPattern" ADD CONSTRAINT "ExpenseCategoryPattern_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseCategoryPattern" ADD CONSTRAINT "ExpenseCategoryPattern_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
