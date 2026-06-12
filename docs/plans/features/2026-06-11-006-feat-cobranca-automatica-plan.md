---
title: "feat: Cobrança integrada (payment links Pix/cartão, conciliação e régua de cobrança via Stripe Connect)"
type: feat
status: draft
date: 2026-06-11
slug: cobranca-automatica
priority: 8
complexity: XL
---

# feat: Cobrança integrada — Stripe Connect (Pix/cartão), links de pagamento e régua de cobrança

## 1. Contexto de Negócio

### Problema

A Clinica hoje fecha o ciclo `sessão → fatura → NFS-e`, mas **não cobra**. A clínica gera a
fatura, manda o PDF por WhatsApp manualmente e espera o Pix cair na conta — depois concilia o
extrato bancário à mão (módulo de conciliação existente). Inadimplência é a dor crônica da
terapia mensalista: o paciente esquece, o lembrete depende de disciplina humana, e a secretária
gasta horas por mês cobrando pessoalmente.

### Evidência de mercado

Todos os concorrentes líderes monetizam o trilho de pagamento:

- **PsicoManager (PsicoBank)** — flagship do líder de mercado BR
- **Corpora (Corpora Pay)**, **iClinic (iClinic Pay)**, **Doctoralia Payments**, **Clinicorp**, **SimplesAgenda**
- **SimplePractice (AutoPay)** e **Jane App (Jane Payments)** no mercado internacional

O Stripe já está no stack (assinaturas SaaS via `src/lib/stripe.ts` + webhook
`/api/webhooks/stripe`). Adquirência via **Stripe Connect (Standard)** é código puro — cada
clínica recebe na própria conta Stripe — e abre receita de take-rate para a plataforma
(application fee configurável por Plano no superadmin).

### Usuários-alvo

| Persona | O que ganha |
|---|---|
| **ADMIN da clínica** | Onboarding Stripe, botão "Cobrar" por fatura/lote, régua de cobrança automática, conciliação automática do que foi pago via link |
| **PROFESSIONAL** | Vê o status de cobrança das próprias faturas (escopo já garantido pelo módulo financeiro) |
| **Paciente/responsável** | Recebe link estável por WhatsApp/e-mail, paga com Pix ou cartão em 2 cliques |
| **Superadmin** | Painel de status de conexão por clínica + take-rate por Plano |

### Métricas de sucesso

- ≥ 50% das faturas com link gerado pagas em até 3 dias do envio
- Redução do tempo médio fatura→pagamento (medível por `Invoice.createdAt` → `paidAt`)
- % de faturas vencidas (chip do dashboard) caindo mês a mês nas clínicas com régua ativa
- Zero pagamentos contados em dobro na conciliação (pagamento Stripe + repasse no extrato)

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **ADMIN**, conecto a clínica ao Stripe em Configurações → Pagamentos e vejo o status da conta.
2. Como **ADMIN/PROFESSIONAL com `finances` WRITE**, clico **"Cobrar"** numa fatura e o sistema gera um link de pagamento (Pix + cartão, BRL) pelo saldo em aberto, enviando por WhatsApp/e-mail ou copiando manualmente.
3. Como **ADMIN**, seleciono várias faturas e uso **"Cobrar selecionadas"**.
4. Como **paciente**, abro o link, pago com Pix ou cartão e a fatura é baixada automaticamente.
5. Como **ADMIN**, configuro a **régua de cobrança** (D-3, D0, D+3, D+7), canais e máximo de tentativas; o cron diário envia lembretes com link, respeitando consentimento LGPD e opt-out por paciente.
6. Como **ADMIN**, ao importar o extrato vejo o repasse do Stripe reconhecido automaticamente — sem dupla contagem de receita.
7. Como **ADMIN**, ativo "Emitir NFS-e ao receber" e a nota sai sozinha quando o link é pago.
8. Como **superadmin**, defino o percentual de application fee por Plano e vejo quais clínicas estão conectadas.

### 2.2 Fluxos por papel

**ADMIN — onboarding (Configurações → aba "Pagamentos")**
1. Card "Receba por Pix e cartão" → botão **"Conectar com Stripe"**.
2. Backend cria conta Connect Standard (se ausente), grava `stripeConnectAccountId`, gera Account Link e redireciona para o onboarding do Stripe.
3. No retorno (`/admin/settings?tab=pagamentos&connect=return`), o status é sincronizado (`charges_enabled` → `ACTIVE`). Webhook `account.updated` mantém o status atualizado.
4. Status possíveis na UI: `Desconectado`, `Onboarding pendente`, `Ativo`, `Restrito` (com botão "Completar cadastro" reabrindo Account Link).
5. Botão **"Desconectar"**: desativa cobrança (status `DISCONNECTED`), mantém histórico de cobranças.

**ADMIN/PROFESSIONAL — cobrança individual (fatura)**
1. Na lista de faturas e no detalhe, botão **"Cobrar"** aparece quando: status da fatura ∈ {PENDENTE, ENVIADO, PARCIAL}, saldo em aberto > 0, conexão `ACTIVE`.
2. Modal "Cobrar fatura": valor (default = saldo em aberto; campo editável para **valor negociado** ≤ saldo), validade do link (default = config da clínica), canais de envio (WhatsApp / E-mail / "somente copiar link").
3. Confirmação cria a cobrança (`PaymentCharge`), envia notificações com `{{paymentLink}}` e mostra o link para cópia.
4. Detalhe da fatura ganha seção **"Histórico de cobranças"**: criada → enviada → visualizada → paga/expirada/cancelada/reembolsada, com método (Pix/cartão), taxa Stripe e ações (Copiar link, Reenviar, Cancelar, Reembolsar).

**Paciente — pagamento (link estável)**
1. Recebe `https://app/api/public/pagar/{chargeId}?s={hmac}` (link interno estável — ver §3.6).
2. Ao abrir: registra `viewedAt`, gera/regenera a Stripe Checkout Session (Sessions expiram em no máx. 24h — o link interno não) e redireciona.
3. Paga com Pix ou cartão. Sucesso → `/pagar/obrigado`. Link expirado/cancelado/pago → `/pagar/indisponivel` com mensagem adequada.

**Sistema — conciliação automática**
1. Webhook `checkout.session.completed` (conta conectada) marca a cobrança como `PAGA`, grava método e taxas, cria `ReconciliationLink` com `source=STRIPE` e recalcula o status da fatura via `computeInvoiceStatus` (PAGO/PARCIAL).
2. Quando o repasse do Stripe aparece no extrato importado (Banco Inter), o módulo de conciliação reconhece a linha (matcher de payout) e sugere **"Repasse Stripe — não conciliar com faturas"** → dismissal com novo motivo `STRIPE_PAYOUT`. Receita não conta em dobro.
3. Reembolso disparado da Clinica chama a API de refund do Stripe na conta conectada; o webhook `charge.refunded` remove/reduz o `ReconciliationLink` STRIPE e reabre o saldo da fatura.

**Sistema — régua de cobrança (cron diário)**
1. `/api/jobs/dunning` roda 1×/dia (11:00 UTC = 08:00 BRT).
2. Para cada clínica com Connect `ACTIVE` + régua habilitada: seleciona faturas não pagas cuja `dueDate` + offset = hoje, respeita `maxAttempts`, consentimentos (`consentWhatsApp`/`consentEmail`), opt-out por paciente e idempotência (1 envio/fatura/dia).
3. Reusa a cobrança ABERTA existente (regenera a session sob demanda no link estável) ou cria uma nova se expirada.
4. Cada envio vira uma linha `Notification` (tipo `PAYMENT_REMINDER`) ligada à fatura.

**Superadmin**
- Lista de clínicas ganha coluna "Pagamentos" (status Connect).
- Edição de Plano ganha campo "Taxa da plataforma (%)" (`applicationFeePercent`).

### 2.3 Telas (layout)

1. **Configurações → aba "Pagamentos"** (`src/app/admin/settings`, novo `PaymentsTab.tsx`):
   - Card de status Connect (ícone + badge + CTA).
   - Form "Régua de cobrança" (react-hook-form + zod): toggle "Ativar régua", chips de offsets (D-3, D0, D+3, D+7 — editáveis como lista de inteiros), checkboxes WhatsApp/E-mail, "Máx. de tentativas por fatura", "Validade do link (dias)", toggle "Gerar cobrança automaticamente ao criar fatura mensal" (visível só para `billingMode=MONTHLY_FIXED`).
   - Toggle "Emitir NFS-e automaticamente ao receber pagamento" (visível se NfseConfig ativa).
2. **Financeiro → Faturas** (`faturas/page.tsx` + `InvoiceTableBody.tsx`):
   - Checkbox por linha + barra de ação flutuante "Cobrar selecionadas (N)".
   - Badge de cobrança por linha: `Link ativo`, `Link visualizado`, `Pago via Pix`, `Pago via cartão`, `Link expirado`.
   - Botão "Cobrar" no menu de ações da linha.
3. **Detalhe da fatura** (`InvoiceDetailModal.tsx` / `faturas/[id]`): seção "Cobranças" (timeline).
4. **Conciliação** (`/financeiro/conciliacao`): linhas CREDIT identificadas como payout Stripe mostram banner "Repasse Stripe identificado — R$ X de N pagamentos já conciliados" com botão "Marcar como repasse".
5. **Dashboard financeiro** (`DashboardResumo.tsx`): chip `⚠ 7 faturas vencidas · R$ 3.450,00 em aberto` → link para `/financeiro/faturas?vencidas=1`.
6. **Cadastro do paciente**: toggle "Não enviar cobranças automáticas" (opt-out da régua).
7. **Páginas públicas**: `/pagar/obrigado` e `/pagar/indisponivel` (sem shell autenticado).

### 2.4 Regras de negócio

- Moeda estritamente **BRL**; exibição via `formatCurrency` de `src/lib/financeiro/format.ts`.
- Valor da cobrança = saldo em aberto (`totalAmount` − Σ `ReconciliationLink.amount`), nunca maior. **Pagamento parcial por cartão não é permitido** — um link cobra o saldo integral; valor customizado (negociação/parcelas combinadas) é permitido se ≤ saldo.
- Apenas **uma cobrança ABERTA por fatura** por vez (criar nova cancela a anterior).
- **Fatura editada/recalculada** com cobrança ABERTA → cobrança cancelada automaticamente (Stripe session expirada via API) e fatura marcada para re-envio (badge "Link cancelado — gerar novo").
- Fatura `CANCELADO` ou `PAGO` → cobranças abertas são canceladas.
- Application fee = `floor(valorEmCentavos × applicationFeePercent / 100)` do Plano da clínica; 0 se Plano sem taxa.
- Clínica desconectada → botões de cobrança desabilitados com tooltip; histórico preservado; régua pausa.
- Régua respeita LGPD: WhatsApp só com `consentWhatsApp`, e-mail só com `consentEmail`; `dunningOptOut` do paciente bloqueia tudo (cobrança manual continua possível).
- Todos os fluxos auditados (`createAuditLog`): criação/cancelamento/reembolso de cobrança, conexão/desconexão Stripe, alteração da régua.
- Tenant isolation: todo lookup escopado por `clinicId`; webhook valida `event.account` ↔ `clinic.stripeConnectAccountId` **e** `metadata.clinicId`.

### 2.5 Edge cases

| Caso | Comportamento |
|---|---|
| Paciente abre link após `expiresAt` | `/pagar/indisponivel?motivo=expirado` — "Este link de pagamento expirou. Entre em contato com a clínica." |
| Paciente paga no exato momento em que a fatura é recalculada | Webhook ganha: pagamento registrado pelo valor da cobrança; se exceder o novo total, fatura fica PAGO e excedente aparece como sobre-pagamento no fluxo existente de devolução |
| Webhook duplicado (retry do Stripe) | Idempotente: `stripeCheckoutSessionId` único + status check + `@@unique([paymentChargeId, invoiceId])` |
| Pix confirmado assincronamente | Tratar `checkout.session.completed` com `payment_status="paid"` **e** `checkout.session.async_payment_succeeded` |
| Pagamento falhou (async) | `checkout.session.async_payment_failed` → cobrança volta a ABERTA com `failureReason`; histórico mostra tentativa falha |
| Clínica sem Plano (trial) | `applicationFeePercent` tratado como 0 |
| Refund parcial | `charge.refunded` traz `amount_refunded`; reduzir o `ReconciliationLink` proporcionalmente e recalcular status |
| Mesmo paciente, 2 faturas selecionadas no lote | 2 cobranças e 2 mensagens independentes (1 link por fatura) |
| Payout Stripe não bate com a soma dos pagamentos (taxa de payout, refund no meio) | Matcher não força: banner mostra diferença e o usuário decide; dismissal manual sempre disponível |
| `PROFESSIONAL` sem `finances` WRITE | Botões ocultos; rotas retornam 403 via `withFeatureAuth` |

### 2.6 Copy pt-BR (chaves principais)

- Aba: **"Pagamentos"** · Botões: **"Conectar com Stripe"**, **"Completar cadastro"**, **"Desconectar"**
- Status: `Desconectado` / `Onboarding pendente` / `Ativo` / `Restrito`
- Ações de fatura: **"Cobrar"**, **"Cobrar selecionadas"**, **"Copiar link"**, **"Reenviar cobrança"**, **"Cancelar cobrança"**, **"Reembolsar"**
- Toasts: `"Link de cobrança criado"`, `"Cobranças geradas para N faturas"`, `"Cobrança cancelada"`, `"Reembolso solicitado"`, `"Configurações de cobrança salvas"`
- Erros: `"Conecte a clínica ao Stripe para cobrar"`, `"Fatura sem saldo em aberto"`, `"Valor não pode exceder o saldo em aberto"`
- Chip: `"{n} faturas vencidas · {valor} em aberto"`
- Página pública: `"Pagamento confirmado! Obrigado."` / `"Este link de pagamento não está mais disponível."`
- Template WhatsApp (PAYMENT_LINK, default): `"Olá, {{patientName}}! Segue o link para pagamento da sua fatura de {{referenceMonth}} no valor de {{invoiceAmount}} (vencimento {{dueDate}}): {{paymentLink}} — {{clinicName}}"`
- Template WhatsApp (PAYMENT_REMINDER, default): `"Olá, {{patientName}}! Lembrete: sua fatura de {{invoiceAmount}} vence em {{dueDate}}. Pague por Pix ou cartão: {{paymentLink}} — {{clinicName}}"` (tom gentil, sem ameaça — texto editável por clínica em Notificações)

---

## 3. Design Técnico

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

**Novos enums:**

```prisma
enum StripeConnectStatus {
  DISCONNECTED
  ONBOARDING
  ACTIVE
  RESTRICTED
}

enum PaymentChargeStatus {
  ABERTA
  PAGA
  EXPIRADA
  CANCELADA
  REEMBOLSADA
}

enum ReconciliationSource {
  BANK
  STRIPE
}
```

**Enums alterados:**

```prisma
enum NotificationType {
  // ... existentes
  PAYMENT_LINK       // envio manual de link de cobrança
  PAYMENT_REMINDER   // régua de cobrança (dunning)
}

enum TransactionDismissReason {
  // ... existentes
  STRIPE_PAYOUT      // linha do extrato é repasse do Stripe (receita já conciliada)
}
```

**Novo modelo `PaymentCharge`** (uma cobrança = um link estável; sessions Stripe são efêmeras):

```prisma
model PaymentCharge {
  id                      String              @id @default(cuid())
  clinicId                String
  invoiceId               String
  status                  PaymentChargeStatus @default(ABERTA)
  amount                  Decimal             @db.Decimal(10, 2) // saldo cobrado na criação
  applicationFeeAmount    Decimal?            @db.Decimal(10, 2)
  stripeFeeAmount         Decimal?            @db.Decimal(10, 2) // taxa Stripe (balance transaction)
  netAmount               Decimal?            @db.Decimal(10, 2) // amount - stripeFee (usado no matcher de payout)
  paymentMethod           String?             // "pix" | "card"
  stripeCheckoutSessionId String?             @unique // session ATUAL (regenerável)
  stripePaymentIntentId   String?             @unique
  sessionCreatedAt        DateTime?
  regenerationCount       Int                 @default(0)
  expiresAt               DateTime            // validade do LINK (N dias, config da clínica)
  sentAt                  DateTime?
  viewedAt                DateTime?
  paidAt                  DateTime?
  canceledAt              DateTime?
  refundedAt              DateTime?
  failureReason           String?
  createdViaDunning       Boolean             @default(false)
  createdByUserId         String?
  payoutMatchedAt         DateTime?           // quando o repasse bancário absorveu esta cobrança
  createdAt               DateTime            @default(now())
  updatedAt               DateTime            @updatedAt

  clinic              Clinic               @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  invoice             Invoice              @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  createdByUser       User?                @relation("CreatedPaymentCharges", fields: [createdByUserId], references: [id], onDelete: SetNull)
  reconciliationLinks ReconciliationLink[]

  @@index([clinicId])
  @@index([invoiceId])
  @@index([clinicId, status])
  @@index([clinicId, status, expiresAt])
}
```

**Novo modelo `DunningConfig`** (1:1 com Clinic — Clinic já está grande demais para mais 6 campos):

```prisma
model DunningConfig {
  id                          String   @id @default(cuid())
  clinicId                    String   @unique
  enabled                     Boolean  @default(false)
  offsets                     Int[]    @default([-3, 0, 3, 7]) // dias relativos ao vencimento
  sendWhatsApp                Boolean  @default(true)
  sendEmail                   Boolean  @default(true)
  maxAttempts                 Int      @default(4)
  linkExpirationDays          Int      @default(7)
  autoChargeOnInvoiceCreation Boolean  @default(false) // mensalista: link automático ao gerar fatura
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt

  clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)
}
```

**Modelos alterados:**

```prisma
model Clinic {
  // + campos
  stripeConnectAccountId String?             @unique
  stripeConnectStatus    StripeConnectStatus @default(DISCONNECTED)
  // + relações
  paymentCharges PaymentCharge[]
  dunningConfig  DunningConfig?
}

model Plan {
  applicationFeePercent Decimal @default(0) @db.Decimal(5, 2) // take-rate da plataforma
}

model Patient {
  dunningOptOut Boolean @default(false) // opt-out da régua de cobrança
}

model NfseConfig {
  autoEmitOnPayment Boolean @default(false) // "Emitir NFS-e ao receber"
}

model Invoice {
  paymentCharges PaymentCharge[]
  notifications  Notification[]
}

model Notification {
  invoiceId String? // liga PAYMENT_LINK/PAYMENT_REMINDER à fatura (idempotência da régua)
  invoice   Invoice? @relation(fields: [invoiceId], references: [id], onDelete: SetNull)
  @@index([invoiceId])
  @@index([invoiceId, type, createdAt])
}

model User {
  createdPaymentCharges PaymentCharge[] @relation("CreatedPaymentCharges")
}

model ReconciliationLink {
  transactionId   String?              // ANTES: obrigatório. Agora nullable (pagamento Stripe não tem linha bancária)
  paymentChargeId String?
  source          ReconciliationSource @default(BANK)

  transaction   BankTransaction? @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  paymentCharge PaymentCharge?   @relation(fields: [paymentChargeId], references: [id], onDelete: Cascade)

  @@unique([paymentChargeId, invoiceId]) // NULLs distintos no Postgres — não afeta linhas BANK
  @@index([paymentChargeId])
}
```

**Migração** (autorada offline — NUNCA `prisma db push`/`migrate dev`; criar
`prisma/migrations/20260611000000_add_cobranca_automatica/migration.sql` à mão, seguindo o
padrão das migrações existentes):

- `CREATE TYPE` para os 3 novos enums; `ALTER TYPE "NotificationType" ADD VALUE ...` e
  `ALTER TYPE "TransactionDismissReason" ADD VALUE 'STRIPE_PAYOUT'`.
  ⚠️ `ADD VALUE` em transação exige PG ≥ 12 e o valor não pode ser usado na mesma transação —
  não inserir seeds que usem os novos valores na própria migração.
- `CREATE TABLE "PaymentCharge"` e `"DunningConfig"` + índices acima.
- `ALTER TABLE "Clinic"/"Plan"/"Patient"/"NfseConfig"/"Notification"` com os novos campos (todos com DEFAULT — sem rewrite bloqueante).
- `ALTER TABLE "ReconciliationLink"`: `ALTER COLUMN "transactionId" DROP NOT NULL`,
  `ADD COLUMN "paymentChargeId" TEXT`, `ADD COLUMN "source" "ReconciliationSource" NOT NULL DEFAULT 'BANK'`,
  FK + índice + unique parcial, e **CHECK**:
  ```sql
  ALTER TABLE "ReconciliationLink" ADD CONSTRAINT "ReconciliationLink_one_source_chk"
  CHECK (("transactionId" IS NOT NULL AND "paymentChargeId" IS NULL)
      OR ("transactionId" IS NULL AND "paymentChargeId" IS NOT NULL));
  ```
- Rodar `npx prisma generate` após editar o schema (somente generate).

### 3.2 Novo módulo de domínio: `src/lib/cobranca/`

Funções puras (sem Prisma/Stripe), barrel `index.ts`, testes colocalizados, arquivos < 200 linhas:

```
src/lib/cobranca/
├── index.ts                 # barrel
├── types.ts                 # tipos compartilhados do módulo
├── fees.ts                  # matemática de taxas
├── open-balance.ts          # saldo em aberto
├── charge-links.ts          # token HMAC do link estável
├── checkout-params.ts       # builder puro dos params da Checkout Session
├── dunning.ts               # seleção de candidatos da régua
├── payout-matching.ts       # reconhecimento de repasse Stripe no extrato
├── connect-status.ts        # mapeamento Stripe Account -> StripeConnectStatus
└── charge-service.ts        # ÚNICO arquivo impuro: orquestra Prisma+Stripe (usado pelas rotas/cron/webhook)
```

Assinaturas das funções puras:

```ts
// fees.ts
export function calculateApplicationFeeCents(amountCents: number, feePercent: number): number
// floor(amountCents * feePercent / 100); 0 se feePercent <= 0; nunca > amountCents
export function toCents(amount: number): number          // R$ decimal -> centavos (round)
export function fromCents(cents: number): number          // centavos -> R$ decimal

// open-balance.ts
export function computeOpenBalance(totalAmount: number, linkAmounts: number[]): number
// max(0, round2(total - soma)); reusa a mesma semântica do reconcile route

// charge-links.ts (espelha src/lib/appointments/appointment-links.ts; segredo = AUTH_SECRET)
export function signChargeLink(chargeId: string): string                    // HMAC-SHA256 hex
export function verifyChargeLink(chargeId: string, sig: string): boolean   // timingSafeEqual
export function buildPaymentLinkUrl(baseUrl: string, chargeId: string): string
// `${baseUrl}/api/public/pagar/${chargeId}?s=${sig}` — expiração fica no DB (expiresAt), não no token

// checkout-params.ts
export interface CheckoutInput {
  chargeId: string; invoiceId: string; clinicId: string
  description: string            // "Fatura 06/2026 — Clínica X"
  amountCents: number
  applicationFeeCents: number
  customerEmail?: string
  successUrl: string; cancelUrl: string
}
export function buildCheckoutSessionParams(input: CheckoutInput): Stripe.Checkout.SessionCreateParams
// mode: "payment", currency BRL, payment_method_types ["card","pix"],
// expires_at = now+24h (máx. do Stripe — o link interno regenera),
// metadata { chargeId, invoiceId, clinicId } em session E payment_intent_data.metadata,
// payment_intent_data.application_fee_amount quando > 0

// dunning.ts
export interface DunningInvoiceInput {
  invoiceId: string
  status: "PENDENTE" | "ENVIADO" | "PARCIAL"
  dueDate: string                // YYYY-MM-DD (tz da clínica)
  openAmount: number
  patient: {
    dunningOptOut: boolean
    consentWhatsApp: boolean; consentEmail: boolean
    hasPhone: boolean; hasEmail: boolean
  }
  remindersSent: number          // count de Notification PAYMENT_REMINDER da fatura
  lastReminderDate: string | null // YYYY-MM-DD do último envio (idempotência diária)
}
export interface DunningConfigInput {
  enabled: boolean; offsets: number[]; sendWhatsApp: boolean; sendEmail: boolean; maxAttempts: number
}
export interface DunningCandidate {
  invoiceId: string; offset: number; channels: Array<"WHATSAPP" | "EMAIL">
}
export function selectDunningCandidates(
  invoices: DunningInvoiceInput[], config: DunningConfigInput, today: string
): DunningCandidate[]
// regras: config.enabled; openAmount > 0; today === dueDate + offset (algum offset);
// remindersSent < maxAttempts; lastReminderDate !== today; canais = interseção
// (config × consentimento × contato disponível); dunningOptOut exclui; [] se nenhum canal

// payout-matching.ts
export function isStripePayoutDescription(description: string): boolean
// case/accent-insensitive: contém "STRIPE" (reusar normalizeForComparison de bank-reconciliation)
export interface PayoutCandidate { chargeId: string; netAmount: number; paidAt: Date }
export function matchStripePayout(
  payoutAmount: number, candidates: PayoutCandidate[], toleranceCents?: number // default 1
): { matched: boolean; chargeIds: string[]; difference: number }
// soma netAmount de TODAS as cobranças pagas não-matched com paidAt <= data do payout;
// matched se |soma - payoutAmount| <= tolerância. Sem subset-sum: diferença é exibida e decisão é humana.

// connect-status.ts
export function deriveConnectStatus(account: {
  charges_enabled: boolean; details_submitted: boolean
}): "ONBOARDING" | "ACTIVE" | "RESTRICTED"
```

`charge-service.ts` (impuro, consumido por rotas/webhook/cron — mantém as rotas < 50 linhas):

```ts
export async function createChargeForInvoice(opts: {
  invoiceId: string; clinicId: string; amount?: number
  createdByUserId?: string; viaDunning?: boolean
}): Promise<{ charge: PaymentCharge; paymentLink: string }>
// valida fatura no tenant (findFirst {id, clinicId}), calcula saldo, cancela ABERTA anterior,
// busca applicationFeePercent do Plano, cria PaymentCharge + primeira Checkout Session
// (idempotency key `charge-${chargeId}-0`)

export async function cancelOpenChargesForInvoice(invoiceId: string, clinicId: string, reason: string): Promise<number>
// expira sessions no Stripe (best-effort) e marca CANCELADA — chamado por recalc/cancel/delete de fatura

export async function regenerateSessionIfNeeded(chargeId: string): Promise<string> // retorna url
// usado pelo link público; idempotency key `charge-${chargeId}-${regenerationCount+1}`

export async function recordChargePaid(opts: {
  chargeId: string; paymentIntentId: string; paymentMethod: string
  stripeFeeAmount: number | null
}): Promise<void>
// transação: charge -> PAGA, cria ReconciliationLink{source: STRIPE, paymentChargeId, invoiceId,
// amount: min(charge.amount, saldoAberto)}, recalcula Invoice.status via computeInvoiceStatus
// (import de "@/lib/bank-reconciliation"), dispara hook NFS-e (try/catch isolado)

export async function sendChargeNotifications(opts: {
  chargeId: string; channels: Array<"WHATSAPP" | "EMAIL">; type: "PAYMENT_LINK" | "PAYMENT_REMINDER"
}): Promise<void>
// renderTemplate + createNotification (1 linha Notification por canal, com invoiceId)
```

### 3.3 RBAC

**Sem nova feature.** Cobrança vive dentro do bounded context Financeiro → feature existente
`finances` (`src/lib/rbac/types.ts`). Onboarding Stripe + régua = `clinic_settings`. Justificativa:
o split ADMIN/PROFESSIONAL já é o desejado nos defaults atuais; criar `cobranca` separada exigiria
migrar overrides sem ganho real. (Se no futuro quisermos granularidade, é um override a mais.)

### 3.4 Rotas de API

Todas autenticadas com `withFeatureAuth` de `@/lib/api`; **handlers se auto-escopam por
`user.clinicId`** (o wrapper não escopa) e validam FKs de body com lookup
`findFirst({ where: { id, clinicId: user.clinicId } })` — mesmo padrão do reconcile route.
(Obs.: o helper `src/lib/clinic/ownership.ts` citado na convenção ainda não existe no repo;
este plano cria `assertInvoiceInClinic`/lookups inline seguindo o padrão estabelecido.)

| Rota | Método | Auth | Request → Response |
|---|---|---|---|
| `/api/clinic/payments/connect` | POST | `clinic_settings` WRITE | `{}` → `{ url }` (Account Link). Cria conta Standard se `stripeConnectAccountId` nulo; status → `ONBOARDING`. Audita `PAYMENT_CONNECT_STARTED` |
| `/api/clinic/payments/status` | GET | `clinic_settings` READ | → `{ status, chargesEnabled, accountId }`. Sincroniza com `stripe.accounts.retrieve` + `deriveConnectStatus`, persiste no Clinic |
| `/api/clinic/payments/disconnect` | POST | `clinic_settings` WRITE | → `{ ok }`. Status → `DISCONNECTED` (mantém accountId/histórico). Audita |
| `/api/clinic/payments/dunning-config` | GET/PUT | `clinic_settings` READ/WRITE | PUT body zod: `{ enabled, offsets: number[] (-30..60, máx 8), sendWhatsApp, sendEmail, maxAttempts (1..12), linkExpirationDays (1..30), autoChargeOnInvoiceCreation }` → upsert. Audita |
| `/api/financeiro/faturas/[id]/cobranca` | POST | `finances` WRITE | `{ amount?, channels?: ("WHATSAPP"\|"EMAIL")[] }` → `{ charge, paymentLink }`. 400 se sem saldo/`amount` > saldo; 409 se Connect ≠ ACTIVE. Audita `PAYMENT_CHARGE_CREATED` |
| `/api/financeiro/faturas/[id]/cobranca` | GET | `finances` READ | → `{ charges: [...] }` histórico (inclui notificações ligadas) |
| `/api/financeiro/faturas/[id]/cobranca/[chargeId]` | DELETE | `finances` WRITE | cancela cobrança ABERTA (expira session). Audita `PAYMENT_CHARGE_CANCELED` |
| `/api/financeiro/faturas/[id]/cobranca/[chargeId]/reembolso` | POST | `finances` WRITE | `{ amount? }` → `stripe.refunds.create` na conta conectada (charge PAGA). Resposta otimista; efeito final via webhook. Audita `PAYMENT_CHARGE_REFUNDED` |
| `/api/financeiro/faturas/cobranca-lote` | POST | `finances` WRITE | `{ invoiceIds: string[] (1..50), channels }` → `{ created, skipped: [{invoiceId, reason}] }`. Valida TODAS as faturas no tenant antes de processar |
| `/api/financeiro/conciliacao/stripe-payout` | GET | `finances` READ | `?transactionId=` → `{ isPayout, matched, chargeIds, difference }` (matcher) |
| `/api/financeiro/conciliacao/stripe-payout` | POST | `finances` WRITE | `{ transactionId }` → dismissal `STRIPE_PAYOUT` + `payoutMatchedAt` nas charges casadas |
| `/api/public/pagar/[chargeId]` | GET | **público** (`src/app/api/public/`) | `?s=hmac` → 302 para Checkout (regenera session) ou `/pagar/indisponivel?motivo=`. Sem auth: HMAC impede enumeração; lookup só por `chargeId` (cuid) + sig |
| `/api/webhooks/stripe-connect` | POST | assinatura Stripe | ver §3.5 |
| `/api/jobs/dunning` | GET | `Bearer ${CRON_SECRET}` (padrão send-reminders) | ver §3.7 |
| `/api/superadmin/plans/[id]` | PUT (alterar existente) | `withSuperAdmin` | aceita `applicationFeePercent` |
| `/api/superadmin/clinics` | GET (alterar existente) | `withSuperAdmin` | inclui `stripeConnectStatus` no select |

### 3.5 Webhook Connect: `src/app/api/webhooks/stripe-connect/`

Endpoint **separado** do webhook de assinaturas (decisão: eventos de contas conectadas chegam com
`event.account` e exigem endpoint Connect próprio no dashboard Stripe, com secret próprio
`STRIPE_CONNECT_WEBHOOK_SECRET`; misturar no handler atual acoplaria os dois domínios).

```
stripe-connect/
├── route.ts        # verificação de assinatura (espelho de webhooks/stripe/route.ts)
├── handler.ts      # switch(event.type) → delega; resolve clinic por event.account
└── payment-events.ts  # lógica dos eventos de pagamento (mantém handler.ts < 200 linhas)
```

Eventos:

- `checkout.session.completed` (`payment_status === "paid"`) e `checkout.session.async_payment_succeeded`:
  valida `metadata.clinicId` + `event.account` ↔ `clinic.stripeConnectAccountId` (mismatch → log + 200 sem efeito);
  busca fee via `payment_intent.latest_charge.balance_transaction` (expand, com `stripeAccount`);
  chama `recordChargePaid` (idempotente). Depois: hook NFS-e (§3.8).
- `checkout.session.async_payment_failed`: charge → ABERTA + `failureReason` (histórico mostra falha).
- `charge.refunded`: localiza charge por `stripePaymentIntentId`; refund total → remove `ReconciliationLink`
  STRIPE, charge → `REEMBOLSADA`; refund parcial → reduz `amount` do link; recalcula `Invoice.status`.
  (Obs.: `TransactionRefundLink` continua exclusivo de devoluções com pernas bancárias — refund Stripe
  não gera linha de extrato no momento do refund, só reduz payout futuro.)
- `account.updated`: `deriveConnectStatus` → atualiza `Clinic.stripeConnectStatus`.

Sempre retornar 200 após processamento idempotente; erro inesperado → 500 (Stripe re-tenta).

### 3.6 Link de pagamento estável (decisão-chave)

Stripe Checkout Sessions expiram em **no máximo 24h** — incompatível com "link válido por N dias"
e com a régua que reenvia o mesmo link. Solução: o paciente recebe um **link interno estável**
(`/api/public/pagar/{chargeId}?s={hmac}`, padrão HMAC de `appointment-links.ts`, segredo
`AUTH_SECRET`). O GET:

1. `verifyChargeLink` (timing-safe) → senão `/pagar/indisponivel?motivo=invalido`
2. charge `PAGA` → `/pagar/indisponivel?motivo=pago` (mensagem "Esta fatura já foi paga. Obrigado!")
3. `CANCELADA`/`EXPIRADA` ou `expiresAt` vencido → `motivo=expirado` (marca `EXPIRADA` lazy)
4. registra `viewedAt ??= now` ("visualizado" no histórico — sem depender de eventos Stripe)
5. session atual ausente/criada há >23h → `regenerateSessionIfNeeded` (nova session, `regenerationCount++`)
6. 302 para `session.url`

`success_url = /pagar/obrigado`, `cancel_url =` o próprio link estável.

### 3.7 Cron de régua: `/api/jobs/dunning` + `vercel.json`

`vercel.json` ganha:

```json
{ "path": "/api/jobs/dunning", "schedule": "0 11 * * *" }
```

Rota (auth `Bearer ${CRON_SECRET}`, mesmo padrão de `send-reminders`):

1. Clínicas com `stripeConnectStatus=ACTIVE` e `dunningConfig.enabled=true`.
2. Por clínica: faturas `status IN (PENDENTE, ENVIADO, PARCIAL)` com `dueDate` entre
   `today - max(offsets)` e `today - min(offsets)` (janela estreita; índice
   `[clinicId, referenceYear, referenceMonth]`/status já existem), incluindo paciente
   (consentimentos, opt-out, phone/email), links de conciliação (saldo) e count/última data de
   `Notification` tipo `PAYMENT_REMINDER` por `invoiceId`.
3. Mapeia para `DunningInvoiceInput` (datas no fuso `clinic.timezone`) → `selectDunningCandidates`.
4. Por candidato: reusa charge ABERTA válida ou `createChargeForInvoice({ viaDunning: true })` se
   ausente/expirada (regeneração de link expirado, conforme spec) → `sendChargeNotifications(type:
   PAYMENT_REMINDER)`.
5. Resultado agregado no response + `AuditLog` por clínica (padrão dos jobs existentes).

**Gating de e-mail:** `notification-service.ts` hoje bloqueia tipos de e-mail não listados em
`ALWAYS_ENABLED_EMAIL_TYPES` (flag `appointmentNotificationsEnabled`). Adicionar `PAYMENT_LINK`
e `PAYMENT_REMINDER` ao set sempre-permitido — o gate real é a régua/ação explícita do usuário,
não a flag de notificações de agenda.

**Templates:** adicionar a `DEFAULT_TEMPLATES` (`src/lib/notifications/templates.ts`) os pares
PAYMENT_LINK × {WHATSAPP, EMAIL} e PAYMENT_REMINDER × {WHATSAPP, EMAIL}; estender
`TemplateVariables` com `paymentLink`, `invoiceAmount` (formatado R$), `dueDate` (DD/MM/YYYY),
`referenceMonth` (MM/YYYY) e registrar em `TEMPLATE_VARIABLES` para a UI de Notificações.
Clínicas personalizam via `NotificationTemplate` existente (unique `[clinicId, type, channel]`).

### 3.8 Hook fiscal (NFS-e ao receber)

Em `recordChargePaid`, após fatura → `PAGO`: se `clinic.nfseConfig?.isActive &&
nfseConfig.autoEmitOnPayment && invoice.nfseStatus == null` → disparar a emissão reutilizando o
caminho existente (`src/lib/nfse/emit-single.ts` / `emission-service.ts`, mesmo fluxo da rota
`/api/financeiro/faturas/[id]/nfse`). Embrulhado em try/catch: falha de emissão **nunca** falha o
webhook — grava `nfseStatus: "ERRO"` + `nfseErro` para retry manual (UI existente já mostra).
O fluxo de recibo (receita-saude/DMED) consome `paidAt`/links normalmente — sem mudança.

### 3.9 Integração com recálculo/cancelamento de fatura

- `src/lib/financeiro/recalculate-invoice.ts` / `recalculate-dispatch.ts`: quando `totalAmount`
  muda, chamar `cancelOpenChargesForInvoice(invoiceId, clinicId, "Fatura recalculada")`. UI sinaliza
  "Link cancelado — gerar novo" no histórico.
- Rotas de cancelamento/exclusão de fatura (`/api/financeiro/faturas/[id]`): idem antes de
  cancelar/excluir.

### 3.10 UI — arquivos novos e alterados

**Novos:**

| Arquivo | Conteúdo |
|---|---|
| `src/app/admin/settings/components/PaymentsTab.tsx` | composição da aba (status + forms) |
| `src/app/admin/settings/components/ConnectStatusCard.tsx` | card de status/CTAs Connect |
| `src/app/admin/settings/components/DunningConfigForm.tsx` | form react-hook-form + zod da régua |
| `src/app/financeiro/faturas/components/ChargeBadge.tsx` | badge de status de cobrança |
| `src/app/financeiro/faturas/components/CobrarModal.tsx` | modal de criação (valor/canais) |
| `src/app/financeiro/faturas/components/ChargeHistory.tsx` | timeline no detalhe da fatura |
| `src/app/financeiro/faturas/components/BulkChargeBar.tsx` | barra "Cobrar selecionadas (N)" |
| `src/app/financeiro/conciliacao/components/StripePayoutBanner.tsx` | sugestão de repasse |
| `src/app/pagar/obrigado/page.tsx`, `src/app/pagar/indisponivel/page.tsx` | páginas públicas |

**Alterados:** `src/app/admin/settings/page.tsx` (registrar aba "Pagamentos"),
`faturas/page.tsx` (estado de seleção por checkbox — derivado, sem useEffect),
`InvoiceTableBody.tsx` (checkbox + badge + ação Cobrar), `InvoiceDetailModal.tsx` e
`faturas/[id]` (seção Cobranças), página de conciliação (banner payout),
`DashboardResumo.tsx` + `dashboard-aggregation.ts` (chip de vencidas), form de paciente
(toggle opt-out), `src/app/superadmin/clinics` + `plans` (status Connect / taxa),
`vercel.json` (cron).

Regras de frontend: zero `useEffect` cru (derivar estado; handlers; `useMountEffect` se preciso),
Sonner para toasts, lucide-react, datas DD/MM/YYYY, moeda via `formatCurrency`, responsivo
(a aba Pagamentos segue o padrão das abas existentes em `admin/settings`).

### 3.11 Auditoria

Novas ações em `AuditAction` (`src/lib/rbac/audit.ts`): `PAYMENT_CONNECT_STARTED`,
`PAYMENT_CONNECT_DISCONNECTED`, `DUNNING_CONFIG_UPDATED`, `PAYMENT_CHARGE_CREATED`,
`PAYMENT_CHARGE_CANCELED`, `PAYMENT_CHARGE_REFUNDED`. Webhook/cron gravam AuditLog com
`userId: null` (entityType `PaymentCharge`).

### 3.12 Variáveis de ambiente

- `STRIPE_CONNECT_WEBHOOK_SECRET` (novo endpoint Connect no dashboard Stripe)
- Reusa: `STRIPE_SECRET_KEY`, `AUTH_SECRET` (HMAC), `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`

---

## 4. Plano de Testes

Vitest, colocalizados, `import { describe, it, expect } from "vitest"`; enums Prisma como
string literais; `vi.useFakeTimers()` onde houver datas.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/cobranca/fees.test.ts` | floor correto; 0%; 100%; arredondamento de centavos; nunca excede o valor; `toCents/fromCents` ida-e-volta com 2 casas |
| `src/lib/cobranca/open-balance.test.ts` | sem links = total; parcial; quitada = 0; sobre-pago clampa em 0; arredondamento round2 |
| `src/lib/cobranca/charge-links.test.ts` | sign/verify ok; sig adulterada falha; chargeId trocado falha; comparação timing-safe; URL montada corretamente |
| `src/lib/cobranca/checkout-params.test.ts` | BRL + `["card","pix"]`; metadata em session e payment_intent; application_fee só quando > 0; `expires_at` ≤ 24h; valores em centavos |
| `src/lib/cobranca/dunning.test.ts` | offset casa com hoje (D-3/D0/D+3/D+7); config desabilitada → []; `maxAttempts` atingido exclui; opt-out exclui; sem consentimento WhatsApp → só EMAIL (e vice-versa); sem nenhum canal → fora; idempotência `lastReminderDate === today`; fatura PARCIAL entra com saldo; PAGO/CANCELADO fora; offsets múltiplos no mesmo dia geram 1 candidato |
| `src/lib/cobranca/payout-matching.test.ts` | descrição "STRIPE"/"stripe holanda" detecta; descrição comum não; soma exata casa; tolerância de 1 centavo; diferença reportada; candidatos posteriores à data do payout ignorados; lista vazia → not matched |
| `src/lib/cobranca/connect-status.test.ts` | charges_enabled → ACTIVE; details_submitted sem charges → RESTRICTED; nada → ONBOARDING |
| `src/app/api/webhooks/stripe-connect/handler.test.ts` | espelha `webhooks/stripe/handler.test.ts` (prisma mockado): completed paga charge e cria link STRIPE; evento duplicado não duplica; clinic/account mismatch → no-op; async_payment_failed reabre; charge.refunded total/parcial recalcula status; account.updated sincroniza |
| `src/lib/notifications/templates.test.ts` (estender) | novos templates default existem para os 4 pares tipo×canal; `{{paymentLink}}`/`{{invoiceAmount}}`/`{{dueDate}}` renderizam |
| `src/lib/financeiro/dashboard-aggregation.test.ts` (estender) | contagem/soma de vencidas no chip |

Smoke manual (dev + Stripe test mode + `stripe listen --forward-to localhost:3000/api/webhooks/stripe-connect`):
onboarding completo, cobrança individual, pagamento cartão de teste, link estável após >24h
(simular `sessionCreatedAt` antigo), régua via `curl` no cron, payout banner com transação fake.

---

## 5. Etapas de Implementação

Branch via `bash scripts/new-feature.sh cobranca-automatica` (worktree + DB isolados — padrão do
repo). Cada etapa termina com `npm run build` + `npm run test` verdes.

1. **Schema + migração** — editar `prisma/schema.prisma` (§3.1); escrever
   `prisma/migrations/20260611000000_add_cobranca_automatica/migration.sql` à mão; aplicar no DB
   do worktree com `npx prisma migrate deploy` (nunca `db push`/`migrate dev`); `npx prisma generate`.
   _Verificável:_ generate ok, build ok.
2. **Módulo `src/lib/cobranca/` (funções puras) + testes** — fees, open-balance, charge-links,
   checkout-params, dunning, payout-matching, connect-status, types, index.
   _Verificável:_ `npx vitest run src/lib/cobranca`.
3. **Onboarding Connect** — rotas `connect`/`status`/`disconnect`; `ConnectStatusCard` +
   `PaymentsTab` registrada em settings; superadmin (coluna status + campo `applicationFeePercent`
   no Plano). _Verificável:_ onboarding test-mode de ponta a ponta.
4. **`charge-service.ts` + rotas de cobrança** — POST/GET cobrança, DELETE, lote; `CobrarModal`;
   audit actions. _Verificável:_ criar cobrança via UI, link copiável, segunda cobrança cancela a primeira.
5. **Link público estável** — `/api/public/pagar/[chargeId]` + páginas `/pagar/*`.
   _Verificável:_ redirect ao Checkout; sig inválida → indisponivel; `viewedAt` setado.
6. **Webhook Connect** — route + handler + payment-events + testes; `recordChargePaid` com
   `computeInvoiceStatus`; refund (rota + evento). _Verificável:_ pagamento teste baixa fatura
   (PAGO/PARCIAL); handler.test.ts verde.
7. **Notificações** — novos NotificationTypes nos templates default, variáveis, gating no
   notification-service, `sendChargeNotifications`. _Verificável:_ envio cria linhas Notification
   com `invoiceId`; templates editáveis na UI de Notificações.
8. **Régua de cobrança** — `dunning-config` API + `DunningConfigForm`; cron `/api/jobs/dunning`;
   `vercel.json`; opt-out no form de paciente; hook `autoChargeOnInvoiceCreation` na geração de
   fatura mensal. _Verificável:_ `curl -H "Authorization: Bearer $CRON_SECRET"` gera lembretes
   idempotentes em DB seedado.
9. **UI de faturas** — seleção em lote, `BulkChargeBar`, `ChargeBadge`, `ChargeHistory` no
   detalhe; hooks de recálculo/cancelamento chamando `cancelOpenChargesForInvoice`.
   _Verificável:_ recalcular fatura com link ativo cancela o link.
10. **Conciliação payout** — rotas `stripe-payout` (GET/POST), `StripePayoutBanner`, enum
    `STRIPE_PAYOUT` na UI de dismissal. _Verificável:_ transação CREDIT "STRIPE" sugere repasse;
    dismissal remove da fila sem tocar faturas.
11. **Hook NFS-e + chip do dashboard** — toggle `autoEmitOnPayment` (PaymentsTab), disparo em
    `recordChargePaid`, chip de vencidas no `DashboardResumo` + agregação.
    _Verificável:_ pagamento teste emite NFS-e sandbox; chip soma confere.
12. **Gates finais + commit** — `npx prisma generate && npm run test && npm run build`; commit
    local convencional (ex.: `feat(cobranca): payment links Pix/cartão com Stripe Connect, conciliação e régua de cobrança`)
    terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. **Não fazer push.**

---

## 6. Riscos e Questões em Aberto

### Riscos

- **Application fee em contas Standard (BR):** direct charges com `application_fee_amount` exigem
  a plataforma habilitada para Connect no Brasil. Validar em test mode na Etapa 3; fallback:
  lançar com `applicationFeePercent = 0` (rails primeiro, take-rate depois) sem mudança de schema.
- **Capability Pix:** a conta conectada precisa da capability `pix_payments` ativa; contas novas
  podem demorar a aprovar. Mitigação: `buildCheckoutSessionParams` mantém `card` sempre; se a
  criação da session falhar por Pix, retry sem Pix e flag no histórico ("link sem Pix").
- **Expiração de 24h das Checkout Sessions:** mitigada por design (link estável + regeneração).
  Risco residual: paciente deixa o Checkout aberto >24h — `cancel_url`/reabertura do link resolve.
- **Ordem/atraso de webhooks:** baixa de fatura depende do webhook. Mitigação: idempotência por
  construção; botão futuro "Sincronizar com Stripe" (fora de escopo) se necessário.
- **Dupla contagem na conciliação:** se o usuário ignorar o banner e conciliar o payout numa
  fatura, conta em dobro. Mitigação: faturas pagas via Stripe já saem da lista de pendentes do
  matcher; banner é proeminente; documentar no onboarding da feature.
- **Migração do `ReconciliationLink`** (NOT NULL → nullable + CHECK): tabela pequena, mas validar
  contra dump de produção restaurado no worktree antes do merge.
- **LGPD/anti-spam:** régua limitada a `maxAttempts` (default 4) e 1 envio/fatura/dia por
  construção; textos default neutros e editáveis.

### Questões em aberto

1. **Conta Standard vs Express:** plano assume **Standard** (spec; clínica gerencia o próprio
   dashboard/payouts; menor responsabilidade da plataforma). Express daria UX de onboarding mais
   simples mas exige a plataforma assumir suporte/risco — confirmar com o negócio.
2. **Taxa de payout do banco no matcher:** payouts Stripe chegam líquidos; se a soma nunca bater
   por taxas adicionais, ajustar tolerância (configurável?) após dados reais.
3. **AutoPay (cartão em arquivo, cobrança off-session com consentimento assinado):** fase 2
   explícita — schema atual (PaymentCharge desacoplada da session) já comporta.
4. **Chip também no dashboard principal (`src/app/page.tsx`)?** Plano entrega no dashboard
   financeiro; decidir na revisão se replica no home.
5. **`InsightsCobranca.tsx` existente:** avaliar fundir o chip/indicadores novos com esse
   componente para não duplicar UI de inadimplência.
