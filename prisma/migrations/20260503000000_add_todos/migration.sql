-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "recurrenceId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "day" DATE NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodoRecurrence" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "recurrenceType" "RecurrenceType" NOT NULL,
    "recurrenceEndType" "RecurrenceEndType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "occurrences" INTEGER,
    "exceptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastGeneratedDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TodoRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Todo_clinicId_idx" ON "Todo"("clinicId");

-- CreateIndex
CREATE INDEX "Todo_professionalProfileId_idx" ON "Todo"("professionalProfileId");

-- CreateIndex
CREATE INDEX "Todo_clinicId_day_idx" ON "Todo"("clinicId", "day");

-- CreateIndex
CREATE INDEX "Todo_recurrenceId_idx" ON "Todo"("recurrenceId");

-- CreateIndex
CREATE INDEX "TodoRecurrence_clinicId_idx" ON "TodoRecurrence"("clinicId");

-- CreateIndex
CREATE INDEX "TodoRecurrence_professionalProfileId_idx" ON "TodoRecurrence"("professionalProfileId");

-- CreateIndex
CREATE INDEX "TodoRecurrence_isActive_idx" ON "TodoRecurrence"("isActive");

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "TodoRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoRecurrence" ADD CONSTRAINT "TodoRecurrence_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoRecurrence" ADD CONSTRAINT "TodoRecurrence_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
