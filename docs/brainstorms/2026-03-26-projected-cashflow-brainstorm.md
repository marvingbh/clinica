---
date: 2026-03-26
topic: projected-cashflow
---

# Projected Cash Flow — Realistic Forecasting

## What We're Building

Rewrite the "Projetado" cash flow view to project from real data: scheduled appointments (revenue), recurring expenses (outflows), estimated repasse (professional payouts), and estimated taxes based on the clinic's tax regime. Today it only looks at open invoices and open expenses, which gives meaningless projections for future months where invoices haven't been generated yet.

## Why This Approach

The current projection relies on existing invoice/expense records. But for next month, invoices don't exist yet — they're generated at month end. The real leading indicator is **scheduled appointments** (the clinic's actual order book). Combined with historical cancellation rates, recurring expenses, and tax regime rules, this gives a realistic cash flow forecast.

## Key Decisions

- **Revenue from appointments, not invoices**: Count AGENDADO/CONFIRMADO appointments × session fee, discounted by clinic-wide cancellation rate. This is the source of truth for future revenue.
- **Cancellation rate is clinic-wide**: Not per-patient. Computed from historical data (last 6 months).
- **Tax auto-calculated from NfseConfig.regimeTributario**: MEI = fixed DAS, Simples Nacional = bracket from Anexo III/V based on RBT12 (last 12 months revenue), Lucro Presumido = standard rates (ISS + PIS + COFINS + IRPJ + CSLL ≈ 11-17%).
- **Repasse estimated per-professional**: Projected revenue per professional × (1 - clinic tax %) × professional's repassePercentage.
- **Recurring expenses projected from templates**: Same as today, but now alongside appointment-based revenue this gives a complete picture.

## Projection Formula

```
Projected Revenue = Σ(scheduled appointments × session fee) × (1 - cancellation_rate)

Projected Tax = f(regime, projected_revenue)
  - MEI: fixed monthly DAS
  - Simples Nacional: rate from Anexo III/V bracket based on RBT12
  - Lucro Presumido: ISS + PIS(0.65%) + COFINS(3%) + IRPJ(4.8%) + CSLL(2.88%) ≈ 11-17%

Projected Repasse = Σ per professional:
  (professional's appointments × session fee × (1 - cancellation_rate))
  × (1 - clinic_tax_%)
  × professional's repasse_%

Projected Expenses = open expenses + recurring expense projections

Net Cash Flow = Projected Revenue - Projected Tax - Projected Repasse - Projected Expenses
```

## Open Questions

- Should the Simples Nacional bracket rates be stored in the database (configurable) or hardcoded? The brackets change occasionally (last change was 2018). Hardcoded with a version date is simpler.
- Should group therapy sessions be included in the revenue projection? They have different pricing (per-group, not per-patient).

## Next Steps

→ Implement directly — scope is clear enough to skip formal planning.
