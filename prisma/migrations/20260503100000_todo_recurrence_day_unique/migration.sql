-- Prevent duplicate child todos for the same (recurrenceId, day) pair.
-- The cron extension job retries are now safe: a duplicate insert is silently
-- skipped via skipDuplicates instead of creating a second occurrence.
-- Partial index because standalone todos (recurrenceId IS NULL) intentionally
-- allow many same-day entries per assignee.

-- Drop the standalone clinicId index — it's covered by the composite (clinicId, day) index.
DROP INDEX IF EXISTS "Todo_clinicId_idx";

CREATE UNIQUE INDEX "Todo_recurrenceId_day_key"
  ON "Todo" ("recurrenceId", "day")
  WHERE "recurrenceId" IS NOT NULL;
