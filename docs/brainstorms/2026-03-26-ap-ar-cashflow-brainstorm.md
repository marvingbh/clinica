---
date: 2026-03-26
topic: ap-ar-cashflow
---

# AP/AR & Cash Flow Management for Clinica

## What We're Building

A lightweight financial management layer within the existing Clinica multi-tenant SaaS that gives clinic owners/admins a complete picture of their clinic's finances. This adds the **expenses side** (Accounts Payable) alongside the already-built **revenue side** (invoices, session credits, repasse), plus a **cash flow dashboard** that combines both into forward-looking projections.

The target user is a clinic owner who currently tracks expenses in spreadsheets or not at all, and wants to answer: "Is my clinic profitable?", "What bills are due?", and "Will I have enough cash next month?"

## Why This Approach

The original spec described a generic enterprise AP/AR platform with ML-based AI, complex reconciliation, multi-company support, and a full tax engine. We scoped it down to what clinic owners actually need:

- **Clinics are simple financially**: ~20-50 expense transactions/month, mostly recurring (rent, utilities, software, supplies). No need for enterprise features.
- **Revenue side already exists**: Invoices, NFS-e, bank reconciliation with Inter, repasse, session credits, financial dashboard with KPIs — all production-ready.
- **AI is deferred**: Simple pattern matching ("description contains X → category Y") covers 90% of clinic transactions. Claude API integration is a future differentiator once there's transaction volume.
- **Tax engine not needed**: Clinics use accountants. NFS-e (ISS) is already handled. No need to replicate tax jurisdiction rules.
- **Expenses are clinic-level**: No per-professional expense allocation. Profitability = clinic revenue - clinic expenses.

### Approaches Considered

**A) Full spec implementation** — Build everything from the 15-section spec. Rejected: 90% is YAGNI for clinics. Would take months and add complexity for features no one uses.

**B) Expenses + cash flow only (chosen)** — Add the AP side, connect it to existing AR, build a unified cash flow view. Ships value fast, builds on existing infrastructure.

**C) Cash flow dashboard only** — Skip expense tracking, just project from invoices. Rejected: without expenses, profitability is unknowable. The dashboard needs both sides.

## Key Decisions

- **Expenses are clinic-level, not per-professional**: Simplifies the model. Profitability is calculated for the whole clinic. A professional's "profitability" can still be approximated from repasse data.
- **Three entry points for expenses**: Manual entry, OFX/CSV file import, and extending the existing Inter API integration to pull outgoing transactions.
- **Reuse existing bank infra**: `BankTransaction` model already exists for Inter. Extend it to also capture/match outgoing transactions against expenses (not just invoices).
- **Simple pattern matching first, AI later**: Categorization suggestions based on description similarity to previously categorized expenses. No ML, no external API calls.
- **Categories are configurable master data**: Seeded with common clinic categories (rent, utilities, supplies, software, insurance, cleaning, maintenance, marketing, training, professional fees, taxes, other). Clinic can add/edit their own.
- **Recurring expenses auto-generate**: Similar pattern to `AppointmentRecurrence` — define a template, system generates future entries on a cron job or on-demand.
- **Cash flow projections use simple arithmetic**: Open invoices (expected in) + open expenses (expected out) + recurring entries projected forward. No ML forecasting. Seasonality can be a future enhancement.
- **No approval workflows**: Most clinics have 1-2 people managing finances. An expense is created and tracked, not routed for approval.
- **No supplier module**: Supplier is just a name field on the expense. If a clinic wants to track suppliers, they type the name consistently. A future autocomplete can suggest from past names.

## Phased Delivery

### Phase 1 — Accounts Payable (Foundation)

**New Prisma models:**
- `Expense` — clinicId, description, supplierName, categoryId, amount, dueDate, paidAt, status (DRAFT/OPEN/PAID/OVERDUE/CANCELLED), paymentMethod, notes, recurrenceId, bankTransactionId
- `ExpenseCategory` — clinicId, name, color, icon, isDefault (seeded categories)
- `ExpenseRecurrence` — clinicId, templateFields, frequency (MONTHLY/WEEKLY/YEARLY), nextDueDate, active

**Domain module:** `src/lib/expenses/` — status transitions, recurrence generation, category defaults, format helpers

**API routes:** CRUD for expenses, categories, recurrences. Extend bank reconciliation to match outgoing transactions to expenses.

**UI:** Expenses list with filters (status, category, period, supplier), create/edit form, recurring expense setup, category management in settings.

**RBAC:** New feature `"expenses"` with READ/WRITE access levels.

### Phase 2 — Cash Flow Dashboard

**Unified financial view:** Combine invoice data (AR) + expense data (AP) + bank balances into a single dashboard.

**Views:** Daily, weekly, monthly. Actual (past) + projected (future, 30/60/90 days).

**Projections:** Sum of open invoices by due date (inflow) + sum of open/recurring expenses by due date (outflow) + current bank balance = projected balance per day.

**Alerts:** Overdue expenses, projected negative balance, large upcoming payments.

**Domain module:** `src/lib/cashflow/` — projection calculator, alert rules, period aggregation.

### Phase 3 — Import & Smart Matching

**OFX/CSV parser:** Parse bank statement files, normalize transactions, detect duplicates.

**Pattern matching:** When an imported transaction doesn't match an existing expense, suggest category + supplier based on description similarity to past expenses (Levenshtein or simple contains matching).

**Bulk review UI:** List of unmatched transactions with suggested categorizations. User accepts, edits, or dismisses each.

### Phase 4 (Future) — AI Layer

- Claude API for classifying unrecognized transactions
- Natural language financial insights ("Your electricity costs increased 23% vs last quarter")
- Anomaly detection (unusual expenses, duplicated charges)
- Smarter cash flow forecasting using historical payment patterns

## Resolved Questions

- **Partial payments**: No. Expenses are binary — PAID or UNPAID. Simplifies status to DRAFT/OPEN/PAID/OVERDUE/CANCELLED without partial states.
- **Attachments**: Deferred. No file upload infra exists. Can be added in a future phase.
- **Dashboard location**: New tab within existing `/financeiro` page, alongside resumo/cobranca/atendimento/analise.
- **Bank statement import**: OFX/CSV parser for file uploads + extend existing Inter API to pull outgoing transactions. Architecture should be ready for future Open Banking (Open Finance Brasil) API integration — use a provider abstraction layer.

## Next Steps

→ `/ce:plan` Phase 1 (Accounts Payable foundation) for implementation details
