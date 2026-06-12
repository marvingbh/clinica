---
title: "feat: Receita Saúde batch receipts + DMED export (fiscal compliance pack)"
type: feat
status: planned
date: 2026-06-11
slug: receita-saude-dmed
priority: 9
complexity: L
---

# feat: Receita Saúde batch receipts + DMED export (fiscal compliance pack)

## 1. Contexto de Negócio

### Problema

Desde 01/01/2025 todo psicólogo **pessoa física** é obrigado a emitir recibos
pelo **Receita Saúde** (app/Carnê-Leão Web da Receita Federal) para cada
pagamento recebido — CFP e CRPs alertam ativamente os profissionais sobre a
obrigação. Em 11/2025 a RFB liberou um fluxo de **emissão em lote por arquivo**,
que concorrentes (Corpora) já monetizam. No lado **pessoa jurídica**, clínicas
PJ precisam entregar anualmente a **DMED** (Declaração de Serviços Médicos e de
Saúde), agregando recebimentos por CPF do pagador e identificando o
beneficiário quando pagador ≠ beneficiário.

Hoje o profissional que usa o Clinica registra cada pagamento duas vezes: uma
no financeiro do sistema, outra manualmente no Receita Saúde (um recibo por
parcela paga, na data do pagamento). Para a DMED, o contador refaz toda a
agregação à mão a partir de planilhas. O Clinica já tem **todos os dados
necessários** (faturas, pagamentos parciais via conciliação bancária, CPF de
cobrança/responsável financeiro, estornos) — falta só o empacotamento fiscal.

### Evidência de mercado

- Concorrentes com feature equivalente ou parcial: **Corpora** (lote Receita
  Saúde, pago à parte), **PsicoManager**, **Clínica nas Nuvens**, **4Medic**,
  **Amplimed**, **iClinic** (guia DMED).
- Obrigação regulatória "hard": não emitir recibo via Receita Saúde sujeita o
  profissional PF a malha fina e multa; a DMED é obrigatória para PJ
  prestadoras de serviços de saúde.
- Janela de emissão retroativa fecha (ex.: 28/02 para o ano anterior) — gera
  urgência sazonal e retenção em janeiro/fevereiro.

### Usuários-alvo

- **PROFESSIONAL (PF)**: exporta o lote dos seus próprios recibos pendentes,
  importa no ambiente da RFB e devolve o arquivo de resultado.
- **ADMIN**: configura dados fiscais da clínica e dos profissionais, exporta
  lotes de qualquer profissional, gera a conferência e o arquivo DMED do ano.
- **Paciente**: não interage; aparece como beneficiário/pagador nos recibos.

### Métricas de sucesso

- % de pagamentos recebidos do período com recibo `EMITIDO` (meta: > 90% nas
  clínicas com profissionais PF configurados).
- Nº de clínicas com DMED gerada até fevereiro.
- Redução de tickets/suporte sobre "como emitir recibo dos pagamentos".
- Conversão: feature anunciada como diferencial Brasil-específico no plano pago.

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **profissional PF**, quero ver todos os pagamentos recebidos que ainda
   não têm recibo Receita Saúde, para nunca esquecer uma emissão.
2. Como **profissional PF**, quero gerar um arquivo de lote no layout da RFB
   com os pagamentos selecionados, para emitir dezenas de recibos de uma vez.
3. Como **profissional PF**, quero importar de volta o arquivo de resultado da
   RFB, para que o sistema marque cada pagamento como emitido (com número do
   recibo) ou com erro (com a mensagem da RFB).
4. Como **ADMIN de clínica PJ**, quero escolher um ano-calendário e ver a
   agregação DMED por CPF pagador (com beneficiários identificados quando
   pagador ≠ beneficiário), para conferir antes de entregar ao contador.
5. Como **ADMIN**, quero baixar o arquivo no leiaute DMED e um CSV de
   conferência, para importar no programa da RFB / revisar em planilha.
6. Como **ADMIN**, quero ver pendências bloqueantes (CPF do pagador faltando,
   CPF/nascimento do beneficiário faltando, recebimentos "sem origem") com
   atalho para corrigir no cadastro do paciente.
7. Como **profissional**, quero receber em janeiro uma tarefa lembrando de
   emitir os recibos pendentes do ano anterior antes do fechamento da janela
   retroativa.

### 2.2 Configuração fiscal

**Por profissional** (formulário de edição de profissional já existente em
`/professionals`):

- `Regime fiscal`: `Pessoa Física (Receita Saúde)` | `Pessoa Jurídica (DMED)`
  | `— não configurado —` (default).
- `CPF do profissional` (obrigatório para PF; validado por dígito
  verificador).
- `CRP`: **reutiliza o campo existente `registrationNumber`** do
  `ProfessionalProfile` (não criar campo novo — desvio consciente do spec).
- `Regime vigente desde` (`fiscalRegimeSince`, data DD/MM/AAAA, opcional):
  marca a troca PF→PJ (ou PJ→PF) no meio do ano. Pagamentos anteriores à data
  são tratados no regime oposto (suportamos **uma** troca; ver Riscos).

**Por clínica** (nova aba **"Fiscal"** em `/admin/settings`, ao lado da aba
"NFS-e" — desvio consciente do spec, que sugeria `/financeiro → Fiscal`: o
precedente do codebase é que configuração de clínica vive em
`/admin/settings` sob a feature `clinic_settings`):

- `Gerar DMED para esta clínica` (toggle `dmedEnabled`).
- `CNPJ` (pré-preenchido a partir de `NfseConfig.cnpj` quando existir).
- `Nome empresarial`.
- `Responsável pela DMED`: CPF, nome, DDD, telefone.

### 2.3 Fluxo Receita Saúde (PF) — `/financeiro/receita-saude`

Nova aba "Receita Saúde" no layout do financeiro.

**Tela principal — lista de pagamentos pendentes**

- Filtros: período (de/até, DD/MM/AAAA, default: ano corrente), profissional
  (ADMIN vê todos; PROFESSIONAL vê apenas os próprios — trava no backend).
- Tabela, uma linha por **evento de pagamento** (parcela paga):

| Coluna | Conteúdo |
|---|---|
| Data do pagamento | DD/MM/YYYY (data da transação bancária conciliada, ou `paidAt` para pagamento manual) |
| Beneficiário | nome do paciente + CPF (ou badge de bloqueio) |
| Pagador | responsável financeiro (`billingResponsibleName`/`billingCpf`) ou o próprio paciente |
| Valor | R$ via `formatCurrencyBRL` |
| Profissional | dono da fatura |
| Status | `Pendente` / `Exportado` / `Emitido` / `Erro` / `Cancelado` |

- Linhas com bloqueio exibem badge vermelho com tooltip (ex.: "Pagador sem
  CPF") e link "Corrigir cadastro →" para `/patients/[id]` (e para o
  formulário do profissional quando o bloqueio é `PROFISSIONAL_SEM_CPF`).
  Linhas bloqueadas têm o checkbox desabilitado.
- Linhas com estorno vinculado (via `TransactionRefundLink` na transação de
  crédito) exibem badge amarelo "Estorno vinculado — confira" e **não** são
  pré-selecionadas; se o recibo já foi emitido, o badge instrui cancelamento
  manual no app da RFB (botão "Marcar como cancelado" muda o status local
  para `CANCELADO`).
- Botão primário: **"Gerar arquivo de lote"** (habilita com ≥ 1 linha válida
  selecionada). Gera o arquivo no layout RFB 11/2025 (um recibo por parcela
  paga, emitido na data do pagamento, CPF do pagador, CPF do beneficiário,
  valor do serviço), baixa o `.txt` e muda as linhas para `EXPORTADO`.

**Seção "Lotes gerados"** (abaixo da tabela ou aba secundária):

- Lista de lotes: data de geração, profissional, qtd. de recibos, valor total,
  status agregado (`Aguardando resultado` / `Processado` / `Com erros`),
  ações: "Baixar arquivo novamente", "Enviar arquivo de resultado",
  "Desfazer lote" (permitido apenas se nenhum item está `EMITIDO`; devolve os
  itens para `Pendente`).
- **Upload do resultado**: dialog com input de arquivo; o parser marca cada
  pagamento como `EMITIDO` (+ número do recibo) ou `ERRO` (+ mensagem RFB).
  Itens `ERRO` voltam a aparecer na lista de pendentes para re-exportação
  (re-exportar reaproveita a mesma linha de emissão, apontando para o novo
  lote).

**Bucket "Sem origem"**: card colapsável listando créditos bancários do
período não conciliados a nenhuma fatura (e não dispensados) — recebimentos
que não podem virar recibo até serem conciliados. Link "Conciliar →"
para `/financeiro/conciliacao`. Inclui também faturas marcadas `PARCIAL`
manualmente sem links de conciliação (sem data/valor por parcela).

### 2.4 Fluxo DMED (PJ) — `/financeiro/dmed`

Nova aba "DMED" no layout do financeiro (visível para todos; conteúdo exige
ADMIN — PROFESSIONAL vê estado vazio explicativo).

- Seletor de **ano-calendário** (default: ano anterior).
- **Relatório de conferência** em tela: tabela agrupada por **CPF do
  pagador** → total recebido no ano; linhas expandem para mostrar
  beneficiários (nome, CPF, data de nascimento, total) quando pagador ≠
  beneficiário. Rodapé com total geral.
- **Cruzamentos**: card "Pendências" listando divergências — faturas pagas sem
  CPF do pagador, pagamentos "sem origem" (crédito bancário não conciliado),
  faturas `PARCIAL` sem detalhe de parcelas — cada item com link de correção.
  O total conciliado + pendências deve bater com o ledger de
  faturas/pagamentos do ano (linha "Diferença não explicada: R$ X" quando
  não bate).
- Botões: **"Baixar arquivo DMED"** (`.txt` no leiaute da RFB para importação
  no programa da DMED) e **"Exportar CSV de conferência"**.
- O arquivo só considera pagamentos no período em que o regime efetivo era PJ
  (cf. `fiscalRegimeSince` por profissional e `dmedEnabled` da clínica).

### 2.5 Regras de negócio

1. **Um recibo por parcela paga, na data do pagamento.** Pagamentos parciais
   (vários `ReconciliationLink` na mesma fatura) geram vários recibos, cada um
   com a data da transação bancária.
2. **Competência = data do pagamento**, não da sessão. Sessão de dezembro paga
   em janeiro entra no ano seguinte (Receita Saúde e DMED).
3. **Identidade do evento de pagamento** (`paymentKey`):
   `recl:<reconciliationLinkId>` para parcela conciliada;
   `inv:<invoiceId>` para o pagamento manual (fatura `PAGO` com `paidAt`).
   Se uma fatura tem links e depois é marcada `PAGO` manualmente, o evento
   `inv:` cobre apenas o resíduo (`totalAmount − Σ links`) quando > R$ 0,01.
4. **Pagador**: `Patient.billingCpf`/`billingResponsibleName` quando
   preenchidos; caso contrário o CPF/nome do próprio paciente.
   ⚠️ O spec citava `PatientUsualPayer`, mas esse model guarda apenas
   **nomes normalizados** para matching bancário (sem CPF) — a fonte correta
   do CPF do pagador no codebase é `billingCpf` (já usada pela NFS-e).
5. **Beneficiário**: sempre o paciente (CPF + data de nascimento
   obrigatórios para exportar).
6. **Emissor do recibo**: `Invoice.professionalProfileId` (dono da fatura).
   Pacientes com profissionais múltiplos já podem usar
   `splitInvoiceByProfessional` para separar faturas por profissional.
7. **Sessões em grupo**: cada membro já recebe fatura própria → o pagador é
   resolvido por paciente, sem lógica extra.
8. **Estornos**: evento cujo crédito bancário possui `TransactionRefundLink`
   é flagado; se o estorno cobre o valor todo, o evento é excluído da
   exportação; se o recibo já foi `EMITIDO`, sinalizar cancelamento manual
   na RFB.
9. **Troca de regime no meio do ano**: eventos com data `< fiscalRegimeSince`
   pertencem ao regime anterior (o oposto do atual); `≥` pertencem ao atual.
   Clínicas com profissionais PF **e** entidade PJ rodam os dois fluxos lado
   a lado.
10. **Tudo auditado**: geração de lote, upload de resultado, desfazer lote,
    cancelamento, download DMED, alteração de config fiscal.
11. **Status de emissão** (espelha o padrão `NfseEmission`): linha de emissão
    criada **na exportação** com `EXPORTADO`; upload do resultado leva a
    `EMITIDO` ou `ERRO`; `CANCELADO` é manual. "Pendente" = ausência de linha
    de emissão para o `paymentKey` (ou linha `ERRO`).

### 2.6 Edge cases

- Fatura `PARCIAL` marcada manualmente (sem links): impossível saber data e
  valor de cada parcela → vai para o bucket "Sem origem" até ser conciliada
  ou marcada `PAGO`.
- Crédito bancário conciliado em duas faturas → dois eventos (dois recibos),
  mesmo dia, valores dos links.
- Fatura `PAGO` com `paidAt` nulo → usa `updatedAt`? **Não** — bloqueia com
  `PAGAMENTO_SEM_DATA` e lista nas pendências (corrigir informando a data).
- Profissional sem `fiscalRegime` configurado → seus pagamentos não aparecem
  em nenhum dos fluxos; a tela Receita Saúde mostra aviso "Configure o regime
  fiscal dos profissionais".
- Paciente menor sem CPF → bloqueio `BENEFICIARIO_SEM_CPF` (CPF é exigível
  para todas as idades desde 2019 — quick-fix no cadastro).
- Ano bissexto/timezone: datas `@db.Date` formatadas com `formatDateBR`
  (split de string, sem shift de fuso).
- Re-upload do mesmo arquivo de resultado → idempotente (atualiza os mesmos
  registros para o mesmo estado).

### 2.7 Copy pt-BR (chaves principais)

| Contexto | Texto |
|---|---|
| Aba financeiro | `Receita Saúde`, `DMED` |
| Aba settings | `Fiscal` |
| Título tela PF | `Recibos Receita Saúde` |
| Subtítulo | `Pagamentos recebidos sem recibo emitido no período` |
| Botão exportar | `Gerar arquivo de lote` |
| Botão resultado | `Enviar arquivo de resultado` |
| Botão desfazer | `Desfazer lote` |
| Status | `Pendente` / `Exportado` / `Emitido` / `Erro` / `Cancelado` |
| Bloqueios | `Pagador sem CPF`, `Beneficiário sem CPF`, `Beneficiário sem data de nascimento`, `Profissional sem CPF`, `Profissional sem CRP`, `Pagamento sem data` |
| Quick-fix | `Corrigir cadastro →` |
| Estorno | `Estorno vinculado — confira antes de emitir` |
| Sem origem | `Recebimentos sem origem (não conciliados)` |
| Toast lote ok | `Arquivo de lote gerado: {n} recibos, {valor}` |
| Toast resultado | `Resultado processado: {ok} emitidos, {err} com erro` |
| Toast erro upload | `Não foi possível interpretar o arquivo de resultado` |
| DMED título | `DMED — Conferência {ano}` |
| DMED download | `Baixar arquivo DMED` / `Exportar CSV de conferência` |
| DMED diferença | `Diferença não explicada: {valor}` |
| Todo PF (janeiro) | `Emitir recibos Receita Saúde pendentes de {ano}` |
| Todo PF notes | `A janela de emissão retroativa encerra em 28/02/{ano+1}.` |
| Todo PJ (fevereiro) | `Gerar conferência DMED {ano}` |
| Todo PJ notes | `Prazo de entrega da DMED: último dia útil de fevereiro.` |
| Chip dashboard | `{n} recibos pendentes` |
| Vazio (sem regime) | `Nenhum profissional com regime fiscal configurado. Configure em Profissionais.` |
| DMED sem permissão | `A conferência DMED é restrita a administradores.` |

---

## 3. Design Técnico

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

**Novos enums**

```prisma
enum FiscalRegime {
  PF
  PJ
}

enum ReciboSaudeStatus {
  EXPORTADO
  EMITIDO
  ERRO
  CANCELADO
}
```

**`ProfessionalProfile` — campos novos**

```prisma
model ProfessionalProfile {
  // ... campos existentes (registrationNumber já guarda o CRP) ...
  fiscalRegime      FiscalRegime?
  fiscalRegimeSince DateTime?     @db.Date // data da troca de regime (suporta 1 troca)
  cpf               String?       // 11 dígitos, somente números

  reciboSaudeBatches   ReciboSaudeBatch[]
  reciboSaudeEmissions ReciboSaudeEmission[]
}
```

**Novo model `FiscalConfig`** (config DMED por clínica — separado de
`NfseConfig` porque clínicas sem NFS-e também entregam DMED)

```prisma
/// Clinic-level fiscal settings for the DMED annual export
model FiscalConfig {
  id                  String   @id @default(cuid())
  clinicId            String   @unique
  dmedEnabled         Boolean  @default(false)
  cnpj                String?  // 14 digits only
  nomeEmpresarial     String?
  responsavelCpf      String?  // 11 digits only
  responsavelNome     String?
  responsavelDdd      String?
  responsavelTelefone String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)
}
```

**Novo model `ReciboSaudeBatch`** (um arquivo de lote exportado)

```prisma
/// One Receita Saúde batch-emission file generated for a PF professional
model ReciboSaudeBatch {
  id                    String    @id @default(cuid())
  clinicId              String
  professionalProfileId String
  generatedByUserId     String?
  fileName              String
  fileContent           String    @db.Text // exact exported file (re-download)
  itemCount             Int
  totalAmount           Decimal   @db.Decimal(10, 2)
  resultFileContent     String?   @db.Text // raw RFB result file (AdnLog-style trace)
  resultUploadedAt      DateTime?
  createdAt             DateTime  @default(now())

  clinic              Clinic               @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile  @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  generatedByUser     User?                @relation(fields: [generatedByUserId], references: [id], onDelete: SetNull)
  emissions           ReciboSaudeEmission[]

  @@index([clinicId, createdAt])
  @@index([clinicId, professionalProfileId])
}
```

**Novo model `ReciboSaudeEmission`** (uma linha por evento de pagamento;
espelha `NfseEmission`)

```prisma
/// Receita Saúde receipt emission per paid installment (payment event).
/// "Pending" payments have no row here. The row is created at export time
/// (EXPORTADO) and mutated by the RFB result upload (EMITIDO/ERRO). Retries
/// after ERRO/CANCELADO reuse the same row pointing at the new batch —
/// the [clinicId, paymentKey] unique guarantees at most one recibo per payment.
model ReciboSaudeEmission {
  id                    String            @id @default(cuid())
  clinicId              String
  batchId               String
  professionalProfileId String
  patientId             String
  invoiceId             String
  reconciliationLinkId  String?           // null = manual payment event (inv:)
  paymentKey            String            // "recl:<linkId>" | "inv:<invoiceId>"
  paymentDate           DateTime          @db.Date
  amount                Decimal           @db.Decimal(10, 2)
  beneficiaryCpf        String            // snapshots at export time
  beneficiaryName       String
  beneficiaryBirthDate  DateTime          @db.Date
  payerCpf              String
  payerName             String
  status                ReciboSaudeStatus @default(EXPORTADO)
  reciboNumero          String?
  erro                  String?
  emitidoAt             DateTime?
  canceladoAt           DateTime?
  createdAt             DateTime          @default(now())
  updatedAt             DateTime          @updatedAt

  clinic              Clinic              @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  batch               ReciboSaudeBatch    @relation(fields: [batchId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  patient             Patient             @relation(fields: [patientId], references: [id], onDelete: Cascade)
  invoice             Invoice             @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@unique([clinicId, paymentKey])
  @@index([clinicId, status])
  @@index([batchId])
  @@index([clinicId, professionalProfileId, paymentDate])
  @@index([patientId])
  @@index([invoiceId])
}
```

Adicionar as relações inversas em `Clinic` (`fiscalConfig FiscalConfig?`,
`reciboSaudeBatches ReciboSaudeBatch[]`, `reciboSaudeEmissions
ReciboSaudeEmission[]`), `User` (`reciboSaudeBatches ReciboSaudeBatch[]`),
`Patient` (`reciboSaudeEmissions ReciboSaudeEmission[]`) e `Invoice`
(`reciboSaudeEmissions ReciboSaudeEmission[]`).

**Migração**: autorar SQL **offline** em
`prisma/migrations/<timestamp>_add_fiscal_compliance/migration.sql`
(CREATE TYPE × 2, ALTER TABLE "ProfessionalProfile" ADD COLUMN × 3,
CREATE TABLE × 3 + índices/uniques/FKs). **Nunca** rodar `prisma db push`
ou `prisma migrate dev`; validar com `npx prisma generate` + revisão manual
contra o schema. Sem backfill (todos os campos novos são nullable/default).

### 3.2 Novo domain module — `src/lib/fiscal/`

Funções puras, sem dependência de framework, todas com testes colocalizados.
Arquivos < 200 linhas; barrel `index.ts`.

```
src/lib/fiscal/
├── index.ts                      # barrel
├── types.ts                      # PaymentEvent, ReciboRow, DmedReport, blockers
├── cpf.ts                        # validateCpf / formatCpf (check digits, mirrors nfse/validation.ts CNPJ)
├── payment-events.ts             # collectPaymentEvents
├── fiscal-period.ts              # regime windows (PF→PJ switch)
├── recibo-validation.ts          # blockers per row
├── recibo-file-builder.ts        # RFB batch file (layout 11/2025) — ISOLATED, layout-versioned
├── recibo-result-parser.ts       # RFB result file parser
├── dmed-aggregation.ts           # per-payer/per-beneficiary aggregation + reconciliation cross-check
├── dmed-file-builder.ts          # DMED text layout — ISOLATED, layout-versioned
├── dmed-csv.ts                   # conference CSV
├── pending-issues.ts             # "sem origem" bucket + divergences
└── *.test.ts                     # colocated vitest tests (one per file above)
```

**Assinaturas principais** (`types.ts` define os tipos; Decimals do Prisma
são convertidos para `number` na borda da rota antes de chamar o domínio):

```ts
// types.ts
export type FiscalRegimeValue = "PF" | "PJ"

export interface PaymentEvent {
  paymentKey: string             // "recl:<id>" | "inv:<invoiceId>"
  invoiceId: string
  reconciliationLinkId: string | null
  paymentDate: Date | null       // null => PAGAMENTO_SEM_DATA blocker
  amount: number
  patientId: string
  professionalProfileId: string
  refundedAmount: number         // Σ TransactionRefundLink on the backing credit tx
}

export type ReciboBlocker =
  | "BENEFICIARIO_SEM_CPF" | "BENEFICIARIO_SEM_NASCIMENTO"
  | "PAGADOR_SEM_CPF" | "PROFISSIONAL_SEM_CPF" | "PROFISSIONAL_SEM_CRP"
  | "PAGAMENTO_SEM_DATA" | "VALOR_INVALIDO"

export interface ReciboParty { cpf: string | null; name: string; birthDate: Date | null }

export interface ReciboRow extends PaymentEvent {
  beneficiary: ReciboParty
  payer: ReciboParty
  blockers: ReciboBlocker[]
  refundWarning: boolean         // 0 < refundedAmount < amount
  fullyRefunded: boolean         // refundedAmount >= amount - 0.01
}

// payment-events.ts — derives one event per paid installment.
// Input shape matches a Prisma query of invoices + reconciliationLinks
// (+ each link's transaction with refund links), already clinic-scoped.
export function collectPaymentEvents(invoices: InvoiceWithPayments[]): PaymentEvent[]
// Rules: one event per ReconciliationLink (date = transaction.date, amount =
// link.amount); for status PAGO with paidAt, a residual "inv:" event of
// (totalAmount − Σ links) when > 0.01; PARCIAL without links => no event
// (surfaces in pending-issues); CANCELADO invoices => no events.

// cpf.ts
export function validateCpf(cpf: string): boolean   // strips mask, check digits, rejects repeated digits
export function formatCpf(cpf: string): string      // 000.000.000-00

// fiscal-period.ts
export function regimeAtDate(
  current: FiscalRegimeValue, since: Date | null, paymentDate: Date
): FiscalRegimeValue           // date < since => opposite of current
export function filterEventsByRegime(
  events: PaymentEvent[],
  professionals: Map<string, { fiscalRegime: FiscalRegimeValue | null; fiscalRegimeSince: Date | null }>,
  regime: FiscalRegimeValue
): PaymentEvent[]

// recibo-validation.ts
export function resolvePayer(patient: PatientFiscalData): ReciboParty
//  billingCpf/billingResponsibleName when billingCpf present, else patient cpf/name
export function buildReciboRows(
  events: PaymentEvent[],
  patients: Map<string, PatientFiscalData>,
  professionals: Map<string, ProfessionalFiscalData>
): ReciboRow[]                                       // attaches parties + blockers

// recibo-file-builder.ts  (layout RFB 11/2025 — ver Riscos R1)
export interface ReciboIssuer { cpf: string; crp: string; name: string }
export function buildReciboBatchFile(rows: ExportableRecibo[], issuer: ReciboIssuer): string
export function buildReciboBatchFileName(issuer: ReciboIssuer, generatedAt: Date): string

// recibo-result-parser.ts
export interface ReciboResultLine {
  paymentKey: string | null      // resolved via the line reference we embedded at export
  outcome: "EMITIDO" | "ERRO"
  reciboNumero?: string
  message?: string
}
export function parseReciboResultFile(content: string): ReciboResultLine[]  // throws FiscalParseError on garbage

// dmed-aggregation.ts
export interface DmedBeneficiary { cpf: string; name: string; birthDate: Date | null; total: number }
export interface DmedPayerEntry { cpf: string; name: string; total: number; beneficiaries: DmedBeneficiary[] }
export interface DmedReport {
  year: number
  payers: DmedPayerEntry[]       // sorted by name
  grandTotal: number
  ledgerTotal: number            // Σ all payment events in the year (PJ window)
  unexplainedDiff: number        // ledgerTotal − grandTotal − Σ issues amounts
}
export function aggregateDmed(rows: ReciboRow[], year: number): DmedReport
//  groups by payer CPF; lists beneficiaries only when payer ≠ beneficiary;
//  rows with blockers are excluded from payers and counted into ledger diff

// dmed-file-builder.ts (leiaute oficial DMED — ver Riscos R1)
export interface DmedConfig {
  cnpj: string; nomeEmpresarial: string
  responsavelCpf: string; responsavelNome: string
  responsavelDdd: string | null; responsavelTelefone: string | null
}
export function buildDmedFile(report: DmedReport, config: DmedConfig): string
export function validateDmedConfig(config: Partial<DmedConfig>): string[]   // pt-BR error list

// dmed-csv.ts
export function buildDmedCsv(report: DmedReport): string   // ; separator, BOM, pt-BR headers

// pending-issues.ts
export type FiscalIssue =
  | { kind: "SEM_ORIGEM"; transactionId: string; date: Date; amount: number; payerName: string | null }
  | { kind: "PARCIAL_SEM_DETALHE"; invoiceId: string; patientName: string; amount: number }
  | { kind: "BLOQUEIO"; paymentKey: string; blockers: ReciboBlocker[]; patientId: string; patientName: string }
export function collectPendingIssues(
  rows: ReciboRow[],
  unallocatedCredits: UnallocatedCredit[],
  partialInvoicesWithoutLinks: PartialInvoiceInfo[]
): FiscalIssue[]
```

O builder do arquivo de lote embute uma **referência de linha**
(`paymentKey` ou índice sequencial mapeado) para que o parser do resultado
consiga reassociar cada linha — detalhe a fechar quando o layout oficial for
verificado (Riscos R1).

### 3.3 RBAC — nova feature `fiscal`

- `src/lib/rbac/types.ts`: adicionar `"fiscal"` a `FEATURES` e
  `FEATURE_LABELS` (`fiscal: "Fiscal (Receita Saúde/DMED)"`).
- `src/lib/rbac/permissions.ts` (`ROLE_DEFAULTS`):
  - `ADMIN: fiscal: "WRITE"`
  - `PROFESSIONAL: fiscal: "WRITE"` — mas os handlers **auto-escopam**:
    PROFESSIONAL só enxerga/exporta eventos com
    `professionalProfileId === user.professionalProfileId` (mesmo padrão do
    repasse). Rotas DMED e config fiscal exigem adicionalmente
    `user.role === "ADMIN"` dentro do handler (dado de nível clínica).
- Atualizar os testes de `permissions.test.ts` que iteram `FEATURES`.

### 3.4 API routes (todas `withFeatureAuth`, thin adapters < 50 linhas de lógica)

Multi-tenancy: **toda** query Prisma com `clinicId: user.clinicId`; todo id
vindo do body (paymentKeys → reconciliationLinkId/invoiceId, batchId,
professionalId) é revalidado com `where: { id, clinicId: user.clinicId }`
antes do uso (não existe helper `src/lib/clinic/ownership.ts` no repo hoje —
criar `src/lib/clinic/ownership.ts` com
`assertInvoicesInClinic(prisma, clinicId, ids)` /
`assertReconciliationLinksInClinic(...)` e usar aqui; ver Etapa 7).

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/financeiro/fiscal/config` | GET | `{ feature: "fiscal", minAccess: "READ" }` + ADMIN check | Retorna `FiscalConfig` (upsert lazy) + flags derivadas (`hasPfProfessionals`, `hasNfseCnpj`) |
| `/api/financeiro/fiscal/config` | PUT | `fiscal` WRITE + ADMIN | zod body (cnpj `validateCnpj`, cpf `validateCpf`); upsert por `clinicId`; audit `FISCAL_CONFIG_UPDATED` |
| `/api/financeiro/fiscal/receita-saude/payments` | GET | `fiscal` READ | Query `?from&to&professionalId`. Busca faturas pagas/parciais do período (clinic-scoped, `invoice-includes` + links + refund links + emissões) → `collectPaymentEvents` → `buildReciboRows` → junta status das `ReciboSaudeEmission` por `paymentKey`. PROFESSIONAL: força `professionalProfileId` próprio. Response: `{ rows, issues, professionals }` |
| `/api/financeiro/fiscal/receita-saude/export` | POST | `fiscal` WRITE | Body `{ professionalProfileId, paymentKeys: string[] }` (zod). Valida ownership de todos os ids; recomputa rows server-side; rejeita 422 se qualquer row tem blocker (`{ error, blockers }`). Em `$transaction`: cria `ReciboSaudeBatch` + upsert das `ReciboSaudeEmission` (status `EXPORTADO`, snapshots); audit `RECIBO_SAUDE_BATCH_EXPORTED`. Response: `{ batchId, fileName, fileContent }` (download client-side via Blob) |
| `/api/financeiro/fiscal/receita-saude/batches` | GET | `fiscal` READ | Lista lotes da clínica (PROFESSIONAL: só os próprios) com contagens por status |
| `/api/financeiro/fiscal/receita-saude/batches/[id]` | DELETE | `fiscal` WRITE | "Desfazer lote": 409 se algum item `EMITIDO`; apaga emissões do lote + o lote; audit `RECIBO_SAUDE_BATCH_UNDONE` |
| `/api/financeiro/fiscal/receita-saude/batches/[id]/result` | POST | `fiscal` WRITE | Body `{ fileContent: string }`. `parseReciboResultFile` → updateMany por linha (`EMITIDO`+número / `ERRO`+mensagem), grava `resultFileContent`/`resultUploadedAt`; idempotente; audit `RECIBO_SAUDE_RESULT_IMPORTED`. Response: `{ emitted, errored }` |
| `/api/financeiro/fiscal/receita-saude/emissions/[id]/cancel` | POST | `fiscal` WRITE | Marca `CANCELADO` (estorno tratado manualmente na RFB); audit `RECIBO_SAUDE_CANCELLED` |
| `/api/financeiro/fiscal/dmed` | GET | `fiscal` READ + ADMIN | `?year=2025` → eventos do ano (janela PJ) → `aggregateDmed` → JSON `{ report, issues, configOk }` |
| `/api/financeiro/fiscal/dmed/file` | GET | `fiscal` READ + ADMIN | `validateDmedConfig` (422 com lista pt-BR se incompleta) → `buildDmedFile` → `text/plain; charset=...` com `Content-Disposition: attachment`; audit `DMED_FILE_DOWNLOADED` |
| `/api/financeiro/fiscal/dmed/csv` | GET | `fiscal` READ + ADMIN | `buildDmedCsv` → `text/csv` |
| `/api/financeiro/fiscal/pending-count` | GET | `fiscal` READ | `{ pendingRecibos: n }` para o chip do dashboard (rows válidas sem emissão `EMITIDO/EXPORTADO`, escopo do usuário) |

A lógica compartilhada de "buscar faturas do período e montar rows" vai para
um helper de orquestração `src/lib/fiscal/queries.ts` (única exceção com
Prisma no módulo — segue o precedente de `financeiro/repair-orphaned-invoice-items.ts`)
ou, alternativamente, duplicar a query fina nas 3 rotas que precisam
(payments, export, pending-count) mantendo o domínio puro. **Decisão: helper
`queries.ts` com o client Prisma injetado por parâmetro**, testável com mock.

### 3.5 Cron job

- Nova rota `src/app/api/jobs/fiscal-todos/route.ts` (padrão
  `CRON_SECRET` Bearer, igual a `mark-overdue-expenses`).
- `vercel.json`: `{ "path": "/api/jobs/fiscal-todos", "schedule": "0 8 5 1,2 *" }`
  (05/jan e 05/fev, 08:00 UTC).
- Lógica pura em `src/lib/jobs/fiscal-todos.ts` (+ teste):
  - **Janeiro**: para cada `ProfessionalProfile` ativo com
    `fiscalRegime: "PF"`, criar `Todo` com `title:
    "Emitir recibos Receita Saúde pendentes de {anoAnterior}"`,
    `day` = data da execução, notes com prazo 28/02. Idempotência: skip se já
    existe todo com mesmo `clinicId + professionalProfileId + title`.
  - **Fevereiro**: para cada clínica com `FiscalConfig.dmedEnabled`, criar
    `Todo` "Gerar conferência DMED {anoAnterior}" para o
    `professionalProfileId` do primeiro `User` ADMIN ativo que possua
    profile (fallback: primeiro profissional ativo da clínica; se nenhum,
    pula e loga).
  - Audit `FISCAL_TODOS_CREATED` por clínica afetada (userId null).

### 3.6 UI — páginas e componentes

**Novos** (todos < 200 linhas; client components com react-hook-form + zod,
Sonner, lucide-react; datas como inputs de texto mascarados DD/MM/AAAA;
fetch segue o padrão existente das páginas do financeiro — `useEffect` já
encapsulado/anotado como nas páginas atuais, preferindo handlers de evento
para todas as ações do usuário e estado derivado para filtros):

```
src/app/financeiro/receita-saude/
├── page.tsx                        # orquestração: filtros + tabela + lotes
└── components/
    ├── ReciboPaymentsTable.tsx     # tabela com seleção, badges de status
    ├── ReciboBlockerBadge.tsx      # badge + tooltip + link "Corrigir cadastro →"
    ├── ReciboStatusBadge.tsx       # Pendente/Exportado/Emitido/Erro/Cancelado
    ├── ReciboBatchList.tsx         # lotes gerados + ações
    ├── ReciboResultUploadDialog.tsx# upload do arquivo de resultado
    └── SemOrigemCard.tsx           # bucket "sem origem" (reutilizado pela DMED)

src/app/financeiro/dmed/
├── page.tsx                        # year picker + report + downloads
└── components/
    ├── DmedYearPicker.tsx
    ├── DmedConferenceTable.tsx     # payers → beneficiaries expandible rows
    └── DmedIssuesCard.tsx          # pendências com links de correção

src/app/admin/settings/components/FiscalConfigTab.tsx   # aba "Fiscal"
src/app/financeiro/components/PendingRecibosChip.tsx    # chip no dashboard
```

**Arquivos existentes alterados**

- `src/app/financeiro/layout.tsx`: + tabs
  `{ href: "/financeiro/receita-saude", label: "Receita Saúde" }` e
  `{ href: "/financeiro/dmed", label: "DMED" }`; incluir os dois paths na
  exclusão do `FinanceiroFilterBar` (eles têm filtros próprios).
- `src/app/admin/settings/page.tsx`: + tab `{ id: "fiscal", label: "Fiscal",
  icon: Landmark }` renderizando `FiscalConfigTab`.
- `src/app/financeiro/page.tsx`: renderizar `<PendingRecibosChip />` ao lado
  do título (componente auto-contido que busca `/pending-count` e some quando
  0 ou 403).
- `src/app/professionals/page.tsx` + `components/`: campos `Regime fiscal`
  (select), `CPF` (masked input com `validateCpf` no zod) e `Regime vigente
  desde` (masked date) no formulário de profissional. ⚠️ `page.tsx` tem 27 KB
  — extrair o formulário para `components/ProfessionalForm.tsx` se ainda não
  for separado, conforme regra de tamanho de arquivo.
- `src/app/api/professionals/[id]/route.ts` (e `route.ts` de criação):
  aceitar/retornar `fiscalRegime`, `fiscalRegimeSince`, `cpf` (zod:
  `validateCpf`); manter `select` explícito.
- `src/lib/rbac/audit.ts`: novas actions `FISCAL_CONFIG_UPDATED`,
  `RECIBO_SAUDE_BATCH_EXPORTED`, `RECIBO_SAUDE_BATCH_UNDONE`,
  `RECIBO_SAUDE_RESULT_IMPORTED`, `RECIBO_SAUDE_CANCELLED`,
  `DMED_FILE_DOWNLOADED`, `FISCAL_TODOS_CREATED`.
- `src/lib/audit/field-labels.ts`: labels pt-BR para os novos campos
  (`fiscalRegime: "Regime fiscal"`, `cpf: "CPF"`, etc.).
- `vercel.json`: novo cron (3.5).

### 3.7 Pontos de integração

- **Notificações**: nenhuma notificação a paciente; a cadência usa o sistema
  de **Todos** existente (3.5) — aparece em `/tarefas`.
- **Conciliação bancária**: leitura de `ReconciliationLink`,
  `BankTransaction` (créditos não alocados) e `TransactionRefundLink`;
  nenhuma escrita nesses models.
- **NFS-e**: `FiscalConfigTab` pré-preenche CNPJ de `NfseConfig` quando
  existir; `validateCnpj` é reexportado de `src/lib/nfse/validation.ts`
  (não duplicar).
- **Financeiro**: `formatCurrencyBRL`/`formatDateBR` de
  `src/lib/financeiro/format.ts` em toda a UI e nos CSVs.
- **Subscription**: mutações já bloqueadas por `withFeatureAuth` quando a
  assinatura está read-only (comportamento herdado).

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`; enums
Prisma como string literals; `vi.useFakeTimers()` onde houver datas relativas.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/fiscal/cpf.test.ts` | CPF válido com/sem máscara; dígito verificador errado; tamanho errado; dígitos repetidos (000…/111…); `formatCpf` |
| `src/lib/fiscal/payment-events.test.ts` | 1 evento por link (data = transação, valor = link); 2 links → 2 eventos; fatura PAGO sem links → 1 evento `inv:` em `paidAt`; PAGO com links + resíduo > 0,01 → evento residual; resíduo ≤ 0,01 → sem evento extra; PARCIAL sem links → nenhum evento; CANCELADO → nenhum; PAGO sem `paidAt` → evento com `paymentDate: null`; `refundedAmount` propagado do refund link |
| `src/lib/fiscal/fiscal-period.test.ts` | `regimeAtDate` sem `since` (sempre atual); antes/depois/na data da troca; `filterEventsByRegime` mistura PF+PJ; profissional sem regime → excluído |
| `src/lib/fiscal/recibo-validation.test.ts` | `resolvePayer` com `billingCpf` (usa responsável) vs sem (usa paciente); cada blocker individualmente; row limpa → `blockers: []`; `refundWarning` parcial vs `fullyRefunded` |
| `src/lib/fiscal/recibo-file-builder.test.ts` | golden file com 2 recibos (datas DD/MM/YYYY ou layout oficial, valor com separador correto, CPFs sem máscara); ordenação por data; nome de arquivo; encoding/quebras de linha; referência de linha embutida reversível pelo parser |
| `src/lib/fiscal/recibo-result-parser.test.ts` | resultado com sucesso (número do recibo); com erro (mensagem RFB); arquivo misto; arquivo vazio/garbage → `FiscalParseError`; roundtrip com o builder |
| `src/lib/fiscal/dmed-aggregation.test.ts` | agrupamento por CPF pagador; pagador = beneficiário → sem lista de beneficiários; pagador ≠ beneficiário → beneficiário identificado; mesmo pagador, 2 beneficiários; filtro por ano (pagamento de 01/01 vs 31/12); rows com blocker fora do total + dentro do `unexplainedDiff`; `grandTotal`/`ledgerTotal` |
| `src/lib/fiscal/dmed-file-builder.test.ts` | golden file: header/registro responsável/declarante/registros por pagador na ordem do leiaute; totais em centavos; `validateDmedConfig` com campos faltando (mensagens pt-BR) |
| `src/lib/fiscal/dmed-csv.test.ts` | separador `;`, BOM, headers pt-BR, valores R$ formatados, linhas de beneficiário |
| `src/lib/fiscal/pending-issues.test.ts` | crédito não alocado → `SEM_ORIGEM`; crédito dispensado → fora; PARCIAL sem links → `PARCIAL_SEM_DETALHE`; rows com blocker → `BLOQUEIO` |
| `src/lib/jobs/fiscal-todos.test.ts` | janeiro cria todo por profissional PF; idempotência (2ª execução não duplica); fevereiro cria todo DMED só para clínicas `dmedEnabled`; clínica sem ADMIN com profile → fallback/skip; título/notes com ano correto (fake timers) |
| `src/app/api/financeiro/fiscal/receita-saude/export/route.test.ts` | 422 quando row tem blocker; 403 PROFESSIONAL exportando lote de outro profissional; ids de outra clínica → 404/403; sucesso cria batch + emissões `EXPORTADO` (mock Prisma, padrão de `conciliacao/reconcile/route.test.ts`) |
| `src/app/api/financeiro/fiscal/receita-saude/batches/[id]/result/route.test.ts` | atualiza EMITIDO/ERRO; idempotente em re-upload; 404 batch de outra clínica; arquivo inválido → 422 |
| `src/lib/rbac/permissions.test.ts` (alterar) | nova feature `fiscal` presente nos defaults dos dois roles |

Gates antes de cada commit: `npx prisma generate`, `npm run test`,
`npm run build`.

---

## 5. Etapas de Implementação

Cada etapa termina verificável (testes verdes + build). Feature branch via
worktree isolado: `bash scripts/new-feature.sh receita-saude-dmed`.

1. **Schema + migração offline.** Editar `prisma/schema.prisma` (3.1); autorar
   `prisma/migrations/<ts>_add_fiscal_compliance/migration.sql` à mão (sem
   `db push`/`migrate dev`); `npx prisma generate`; `npm run build`.
   *Verificação*: build verde; SQL revisado espelha o schema.
2. **RBAC.** Adicionar feature `fiscal` em `types.ts`/`permissions.ts` +
   labels; ajustar `permissions.test.ts`.
   *Verificação*: `npx vitest run src/lib/rbac/permissions.test.ts`.
3. **Domínio: CPF + eventos de pagamento.** `cpf.ts`, `types.ts`,
   `payment-events.ts`, `fiscal-period.ts` + testes.
   *Verificação*: `npx vitest run src/lib/fiscal/`.
4. **Domínio: validação + arquivos Receita Saúde.** Confirmar o layout
   oficial RFB 11/2025 (Riscos R1) e implementar `recibo-validation.ts`,
   `recibo-file-builder.ts`, `recibo-result-parser.ts` + golden tests.
   *Verificação*: roundtrip builder→parser nos testes.
5. **Domínio: DMED.** Confirmar leiaute DMED vigente (Riscos R1);
   `dmed-aggregation.ts`, `dmed-file-builder.ts`, `dmed-csv.ts`,
   `pending-issues.ts` + testes.
6. **Config fiscal.** Rotas `/api/financeiro/fiscal/config` (GET/PUT),
   `FiscalConfigTab` em `/admin/settings`, campos fiscais no formulário e nas
   rotas de profissionais (+ `field-labels`).
   *Verificação*: salvar config e campos do profissional manualmente no
   worktree; testes existentes de professionals continuam verdes.
7. **Helper de ownership.** Criar `src/lib/clinic/ownership.ts`
   (`assertInvoicesInClinic`, `assertReconciliationLinksInClinic`,
   `assertProfessionalInClinic` — cada um lança/retorna ids inválidos) + teste.
8. **Query helper + rotas Receita Saúde.** `src/lib/fiscal/queries.ts`;
   rotas `payments`, `export`, `batches`, `batches/[id]` (DELETE),
   `batches/[id]/result`, `emissions/[id]/cancel` + route tests (export,
   result). Audit actions novas em `rbac/audit.ts`.
   *Verificação*: route tests; smoke manual com dados de prod sincronizados.
9. **UI Receita Saúde.** Página + componentes (3.6), tab no layout do
   financeiro, exclusão do FilterBar.
   *Verificação*: fluxo completo manual — listar → exportar → upload
   resultado → status EMITIDO/ERRO; `npm run build`.
10. **Rotas + UI DMED.** `dmed`, `dmed/file`, `dmed/csv` + página/componentes.
    *Verificação*: conferência bate com faturas do ano no banco local;
    download dos dois arquivos.
11. **Chip do dashboard.** Rota `pending-count` + `PendingRecibosChip` em
    `/financeiro`.
12. **Cron de todos fiscais.** `src/lib/jobs/fiscal-todos.ts` + rota
    `/api/jobs/fiscal-todos` + entrada em `vercel.json` + testes.
    *Verificação*: chamada manual com `CRON_SECRET` cria todos uma única vez.
13. **Gates finais + commit.** `npx prisma generate && npm run test &&
    npm run build`; commit convencional local (sem push):
    `feat(fiscal): recibos Receita Saúde em lote + exportação DMED`.

---

## 6. Riscos e Questões em Aberto

- **R1 — Layouts oficiais não verificados (bloqueador das etapas 4/5).**
  O layout do arquivo de lote do Receita Saúde (fluxo de 11/2025) e o leiaute
  DMED vigente precisam ser confirmados na documentação oficial da RFB antes
  de codificar os builders. Mitigação: os builders/parsers são módulos puros
  isolados e versionáveis (`recibo-file-builder.ts`, `dmed-file-builder.ts`);
  o resto da feature não depende dos detalhes do formato. Se o layout de lote
  não embutir uma referência de linha reaproveitável, o parser do resultado
  reassocia por posição (ordem das linhas do lote, persistida nas emissões).
- **R2 — Fonte do CPF do pagador.** Usamos `Patient.billingCpf`; o spec
  mencionava `PatientUsualPayer`, que não tem CPF (é matcher de nomes
  bancários). Se um mesmo paciente tiver pagadores diferentes ao longo do ano
  (pai paga 1º semestre, mãe o 2º), o modelo atual só representa um pagador
  por paciente — o recibo sai com o pagador vigente. Aceito para v1;
  evolução: pagador por fatura.
- **R3 — Troca de regime única.** `fiscalRegime + fiscalRegimeSince` suporta
  uma troca (o regime anterior é inferido como o oposto). Duas trocas no
  mesmo ano exigiriam uma tabela de histórico — fora do escopo v1.
- **R4 — Pagamentos manuais sem granularidade.** Fatura `PARCIAL` marcada à
  mão não tem data/valor por parcela; esses casos ficam no bucket
  "sem origem" até conciliação. Pode frustrar clínicas sem integração
  bancária — monitorar e, se necessário, criar registro manual de parcela.
- **R5 — Todo DMED sem destinatário.** `Todo` exige `professionalProfileId`;
  ADMINs sem profile não recebem a tarefa (fallback: primeiro profissional
  ativo). Aceitável, mas documentar no changelog.
- **R6 — Janela retroativa hardcoded.** O prazo 28/02 vai no texto do todo,
  não em lógica. Confirmar anualmente (regra RFB pode mudar).
- **R7 — Emissor vs profissional que atendeu.** O recibo sai no
  `professionalProfileId` da fatura; itens atendidos por outro profissional
  dentro da mesma fatura (cobertura) saem no nome do dono da fatura. Clínicas
  afetadas devem ativar `splitInvoiceByProfessional`. Documentar.
- **Q1** — O arquivo de lote aceita múltiplos emissores (CPFs) ou um por
  arquivo? O design assume **um profissional por lote** (mais seguro);
  confirmar com o layout oficial.
- **Q2** — Recibos de valores recebidos via crédito de sessão
  (`SessionCredit`) não geram novo pagamento (o pagamento original já gerou
  recibo) — confirmar entendimento contábil com usuário beta.
- **Q3** — A aba "Receita Saúde" deve ficar oculta para clínicas 100% PJ (e
  "DMED" para 100% PF)? v1 mostra ambas com estados vazios explicativos;
  reavaliar com feedback.
