---
topic: NFS-e Integration (Nota Fiscal de Servico Eletronica)
date: 2026-03-15
status: complete
---

# NFS-e Integration Brainstorm

## What We're Building

Automated NFS-e (Nota Fiscal de Servico Eletronica) emission integrated with the existing invoice module. Clinics can emit NFS-e directly from the system when invoices are paid, eliminating the need to use external prefecture portals or accounting software.

## Why This Approach

### Provider: NFS-e Nacional (gov.br / ADN)

Chose the national NFS-e system (Ambiente de Dados Nacional) over aggregators like eNotas/Focus NFe because:
- **Free** — no per-nota cost, which matters for small clinics
- **Government-backed** — increasing municipality adoption; will eventually be the standard
- **Direct integration** — no middleman dependency or vendor lock-in

**Trade-off:** Not all municipalities have migrated yet. The system should gracefully handle municipalities not yet on ADN and fall back to manual NF tracking.

### Emission Trigger: Manual per invoice

User clicks "Emitir NFS-e" on each invoice. This is safest for v1:
- Therapist/admin reviews data before emitting (CNPJ, value, description)
- Avoids accidental emissions that require cancellation (bureaucratic)
- Can add batch and auto-emit modes later

### Emitter: The clinic entity

The clinic's CNPJ and municipal registration appear as "prestador" on the NFS-e. This is the standard model for therapy clinics — the clinic bills patients, not individual professionals.

### Service Configuration: Clinic defaults with per-invoice override

Default service code, CNAE, ISS aliquota, and description configured once in clinic settings. Before emitting, the user can override these per invoice. This handles:
- Multi-specialty clinics (different service codes per professional type)
- Edge cases (different descriptions for group vs individual sessions)
- Simple default flow for most invoices

## Key Decisions

1. **NFS-e Nacional (ADN)** — free, government API, growing coverage
2. **Manual emission** — "Emitir NFS-e" button per invoice, review before emitting
3. **Clinic as emitter** — clinic CNPJ on the NFS-e, not individual professionals
4. **Clinic-level defaults + per-invoice override** for service code, CNAE, ISS, description
5. **Graceful degradation** — if municipality not on ADN, keep manual NF toggle (existing behavior)
6. **Follow bank reconciliation pattern** — encrypted credentials, HTTP client module, domain module in `src/lib/nfse/`
7. **Extend existing Invoice model** — add NFS-e fields (numero, codigo verificacao, status, protocolo) rather than creating a separate model

## Existing Codebase Context

- **Manual NF already exists**: `notaFiscalEmitida` boolean, `notaFiscalPdf` Bytes on Invoice model. `NfSection.tsx` component. These become the fallback when ADN is unavailable.
- **Bank reconciliation pattern**: Encrypted per-clinic credentials in DB (`BankIntegration` model), HTTP client module, domain module with pure logic. Reuse this architecture.
- **Patient CPF exists**: `cpf` field on Patient model (optional). Required for NFS-e "tomador" data.
- **Clinic has no tax fields yet**: Need to add CNPJ, inscricao municipal, codigo municipio (IBGE), regime tributario to Clinic model.
- **`ENCRYPTION_KEY` env var** already exists for bank reconciliation — reuse for NFS-e credentials.

## Scope for v1

### In scope
- Clinic NFS-e settings (CNPJ, inscricao municipal, municipality, service defaults)
- NFS-e credential storage (certificado digital A1 or API token, depending on ADN auth)
- "Emitir NFS-e" button on invoice detail with pre-emission review/override
- NFS-e status tracking on invoices (PENDENTE → EMITIDA or ERRO)
- View emitted NFS-e details (number, verification code, PDF link)
- Cancel NFS-e
- Audit logging for all NFS-e actions

### Out of scope (future)
- Auto-emit on PAGO status
- Batch emission ("Emitir todas do mes")
- Per-professional emission (professional as prestador)
- RPS (Recibo Provisorio de Servicos) for offline emission
- NFS-e reports/dashboards
- Integration with accounting software (export for contador)

## Open Questions

_None — all key decisions resolved._
