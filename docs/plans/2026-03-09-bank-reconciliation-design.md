# Bank Reconciliation (Inter) — Design

## Overview

Manual bank reconciliation: admin fetches recent transactions from Inter bank API, reviews proposed matches against pending invoices, and confirms to mark as paid.

## Data Model

### New enum: `BankProvider`
- `INTER` (extensible for future banks)

### New table: `BankIntegration`
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| clinicId | String | FK → Clinic, unique per provider |
| provider | BankProvider | Default INTER |
| clientId | String | OAuth2 client ID |
| clientSecret | String | Encrypted |
| certificate | String | PEM content, encrypted |
| privateKey | String | PEM content, encrypted |
| accountNumber | String? | Optional account identifier |
| isActive | Boolean | Default true |
| createdAt/updatedAt | DateTime | |

Unique constraint: `[clinicId, provider]`

### New table: `BankTransaction`
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| clinicId | String | FK → Clinic |
| bankIntegrationId | String | FK → BankIntegration |
| externalId | String | Bank's transaction ID, prevents duplicates |
| date | DateTime | Transaction date |
| amount | Decimal(10,2) | Transaction amount |
| description | String | Raw description from bank |
| payerName | String? | Extracted payer name |
| type | String | CREDIT or DEBIT |
| reconciledInvoiceId | String? | FK → Invoice, set when confirmed |
| reconciledAt | DateTime? | |
| reconciledByUserId | String? | FK → User |
| createdAt | DateTime | |

Unique constraint: `[clinicId, externalId]`

## Architecture

```
src/lib/bank-reconciliation/
  ├── inter-client.ts      # Inter API: OAuth2 + mTLS, fetch statements
  ├── matcher.ts           # Pure: match transactions → invoices, rank by name
  ├── encryption.ts        # AES-256-GCM encrypt/decrypt for secrets
  ├── types.ts             # Shared types
  ├── index.ts             # Barrel
  ├── matcher.test.ts      # TDD tests for matching logic
  └── encryption.test.ts   # TDD tests for encryption
```

## Flow

1. Admin configures integration (client_id, secret, certs) at `/financeiro/conciliacao`
2. Clicks "Buscar Transações" → `POST /api/financeiro/conciliacao/fetch`
   - Fetches last 30 days from Inter API
   - Stores new CREDIT transactions in `BankTransaction` (skips duplicates)
3. UI shows unreconciled transactions with match suggestions
   - Matches by exact amount vs PENDENTE/ENVIADO invoices
   - Ranks by name similarity (payerName vs patient motherName/fatherName)
   - Confidence: green (exact name), yellow (partial), red (no match)
4. Admin reviews, confirms/adjusts matches
5. "Confirmar" → `POST /api/financeiro/conciliacao/reconcile`
   - Marks invoices as PAGO with paidAt
   - Links transaction to invoice

## API Routes

- `POST /api/financeiro/conciliacao/integration` — Create/update integration config
- `GET /api/financeiro/conciliacao/integration` — Get integration config (secrets masked)
- `POST /api/financeiro/conciliacao/fetch` — Fetch transactions from bank
- `GET /api/financeiro/conciliacao/transactions` — List unreconciled + match suggestions
- `POST /api/financeiro/conciliacao/reconcile` — Confirm matches

## Matching Algorithm

```typescript
function matchTransactions(transactions, invoices): MatchResult[]
```
- Filter invoices with status PENDENTE or ENVIADO
- For each credit transaction, find invoices where amount matches exactly
- Rank candidates by name similarity: payerName vs (motherName, fatherName, patient name)
- Return ranked candidates with confidence score per transaction

## Encryption

- AES-256-GCM using `ENCRYPTION_KEY` env var (32-byte hex)
- Encrypt: clientSecret, certificate, privateKey before DB storage
- Decrypt on read when making API calls

## UI Pages

### `/financeiro/conciliacao`
- **Setup section**: Form for client_id, client_secret, certificate (textarea/upload), private key (textarea/upload), account number. Save button.
- **Fetch section**: "Buscar Transações" button, date range display (last 30 days)
- **Transactions table**: Date, amount, payer, description, proposed match, confidence badge, match selector, confirm checkbox
- **Action**: "Confirmar Selecionados" button
