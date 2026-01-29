-- AlterTable
ALTER TABLE "AvailabilityRule" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "AvailabilityRule_isActive_idx" ON "AvailabilityRule"("isActive");
