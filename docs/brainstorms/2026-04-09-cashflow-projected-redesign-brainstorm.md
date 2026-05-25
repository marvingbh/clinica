# Brainstorm: Cash Flow Projected Mode Redesign

**Date:** 2026-04-09
**Status:** Ready for planning

## What We're Building

Redesign the cash flow "Projetado" mode to blend reality with projections. The current view only estimates from appointments and ignores existing invoices, paid expenses, and the actual bank balance. The new view should show what already happened + what will happen.

## Key Decisions

1. **Starting balance** = same as "Realizado" mode (bank balance or calculated from transactions)
2. **Entries**: past dates use real data (paid invoices, paid expenses), future dates use projections (pending invoices, appointment estimates, recurring expenses)
3. **Summary cards split into executed vs projected**:
   - **Receita Recebida** — paid invoices in the period
   - **Receita Projetada** — pending invoices + appointment-based estimates
   - **Despesas Executadas** — already paid expenses
   - **Despesas Projetadas** — open/overdue + future recurring expenses
   - **Impostos Estimados** — keep as-is
   - **Repasse** — use actual invoice data when available, estimate otherwise
4. **Sobra clínica** = (Receita total) - (Despesas total) - (Impostos) - (Repasse)
5. **Invoice-first projection**: when invoices exist for a patient+month, use invoice amounts. Fall back to appointment estimates only when no invoice exists.
6. **Recurring expenses**: only project if not yet created/paid for that period.

## Why This Approach

- The user needs to see a realistic picture: "I have R$X in the bank, R$Y came in, R$Z is still expected, R$W in bills to pay"
- Splitting executed vs projected makes it clear what's fact vs estimate
- Using the realized mode's starting balance anchors everything to reality

## Open Questions

None — all resolved during brainstorming.
