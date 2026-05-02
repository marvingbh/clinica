-- Cleanup script for the group-session duplicate-creation bug.
--
-- Scope:
--   1. Generic: deletes duplicate (groupId, patientId, scheduledAt) appointments
--      across the entire database. Caused by a race in the "add to group" flow
--      that ran the regenerate endpoint twice in parallel. Fixed in code by
--      MemberScopeDialog disable + drop of regen-on-409 + skipDuplicates +
--      partial unique index (migration 20260502000000_unique_group_patient_session).
--      For each duplicate tuple we keep one row, preferring (in order):
--        a) the row already attached to an InvoiceItem
--        b) the row whose status is FINALIZADO > CONFIRMADO > AGENDADO > others
--        c) the older createdAt
--      InvoiceItems on losing rows are deleted, and parent invoice totals
--      are recomputed so patients are not double-billed.
--
--   2. Luiza-specific: adjusts the April 2026 invoice for patient
--      Luiza David Meireles de Sousa. The 5/5 session was wrongly billed in
--      April; we remove that line and the matching 24/03 CREDITO line, free
--      the SessionCredit to be re-applied, and recompute April's totals
--      (the invoice ends as zero-value with one session + one credit).
--      The May invoice is NOT deleted — re-running "Gerar" / "Recalcular"
--      from the UI on the existing May invoice will pick up 5/5 and any
--      missing items in place, preserving the invoice id and metadata.
--
-- Run locally:
--   docker exec -i clinica_db psql -U clinica -d clinica_dev < scripts/fix-group-session-duplicates.sql
-- Run on prod (after local verification):
--   psql "$DATABASE_URL_PROD" < scripts/fix-group-session-duplicates.sql

\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== BEFORE: duplicate group appointments by tuple ==='
SELECT "groupId", "patientId", "scheduledAt", COUNT(*) AS copies
FROM "Appointment"
WHERE "groupId" IS NOT NULL AND "patientId" IS NOT NULL
GROUP BY "groupId", "patientId", "scheduledAt"
HAVING COUNT(*) > 1
ORDER BY copies DESC, "scheduledAt"
LIMIT 25;

-- ============================================================
-- 1. Generic duplicate cleanup
-- ============================================================

-- Identify the loser rows (rn > 1 within each duplicate tuple).
CREATE TEMP TABLE _appt_dup_losers AS
WITH ranked AS (
  SELECT
    a.id,
    ROW_NUMBER() OVER (
      PARTITION BY a."groupId", a."patientId", a."scheduledAt"
      ORDER BY
        CASE WHEN EXISTS (SELECT 1 FROM "InvoiceItem" ii WHERE ii."appointmentId" = a.id) THEN 0 ELSE 1 END,
        CASE a.status
          WHEN 'FINALIZADO' THEN 0
          WHEN 'CONFIRMADO' THEN 1
          WHEN 'AGENDADO'   THEN 2
          ELSE 3
        END,
        a."createdAt",
        a.id
    ) AS rn
  FROM "Appointment" a
  WHERE a."groupId" IS NOT NULL AND a."patientId" IS NOT NULL
)
SELECT id FROM ranked WHERE rn > 1;

\echo ''
\echo 'Loser appointments to delete (count, by group):'
SELECT a."groupId", COUNT(*) AS copies
FROM "Appointment" a
JOIN _appt_dup_losers l ON l.id = a.id
GROUP BY a."groupId"
ORDER BY copies DESC;

-- Snapshot invoices touched, so we can recompute totals afterwards.
CREATE TEMP TABLE _affected_invoices AS
SELECT DISTINCT ii."invoiceId"
FROM "InvoiceItem" ii
JOIN _appt_dup_losers l ON l.id = ii."appointmentId";

\echo ''
\echo 'Invoices that will lose at least one item:'
SELECT i.id, i."referenceYear", i."referenceMonth", i.status,
       i."patientId", i."totalAmount"
FROM "Invoice" i
JOIN _affected_invoices a ON a."invoiceId" = i.id
ORDER BY i."referenceYear", i."referenceMonth";

-- Drop the InvoiceItems pointing at duplicates.
DELETE FROM "InvoiceItem"
WHERE "appointmentId" IN (SELECT id FROM _appt_dup_losers);

-- Drop the duplicate appointments themselves.
DELETE FROM "Appointment"
WHERE id IN (SELECT id FROM _appt_dup_losers);

-- Recompute totals for the affected invoices (other than ones we surgery
-- explicitly below).
UPDATE "Invoice" inv SET
  "totalSessions"  = COALESCE((
    SELECT SUM(quantity)::int FROM "InvoiceItem"
    WHERE "invoiceId" = inv.id
      AND type IN ('SESSAO_REGULAR','SESSAO_EXTRA','SESSAO_GRUPO','REUNIAO_ESCOLA')
  ), 0),
  "creditsApplied" = COALESCE((
    SELECT (-SUM(quantity))::int FROM "InvoiceItem"
    WHERE "invoiceId" = inv.id AND type = 'CREDITO'
  ), 0),
  "extrasAdded"    = COALESCE((
    SELECT SUM(quantity)::int FROM "InvoiceItem"
    WHERE "invoiceId" = inv.id AND type = 'SESSAO_EXTRA'
  ), 0),
  "totalAmount"    = COALESCE((
    SELECT SUM(total) FROM "InvoiceItem" WHERE "invoiceId" = inv.id
  ), 0)
WHERE inv.id IN (SELECT "invoiceId" FROM _affected_invoices);

DROP TABLE _appt_dup_losers;
DROP TABLE _affected_invoices;

-- ============================================================
-- 2. Luiza-specific surgery (April + May 2026)
-- Idempotent: the DELETE/UPDATE statements no-op when already applied.
-- ============================================================

-- Clinic / patient / invoice IDs:
--   patient   = cml48q7nt0050nxittot7tvla  (Luiza David Meireles de Sousa)
--   april inv = cmnj0fy0e00anl70413tucn7v
--   may inv   = cmootb9nh002gl704pbvlaxsf

-- 2a. Remove the 5/5 session line from April.
DELETE FROM "InvoiceItem" WHERE id = 'cmnj8uctn000bld04veysdbyn';

-- 2b. Free the 24/03 SessionCredit (was paired with the 5/5 line).
UPDATE "SessionCredit"
SET "consumedByInvoiceId" = NULL, "consumedAt" = NULL
WHERE id = 'cmn4xgma70001lb0499ukupmx';

-- 2c. Remove the matching CREDITO line item from April.
DELETE FROM "InvoiceItem" WHERE id = 'cmnj8ud3x000hld04z3bpd8sv';

-- 2d. Recompute April invoice totals.
UPDATE "Invoice"
SET "totalSessions"  = COALESCE((
      SELECT SUM(quantity)::int FROM "InvoiceItem"
      WHERE "invoiceId" = 'cmnj0fy0e00anl70413tucn7v'
        AND type IN ('SESSAO_REGULAR','SESSAO_EXTRA','SESSAO_GRUPO','REUNIAO_ESCOLA')
    ), 0),
    "creditsApplied" = COALESCE((
      SELECT (-SUM(quantity))::int FROM "InvoiceItem"
      WHERE "invoiceId" = 'cmnj0fy0e00anl70413tucn7v'
        AND type = 'CREDITO'
    ), 0),
    "extrasAdded"    = COALESCE((
      SELECT SUM(quantity)::int FROM "InvoiceItem"
      WHERE "invoiceId" = 'cmnj0fy0e00anl70413tucn7v'
        AND type = 'SESSAO_EXTRA'
    ), 0),
    "totalAmount"    = COALESCE((
      SELECT SUM(total) FROM "InvoiceItem"
      WHERE "invoiceId" = 'cmnj0fy0e00anl70413tucn7v'
    ), 0)
WHERE id = 'cmnj0fy0e00anl70413tucn7v';

-- 2e. May invoice is intentionally NOT deleted. After the generic dedup
--     step above, any duplicate items pointing at deleted appointments
--     have already been removed and the invoice totals recomputed.
--     Re-run "Gerar" / "Recalcular" from the UI on the May invoice to
--     pick up the 5/5 session that became uninvoiced after step 2a.

\echo ''
\echo '=== AFTER ==='
\echo 'Remaining duplicate group appointments (expect 0):'
SELECT COUNT(*) AS remaining FROM (
  SELECT 1 FROM "Appointment"
  WHERE "groupId" IS NOT NULL AND "patientId" IS NOT NULL
  GROUP BY "groupId", "patientId", "scheduledAt"
  HAVING COUNT(*) > 1
) t;

\echo 'Luiza April invoice (expect totalAmount=0, 1 session + 1 credit):'
SELECT id, status, "totalSessions", "creditsApplied", "extrasAdded", "totalAmount"
FROM "Invoice" WHERE id = 'cmnj0fy0e00anl70413tucn7v';

\echo 'Luiza April items (expect 14/4 + 17/03 credit only):'
SELECT id, "appointmentId", type, total, description
FROM "InvoiceItem" WHERE "invoiceId" = 'cmnj0fy0e00anl70413tucn7v'
ORDER BY id;

\echo 'Luiza May invoice (kept; recalculate from UI to pick up 5/5):'
SELECT id, status, "totalSessions", "creditsApplied", "totalAmount"
FROM "Invoice" WHERE id = 'cmootb9nh002gl704pbvlaxsf';

\echo 'Luiza May invoice items (expect duplicates already gone, 5/5 still missing):'
SELECT ii.id, ii."appointmentId", ii.type, ii.total, a."scheduledAt"
FROM "InvoiceItem" ii
LEFT JOIN "Appointment" a ON a.id = ii."appointmentId"
WHERE ii."invoiceId" = 'cmootb9nh002gl704pbvlaxsf'
ORDER BY a."scheduledAt" NULLS LAST;

\echo 'Luiza credits (expect 24/03 freed):'
SELECT id, reason, "consumedByInvoiceId", "consumedAt"
FROM "SessionCredit" WHERE "patientId" = 'cml48q7nt0050nxittot7tvla'
ORDER BY "createdAt";

COMMIT;
