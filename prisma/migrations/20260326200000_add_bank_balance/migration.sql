ALTER TABLE "BankIntegration" ADD COLUMN "lastKnownBalance" DECIMAL(10,2);
ALTER TABLE "BankIntegration" ADD COLUMN "balanceFetchedAt" TIMESTAMP(3);
