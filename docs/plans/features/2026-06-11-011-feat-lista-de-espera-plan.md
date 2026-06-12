---
title: "feat: Lista de espera com oferta automática de horários"
type: feat
status: draft
date: 2026-06-11
slug: lista-de-espera
priority: 7
complexity: L
---

# feat: Lista de espera com oferta automática de horários

## 1. Contexto de Negócio

### Problema

Cada sessão de 50 minutos cancelada é receita perdida e não recuperável
(R$ 150–300 por slot). Hoje, quando um `Appointment` do tipo CONSULTA é
cancelado — pelo staff, pelo paciente via link HMAC, em lote, ou por exceção
de recorrência — o horário simplesmente "some" da agenda. Preencher o buraco
depende da memória da secretária: lembrar quem estava esperando vaga, ligar
um por um, negociar horário. Na prática a maioria dos slots vagos fica vazia.

A Clinica já possui todas as peças do quebra-cabeça: fluxos de cancelamento
centralizados, exceções de recorrência, serviço de notificações com links
HMAC, verificação transacional de conflitos (`checkConflict` com `FOR UPDATE`)
e o modelo `Todo` para triagem do staff. Falta apenas a fila de espera e o
mecanismo que converte cancelamento em sessão preenchida.

### Evidência de mercado

- **Jane App**: o auto-preenchimento de cancelamentos é citado por reviewers
  como a feature favorita do produto.
- **Amplimed**: anuncia "até 38% menos faltas/ociosidade" com recuperação de
  agenda.
- Também presente em **Power Diary/Zanda, Feegow, Doctoralia (appointment
  anticipation), Clínica nas Nuvens, Cliniko**.
- Entre sistemas brasileiros para clínicas de psicologia o recurso ainda é
  **raro** — é diferencial competitivo direto, e se encaixa nos fluxos de
  cancelamento já existentes da Clinica (Roadmap Tier 2 #7).

### Usuários-alvo

| Persona | O que ganha |
|---|---|
| **ADMIN** | Página de gestão da lista, configuração do modo (triagem/automático), métricas de conversão e receita recuperada |
| **PROFESSIONAL** | Vê e gerencia entradas que o citam (ou "qualquer profissional"); recebe Todo de triagem quando abre horário seu |
| **Secretária (ADMIN)** | Em vez de planilha/caderno: fila priorizável com um clique para ofertar ou agendar |
| **Paciente / lead** | Recebe oferta de horário por WhatsApp/e-mail com link de aceite em 1 clique |

### Métricas de sucesso

- **Taxa de conversão de slot vago**: % de cancelamentos futuros de CONSULTA
  que terminam preenchidos por alguém da lista (meta inicial: 20%).
- **Tempo médio de espera** das entradas ATIVAS caindo mês a mês.
- **Receita recuperada estimada**: nº de conversões × `Patient.sessionFee`.
- Adoção: % de clínicas com ≥ 1 entrada ativa na lista após 60 dias.

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **ADMIN/secretária**, cadastro um paciente existente (ou um lead com
   nome/telefone) na lista de espera com preferências ("seg/qua 18:00–21:00",
   modalidade, profissional específico ou qualquer um) e uma nota de
   prioridade.
2. Como **PROFESSIONAL**, vejo as entradas que me citam ou que aceitam
   qualquer profissional, e adiciono pacientes meus à lista.
3. Como **ADMIN**, arrasto entradas para reordenar a prioridade manual e
   arquivo entradas com motivo.
4. Como **staff**, quando uma CONSULTA futura é cancelada, recebo um Todo
   "Horário vago 17/06 14:00 — 3 na lista de espera" e, na agenda, abro a
   lista de correspondências com um clique para ligar/agendar (modo triagem,
   default).
5. Como **ADMIN**, ativo o modo de **oferta automática**: o sistema envia a
   oferta ao melhor candidato (sequencial com janela de exclusividade) ou a
   todos os candidatos (broadcast, primeiro que aceitar leva).
6. Como **paciente**, recebo mensagem com link, vejo os detalhes do horário e
   aceito; o agendamento é criado na hora (com revalidação de conflito) e as
   demais ofertas do slot expiram com mensagem educada.
7. Como **ADMIN**, acompanho na página de gestão: aguardando, tempo médio de
   espera, ofertas enviadas, taxa de conversão, receita recuperada estimada.

### 2.2 Fluxos por papel

**Staff — cadastrar na lista**
1. Origens: página do paciente (ação "Adicionar à lista de espera"), botão na
   página `/espera`, ou quick-add no painel lateral da agenda.
2. Sheet de cadastro: busca de paciente existente (`PatientSearch` reutilizado)
   **ou** toggle "Ainda não é paciente" liberando campos Nome + Telefone
   (+ E-mail opcional) do lead.
3. Campos: profissional (select com opção "Qualquer profissional"),
   dias da semana (chips seg–dom), faixas de horário (lista de "HH:mm–HH:mm"),
   modalidade (Qualquer / Online / Presencial), nota de prioridade (texto).
4. Duplicidade: já existindo entrada ATIVA/OFERTADA do mesmo paciente para o
   mesmo profissional (ou "qualquer"), o POST retorna 409 com
   "Este paciente já está na lista de espera".

**Staff — triagem (modo default)**
1. Cancelamento de CONSULTA futura dispara o matching. Havendo ≥ 1 candidato:
   - Cria `Todo` para o profissional do slot, no dia do slot:
     título "Horário vago 17/06 14:00 — 3 na lista de espera", notas com os
     três primeiros nomes + telefones.
   - Na agenda, o card cancelado ganha botão "Lista de espera (3)" que abre o
     diálogo de correspondências.
2. Diálogo de correspondências (`SlotMatchesDialog`): lista ranqueada com
   nome, telefone, preferências, badge "Já tem sessão neste dia" quando
   aplicável, e ações por linha: **"Enviar oferta"** (cria WaitlistOffer +
   notificação, mesmo em modo triagem) e **"Agendar"** (abre o
   `CreateAppointmentSheet` pré-preenchido com paciente/horário).
3. Cancelamentos em série/lote (série de recorrência, bulk-cancel) geram **um
   único Todo** "N horários vagos entre {{primeiraData}} e {{últimaData}} —
   ver lista de espera" — nunca ofertas em massa.

**Sistema — oferta automática (opt-in por clínica)**
1. Pré-requisitos: `waitlistSettings.mode = "OFERTA_AUTOMATICA"` **e**
   `Clinic.appointmentNotificationsEnabled = true` (gate existente de
   notificações outbound). Sem o gate, o slot cai em triagem.
2. Slot abrindo com menos de `minNoticeHours` (default 3h) de antecedência:
   **só triagem** (sem oferta automática).
3. Estratégia **SEQUENCIAL** (default): melhor candidato recebe oferta
   exclusiva com expiração `min(agora + holdHours, início do slot)`
   (holdHours default 2). Expirou/recusou → próximo candidato (cron + avanço
   imediato na recusa).
4. Estratégia **BROADCAST**: todos os candidatos (cap de 10) recebem a oferta
   simultaneamente; o primeiro aceite leva; os demais expiram com mensagem
   educada.
5. Apenas entradas **com `patientId`** participam da oferta automática
   (consentimento LGPD verificável + criação direta de Appointment). Leads
   aparecem somente na triagem — V1; ver Questões em Aberto.
6. Consentimento: WhatsApp exige `consentWhatsApp`; e-mail exige
   `consentEmail`. Sem nenhum consentimento → pula o candidato (vai para o
   próximo) e ele permanece na triagem.

**Paciente — aceitar a oferta (página pública `/oferta?token=...`)**
1. GET valida o token (hash) e mostra: profissional, data DD/MM/YYYY, horário
   HH:mm–HH:mm, modalidade, prazo de expiração.
2. **"Aceitar horário"**: transação com `checkConflict` (lock de linha) →
   cria `Appointment` CONSULTA AGENDADO (price = `sessionFee` do paciente) →
   oferta ACEITA → entrada CONVERTIDA → demais ofertas ENVIADAS do mesmo slot
   expiram + mensagem educada → notificação de confirmação ao paciente.
3. **"Não tenho interesse"**: oferta RECUSADA, entrada volta a ATIVA;
   estratégia sequencial avança imediatamente para o próximo.
4. Token expirado/slot ocupado: "Este link expirou ou o horário já foi
   preenchido. Você continua na lista de espera."

### 2.3 Telas

**`/espera` — página de gestão (desktop e mobile)**
- Header: título "Lista de espera", botão "Adicionar".
- Linha de cards de métricas: "Aguardando", "Tempo médio de espera",
  "Ofertas enviadas (30 dias)", "Taxa de conversão", "Receita recuperada
  (estimada)" em R$.
- Tabs de status: **Ativas | Ofertadas | Convertidas | Removidas**.
- Tab "Ativas": lista ordenável por drag (dnd-kit, já no projeto) com:
  posição, nome (paciente → link para a ficha; lead → badge "Lead"),
  telefone, profissional ("Qualquer profissional" quando null), preferências
  resumidas ("Seg, Qua • 18:00–21:00 • Online"), espera ("há 12 dias"), nota
  de prioridade, menu (Editar / Enviar oferta manual / Remover).
- Remoção abre diálogo com campo "Motivo da remoção" (obrigatório).
- PROFESSIONAL sem `agenda_others` READ vê apenas entradas próprias + "qualquer
  profissional", e as métricas restritas a esse recorte.

**Agenda — painel lateral**
- Botão com ícone `ListPlus` (lucide) + badge com contagem de ATIVAS no
  `AgendaHeader`, abrindo `WaitlistSidePanel` (Sheet existente): lista
  compacta das entradas do(s) profissional(is) visível(is), quick-add e link
  "Ver tudo" → `/espera`.
- Card de CONSULTA cancelada (`CalendarEntrySheet`): seção "Lista de espera"
  com botão "Ver correspondências (N)" → `SlotMatchesDialog`.

**Configurações (admin/settings) — nova aba "Lista de espera"**
- "Modo de operação": radio **Triagem manual** (default) / **Oferta
  automática** (desabilitado com hint quando
  `appointmentNotificationsEnabled` é false).
- "Estratégia de oferta": **Sequencial (um por vez)** / **Todos de uma vez**.
- "Janela de exclusividade (horas)": número, default 2.
- "Antecedência mínima (horas)": número, default 3 — "Horários vagando com
  menos antecedência entram apenas na triagem".

**Página pública `/oferta`** — mesma identidade visual de `/confirm` e
`/cancel`: card central com detalhes do slot, botões "Aceitar horário"
(primário) e "Não tenho interesse" (ghost), estados de sucesso/erro/expirado.

### 2.4 Regras de negócio

1. **Gatilhos**: somente CONSULTA com `blocksTime = true` e `scheduledAt`
   futuro dispara o fluxo. LEMBRETE/NOTA nunca disparam (não bloqueiam
   horário); TAREFA/REUNIAO não disparam (não são sessão faturável).
2. **Caminhos cobertos**: cancelamento staff (single/série), cancelamento
   público via HMAC, bulk-cancel, mudança de status para `CANCELADO_*` (só
   slots futuros), DELETE do appointment, PATCH que **move** o appointment
   (o horário antigo abre), exceção de recorrência (`skip` de uma data).
3. **Lote**: ≥ 2 slots abertos numa mesma operação → um único Todo, nunca
   ofertas automáticas.
4. **Ranking**: (a) profissional explícito > "qualquer"; (b) só entram
   candidatos cuja preferência cobre o slot (dia da semana + janela de
   horário + modalidade; preferências vazias = aceita tudo); (c) desempate
   por prioridade manual (asc) e idade de espera (createdAt asc).
5. **Flag "já tem sessão no dia"**: candidato com Appointment não-cancelado
   no mesmo dia continua elegível, mas é exibido com badge e, na oferta
   sequencial automática, é pulado para o final do ranking.
6. **Uma oferta aberta por entrada**: entrada OFERTADA não recebe nova oferta
   até resolver a atual.
7. **Expiração**: nunca depende só do cron — o aceite valida `expiresAt` e
   `status` na transação; o cron faz a "faxina" (marcar EXPIRADA, avisar,
   avançar a cadeia sequencial).
8. **Duplicidade**: índice único parcial impede 2 entradas ATIVA/OFERTADA do
   mesmo paciente+profissional na mesma clínica (e checagem na API com 409).
9. **Falha isolada**: o processamento da lista de espera roda em try/catch —
   um erro no matching/notificação **nunca** falha o cancelamento que o
   originou.
10. **Auditoria**: criação/edição/remoção de entrada, envio, aceite, recusa e
    expiração de oferta, e conversão geram `AuditLog` (userId null nos fluxos
    públicos/cron).
11. **Agendamento-online** (feature planejada, não implementada): quando
    existir, a expiração de oferta devolve o slot ao pool público. No V1 é
    no-op documentado.

### 2.5 Edge cases

| Caso | Comportamento |
|---|---|
| Slot cancelado e re-ocupado manualmente antes do aceite | `checkConflict` na transação de aceite falha → página mostra "horário já foi preenchido", oferta EXPIRADA, entrada volta a ATIVA |
| Dois pacientes aceitam broadcast simultaneamente | Lock `FOR UPDATE` do `checkConflict` serializa; o segundo recebe "já preenchido" |
| Paciente da entrada foi desativado/excluído | Matching ignora entradas cujo paciente está `isActive = false`; FK `onDelete: Cascade` remove entradas de paciente excluído |
| Oferta aceita de entrada já CONVERTIDA/REMOVIDA | 400 "Esta oferta não está mais disponível" |
| Slot no passado (ex.: status CANCELADO_FALTA após a sessão) | `decideSlotTrigger` retorna SKIP |
| Cancelamento de sessão de grupo | Fora do escopo V1 (slot compartilhado não "abre" para 1 paciente) — documentado |
| Clínica sem entradas ATIVAS | Nenhum Todo/oferta criado (zero ruído) |
| Todo de triagem duplicado (2 cancelamentos do mesmo slot) | Dedupe: não cria Todo aberto idêntico (mesmo profissional + dia + título) |
| Token reutilizado após aceite | Status ≠ ENVIADA → "Este link expirou ou o horário já foi preenchido" |

### 2.6 Copy pt-BR (chaves principais)

- Painel/página: **"Lista de espera"**; botão **"Adicionar à lista de espera"**.
- Status: `ATIVA` → "Ativa", `OFERTADA` → "Oferta enviada",
  `CONVERTIDA` → "Convertida", `REMOVIDA` → "Removida".
- Profissional nulo: **"Qualquer profissional"**.
- Todo triagem: `Horário vago {{date}} {{time}} — {{n}} na lista de espera`.
- Todo lote: `{{n}} horários vagos entre {{firstDate}} e {{lastDate}} — ver lista de espera`.
- Oferta (WhatsApp/e-mail):
  `Olá {{patientName}}! Surgiu um horário com {{professionalName}} no dia {{date}} às {{time}} ({{modality}}). Para aceitar, acesse: {{offerUrl}}. Esta oferta é válida até {{expiresAt}}.`
- Assunto e-mail: `Horário disponível — {{date}} às {{time}}`.
- Expiração educada:
  `O horário de {{date}} às {{time}} já foi preenchido. Você continua na nossa lista de espera e avisaremos na próxima oportunidade.`
- Página de aceite: título "Oferta de horário"; botões "Aceitar horário" /
  "Não tenho interesse"; sucesso "Horário confirmado! Você receberá os
  detalhes em breve."; erro "Este link expirou ou o horário já foi
  preenchido. Você continua na lista de espera."
- Datas sempre `DD/MM/YYYY`, horas `HH:mm` (24h), moeda `R$` com locale
  `pt-BR`.

---

## 3. Design Técnico

### 3.1 Prisma schema (prisma/schema.prisma)

Novos enums:

```prisma
enum WaitlistEntryStatus {
  ATIVA
  OFERTADA
  CONVERTIDA
  REMOVIDA
}

enum WaitlistOfferStatus {
  ENVIADA
  ACEITA
  EXPIRADA
  RECUSADA
}
```

Valores novos no enum existente `NotificationType`:

```prisma
enum NotificationType {
  // ... existentes ...
  WAITLIST_OFFER
  WAITLIST_OFFER_EXPIRED
}
```

> O **modo** (TRIAGEM/OFERTA_AUTOMATICA) e a **estratégia**
> (SEQUENCIAL/BROADCAST) NÃO viram enums de banco: vivem no Json
> `Clinic.waitlistSettings`, validado por zod — mesmo precedente do
> `agendaColors` (resolver obrigatório, nunca cast direto).

Campo novo em `Clinic`:

```prisma
  /// Configuração da lista de espera. Shape: { mode, strategy, holdHours,
  /// minNoticeHours }. Leituras SEMPRE via resolveWaitlistSettings() em
  /// src/lib/waitlist/settings.ts — nunca cast direto.
  waitlistSettings Json @default("{}")
```

Novos modelos (clinic-scoped, índices compostos por `clinicId`):

```prisma
/// Entrada na lista de espera. patientId nulo = lead (leadName/leadPhone).
model WaitlistEntry {
  id                     String              @id @default(cuid())
  clinicId               String
  patientId              String?
  leadName               String? // obrigatório (app-level) quando patientId é nulo
  leadPhone              String?
  leadEmail              String?
  professionalProfileId  String? // null = qualquer profissional
  /// Shape: { weekdays: number[], timeRanges: {start,end}[], modality }
  /// Validado por waitlistPreferencesSchema (zod). Vazio = aceita tudo.
  preferences            Json                @default("{}")
  priorityNote           String?
  priority               Int                 @default(0) // ordenação manual (drag)
  status                 WaitlistEntryStatus @default(ATIVA)
  removedReason          String?
  lastOfferedAt          DateTime?
  convertedAppointmentId String? // Appointment criado na conversão (métricas)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic              Clinic               @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  patient             Patient?             @relation(fields: [patientId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile? @relation(fields: [professionalProfileId], references: [id], onDelete: SetNull)
  offers              WaitlistOffer[]

  @@index([clinicId, status])
  @@index([clinicId, professionalProfileId, status])
  @@index([patientId])
  // Índice único PARCIAL anti-duplicidade (Prisma DSL não expressa parciais;
  // criado direto na migration SQL — mesmo precedente do Todo 20260503100000):
  //   UNIQUE (clinicId, patientId, COALESCE(professionalProfileId, ''))
  //   WHERE status IN ('ATIVA','OFERTADA') AND patientId IS NOT NULL
}

/// Oferta de um slot específico a uma entrada da lista.
model WaitlistOffer {
  id                    String              @id @default(cuid())
  clinicId              String
  entryId               String
  professionalProfileId String
  slotStart             DateTime
  slotEnd               DateTime
  modality              AppointmentModality?
  tokenHash             String              @unique // sha256 do token bruto do link
  status                WaitlistOfferStatus @default(ENVIADA)
  expiresAt             DateTime
  respondedAt           DateTime?
  appointmentId         String? // Appointment criado no aceite
  sourceAppointmentId   String? // Appointment cancelado que abriu o slot (métricas)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic              Clinic              @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  entry               WaitlistEntry       @relation(fields: [entryId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)

  @@index([clinicId, status, expiresAt])
  @@index([clinicId, slotStart])
  @@index([entryId])
}
```

Relações inversas a adicionar: `Clinic.waitlistEntries` / `Clinic.waitlistOffers`,
`Patient.waitlistEntries`, `ProfessionalProfile.waitlistEntries` /
`ProfessionalProfile.waitlistOffers`.

**Migration (SQL autorado offline — NUNCA `prisma db push`/`migrate dev`)**
`prisma/migrations/20260611120000_waitlist/migration.sql`:

```sql
CREATE TYPE "WaitlistEntryStatus" AS ENUM ('ATIVA','OFERTADA','CONVERTIDA','REMOVIDA');
CREATE TYPE "WaitlistOfferStatus" AS ENUM ('ENVIADA','ACEITA','EXPIRADA','RECUSADA');

ALTER TYPE "NotificationType" ADD VALUE 'WAITLIST_OFFER';
ALTER TYPE "NotificationType" ADD VALUE 'WAITLIST_OFFER_EXPIRED';

ALTER TABLE "Clinic" ADD COLUMN "waitlistSettings" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "WaitlistEntry" ( ... colunas conforme schema ... );
CREATE TABLE "WaitlistOffer" ( ... colunas conforme schema ... );

-- índices @@index conforme schema +
CREATE UNIQUE INDEX "WaitlistEntry_active_dedupe_uniq"
  ON "WaitlistEntry" ("clinicId", "patientId", COALESCE("professionalProfileId", ''))
  WHERE "status" IN ('ATIVA','OFERTADA') AND "patientId" IS NOT NULL;
```

> Atenção: os novos valores de `NotificationType` não podem ser usados em
> DML dentro da MESMA migration (limitação do Postgres) — esta migration só
> faz DDL, então não há problema.

### 3.2 Módulo de domínio `src/lib/waitlist/`

Funções puras, sem dependência de framework; serviço Prisma isolado em
arquivo próprio. Todos os arquivos < 200 linhas; barrel `index.ts`.

```
src/lib/waitlist/
├── index.ts            # barrel
├── types.ts            # tipos compartilhados
├── preferences.ts      # zod schema + parse seguro das preferências
├── settings.ts         # resolver do Clinic.waitlistSettings
├── matching.ts         # ranking puro de candidatos
├── slot-events.ts      # decisão de gatilho por slot (puro)
├── offer-tokens.ts     # token aleatório + sha256 + URL
├── expiry.ts           # expiração e avanço sequencial (puro)
├── metrics.ts          # agregação de métricas (puro)
├── slot-opened.ts      # SERVIÇO (Prisma): orquestra triagem/oferta
└── *.test.ts           # colocados (ver Plano de Testes)
```

Assinaturas principais:

```ts
// types.ts
export interface WaitlistPreferences {
  weekdays: number[]                       // 0=domingo … 6=sábado; [] = qualquer
  timeRanges: { start: string; end: string }[] // "HH:mm"; [] = qualquer
  modality: "ONLINE" | "PRESENCIAL" | null     // null = qualquer
}
export interface OpenSlot {
  professionalProfileId: string
  scheduledAt: Date                        // UTC
  endAt: Date
  modality: "ONLINE" | "PRESENCIAL" | null
  sourceAppointmentId: string | null
}
export interface LocalSlot { weekday: number; startTime: string; endTime: string } // no fuso da clínica
export interface MatchableEntry {
  id: string
  patientId: string | null
  professionalProfileId: string | null
  preferences: WaitlistPreferences
  priority: number
  createdAt: Date
}
export interface MatchCandidate {
  entry: MatchableEntry
  professionalMatch: boolean               // citou o profissional do slot
  hasSameDayAppointment: boolean
}

// preferences.ts
export const waitlistPreferencesSchema: z.ZodType<WaitlistPreferences>
export function parsePreferences(json: unknown): WaitlistPreferences // fallback p/ "aceita tudo"

// settings.ts
export interface WaitlistSettings {
  mode: "TRIAGEM" | "OFERTA_AUTOMATICA"
  strategy: "SEQUENCIAL" | "BROADCAST"
  holdHours: number          // default 2
  minNoticeHours: number     // default 3
}
export function resolveWaitlistSettings(json: unknown): WaitlistSettings // defaults seguros

// matching.ts
export function toLocalSlot(slot: { scheduledAt: Date; endAt: Date }, timezone: string): LocalSlot
export function slotMatchesPreferences(local: LocalSlot, modality: OpenSlot["modality"], prefs: WaitlistPreferences): boolean
export function rankCandidates(input: {
  slot: OpenSlot
  local: LocalSlot
  entries: MatchableEntry[]
  sameDayPatientIds: Set<string>           // pacientes com sessão no dia do slot
}): MatchCandidate[]
// ordena: professionalMatch desc → priority asc → createdAt asc;
// hasSameDayAppointment vai para o fim em modo automático (flag preservada p/ UI)

// slot-events.ts
export type SlotTriggerDecision = "AUTO" | "TRIAGE_ONLY" | "SKIP"
export function decideSlotTrigger(input: {
  type: string; blocksTime: boolean; scheduledAt: Date; now: Date
  mode: WaitlistSettings["mode"]; minNoticeHours: number
  notificationsEnabled: boolean; batchSize: number   // > 1 ⇒ TRIAGE_ONLY
}): SlotTriggerDecision
export function buildTriageTodoTitle(slotLocalDate: string, slotLocalTime: string, matchCount: number): string
export function buildBatchTodoTitle(count: number, firstDate: string, lastDate: string): string

// offer-tokens.ts
export function generateOfferToken(): string                 // 32 bytes randomBytes → hex
export function hashOfferToken(token: string): string        // sha256 hex
export function buildOfferUrl(baseUrl: string, token: string): string // `${baseUrl}/oferta?token=...`

// expiry.ts
export function isOfferExpired(offer: { status: string; expiresAt: Date }, now: Date): boolean
export function computeOfferExpiry(now: Date, holdHours: number, slotStart: Date): Date // min(now+hold, slotStart)
export function nextSequentialCandidate(
  ranked: MatchCandidate[],
  alreadyOfferedEntryIds: Set<string>
): MatchCandidate | null

// metrics.ts
export interface WaitlistMetrics {
  waiting: number; avgWaitDays: number
  offersSent30d: number; conversionRate: number  // ACEITA / ENVIADA (período)
  revenueRecovered: number                       // Σ sessionFee das conversões
}
export function computeWaitlistMetrics(input: {
  activeEntries: { createdAt: Date }[]
  offers: { status: string; createdAt: Date }[]
  conversions: { sessionFee: number | null }[]
  now: Date
}): WaitlistMetrics
```

**Serviço `slot-opened.ts`** (único arquivo do módulo com Prisma):

```ts
export async function handleSlotsOpened(input: {
  clinicId: string
  slots: OpenSlot[]
  trigger: string            // p/ auditoria: "STAFF_CANCEL" | "PUBLIC_CANCEL" | ...
}): Promise<void>
```

Pipeline interno: carrega `Clinic` (timezone, `waitlistSettings`,
`appointmentNotificationsEnabled`) → carrega entradas ATIVA da clínica
(paciente `isActive`) → para cada slot: `decideSlotTrigger` →
TRIAGE_ONLY: cria Todo dedupado (assignee = profissional do slot) →
AUTO: ranqueia, cria `WaitlistOffer`(s) + `Notification` via
`createAndSendNotification` (consent-gated), entrada → OFERTADA,
`lastOfferedAt`, audit log. **Sempre chamado dentro de try/catch nos
adapters** — erro vira `console.error`, nunca quebra o cancelamento.

### 3.3 Helpers de ownership `src/lib/clinic/ownership.ts` (novo)

```ts
export async function patientBelongsToClinic(patientId: string, clinicId: string): Promise<boolean>
export async function professionalBelongsToClinic(professionalProfileId: string, clinicId: string): Promise<boolean>
// findFirst({ where: { id, clinicId } }) — ProfessionalProfile via relação user.clinicId
```

Usados em TODO handler que recebe FK no body (convenção do projeto:
`withFeatureAuth` NÃO escopa — o handler valida).

### 3.4 RBAC

`src/lib/rbac/types.ts`: adicionar `"waitlist"` a `FEATURES` e
`FEATURE_LABELS["waitlist"] = "Lista de Espera"`.

`src/lib/rbac/permissions.ts` (`ROLE_DEFAULTS`):

| Feature | ADMIN | PROFESSIONAL |
|---|---|---|
| `waitlist` | WRITE | WRITE |

Escopo de visibilidade dentro dos handlers (não no wrapper): usuário **sem**
`agenda_others ≥ READ` enxerga apenas entradas com
`professionalProfileId ∈ { o seu, null }`; com `agenda_others`, vê todas da
clínica. (Espelha o padrão do route de cancel: `meetsMinAccess(user.permissions.agenda_others, ...)`.)

`src/lib/rbac/audit.ts` — novas `AuditAction`:
`WAITLIST_ENTRY_CREATED`, `WAITLIST_ENTRY_UPDATED`, `WAITLIST_ENTRY_REMOVED`,
`WAITLIST_ENTRIES_REORDERED`, `WAITLIST_OFFER_SENT`,
`WAITLIST_OFFER_ACCEPTED`, `WAITLIST_OFFER_DECLINED`,
`WAITLIST_OFFER_EXPIRED`, `WAITLIST_CONVERTED`.

### 3.5 API routes

Autenticadas (todas `withFeatureAuth`, handlers magros < 50 linhas de lógica
inline, lógica de negócio no módulo):

| Rota | Método | Auth | Request → Response |
|---|---|---|---|
| `/api/waitlist` | GET | `{ feature: "waitlist", minAccess: "READ" }` | `?status=&professionalProfileId=` → `{ entries: [...] }` escopado por `clinicId` + recorte de visibilidade (3.4) |
| `/api/waitlist` | POST | `waitlist` WRITE | body zod: `{ patientId? , leadName?, leadPhone?, leadEmail?, professionalProfileId?, preferences, priorityNote? }`. Valida XOR paciente/lead, ownership dos FKs (3.3), duplicidade (409). → `{ entry }` |
| `/api/waitlist/[id]` | PATCH | `waitlist` WRITE | edita preferências/nota/profissional; `{ status: "REMOVIDA", removedReason }` arquiva. `findFirst({ id, clinicId })` antes de tudo → 404 |
| `/api/waitlist/[id]` | DELETE | `waitlist` WRITE | hard delete (apenas ADMIN; senão 403) |
| `/api/waitlist/reorder` | POST | `waitlist` WRITE | `{ orderedIds: string[] }` → atualiza `priority` em transação; valida que TODOS os ids pertencem ao `clinicId` |
| `/api/waitlist/matches` | GET | `waitlist` READ | `?professionalProfileId=&start=&end=&modality=` → candidatos ranqueados (usa `rankCandidates`) p/ o `SlotMatchesDialog` |
| `/api/waitlist/[id]/offer` | POST | `waitlist` WRITE | `{ slotStart, slotEnd, professionalProfileId, modality? }` → cria oferta manual + notificação (mesmo em modo triagem); valida ownership + conflito existente no slot |
| `/api/waitlist/metrics` | GET | `waitlist` READ | → `WaitlistMetrics` (recorte de visibilidade aplicado) |

Públicas (em `src/app/api/public/`, sem auth, rate-limited com
`checkRateLimit` + `RATE_LIMIT_CONFIGS.publicApi`, lookup por `tokenHash` —
o `clinicId` vem da própria row e escopa todas as queries seguintes):

| Rota | Método | Comportamento |
|---|---|---|
| `/api/public/waitlist/offer` | GET | `?token=` → hash → oferta ENVIADA não expirada → `{ professionalName, scheduledAt, endAt, modality, expiresAt, clinicName }` (nunca vaza dados do paciente) |
| `/api/public/waitlist/offer/accept` | POST | `{ token }` → transação: revalida oferta + `checkConflict(tx)` → cria Appointment CONSULTA AGENDADO → ACEITA/CONVERTIDA → expira irmãs do slot → audit (userId null). Pós-tx: notificações (confirmação + expirações educadas) |
| `/api/public/waitlist/offer/decline` | POST | `{ token }` → RECUSADA, entrada → ATIVA, audit; sequencial: dispara avanço da cadeia |

Cron (em `src/app/api/jobs/`, auth `Bearer ${CRON_SECRET}` como
send-reminders):

| Rota | Método | Comportamento |
|---|---|---|
| `/api/jobs/waitlist-offers` | GET | (1) marca EXPIRADA toda oferta ENVIADA com `expiresAt <= now`; entrada volta a ATIVA; envia mensagem educada quando o slot foi tomado; (2) p/ clínicas SEQUENCIAL: avança a cadeia (próximo candidato via `nextSequentialCandidate`, se o slot segue livre — `checkConflict`); audit por clínica |

`vercel.json` — adicionar:

```json
{ "path": "/api/jobs/waitlist-offers", "schedule": "*/15 * * * *" }
```

> A cada 15 min exige plano Vercel Pro (atual). A correção do aceite NÃO
> depende do cron (expiração validada na transação); o cron só limpa estado
> e avança a fila.

**Pontos de gancho** (cada um adiciona ~5 linhas: coletar `OpenSlot[]` dos
appointments afetados e chamar `handleSlotsOpened` em try/catch, APÓS o
sucesso da operação):

1. `src/app/api/appointments/[id]/cancel/route.ts` — single (1 slot) e série
   (N slots ⇒ Todo único).
2. `src/app/api/public/appointments/cancel/route.ts` — 1 slot.
3. `src/app/api/appointments/bulk-cancel/route.ts` — N slots ⇒ Todo único.
4. `src/app/api/appointments/[id]/status/route.ts` — transição para
   `CANCELADO_*` com `scheduledAt` futuro.
5. `src/app/api/appointments/[id]/route.ts` — DELETE (slot do appointment) e
   PATCH quando `scheduledAt`/`professionalProfileId` mudou (o slot ANTIGO
   abre).
6. `src/app/api/appointments/recurrences/[id]/exceptions/route.ts` — ação
   `skip` (1 slot da data pulada).

### 3.6 Notificações

- `src/lib/notifications/templates.ts`: templates default para
  `WAITLIST_OFFER` (WhatsApp + e-mail, variáveis `{{patientName}},
  {{professionalName}}, {{date}}, {{time}}, {{modality}}, {{offerUrl}},
  {{expiresAt}}`) e `WAITLIST_OFFER_EXPIRED` (copy da seção 2.6).
- `src/lib/notifications/notification-service.ts`: adicionar os dois tipos a
  `APPOINTMENT_GATED_EMAIL_TYPES` — e-mail de oferta respeita o gate
  `appointmentNotificationsEnabled` (mesma regra de confirmação/lembrete).
- Consentimento LGPD: WhatsApp somente com `consentWhatsApp` (+
  `getPatientPhoneNumbers`), e-mail somente com `consentEmail` — idêntico ao
  fluxo do cancel route.
- Base URL dos links: `process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"`
  (padrão do send-reminders).

### 3.7 UI — arquivos novos e alterados

**Novos:**

```
src/app/espera/page.tsx                          # página de gestão (composição fina)
src/app/espera/components/WaitlistMetricsCards.tsx
src/app/espera/components/WaitlistTable.tsx       # tabs por status + dnd reorder
src/app/espera/components/WaitlistEntryRow.tsx
src/app/espera/components/WaitlistEntrySheet.tsx  # criar/editar (react-hook-form + zod)
src/app/espera/components/PreferencesFields.tsx   # chips de dias + faixas HH:mm + modalidade
src/app/espera/components/ArchiveEntryDialog.tsx  # motivo obrigatório
src/app/agenda/components/WaitlistSidePanel.tsx   # Sheet lateral na agenda
src/app/agenda/components/SlotMatchesDialog.tsx   # correspondências + "Enviar oferta"/"Agendar"
src/app/admin/settings/components/WaitlistTab.tsx # configurações (modo/estratégia/janelas)
src/app/oferta/page.tsx                           # página pública de aceite (espelha /confirm)
```

**Alterados:**

- `src/app/agenda/components/AgendaHeader.tsx`: botão `ListPlus` + badge de
  contagem → abre `WaitlistSidePanel`.
- `src/app/agenda/components/CalendarEntrySheet.tsx`: para CONSULTA cancelada,
  botão "Ver correspondências (N)" → `SlotMatchesDialog` (atenção ao gotcha
  do `patient` nullable — `patient?.name`).
- `src/app/admin/settings/page.tsx`: registrar aba "Lista de espera".
- Página do paciente (`src/app/patients/[id]/...`): ação "Adicionar à lista
  de espera" abrindo `WaitlistEntrySheet` pré-preenchido.
- Rota de settings da clínica (`/api/clinic/...` existente): aceitar e
  validar `waitlistSettings` via `resolveWaitlistSettings`/zod.

**Regras de frontend obrigatórias:** zero `useEffect` cru (dados via fetch em
event handlers/SWR-pattern já usado no projeto; estado derivado inline;
reset por `key`); formulários react-hook-form + zod; toasts Sonner; ícones
lucide-react; inputs de data como texto mascarado DD/MM/YYYY (componente
`DateInput` da agenda) e hora `TimeInput` HH:mm; responsivo desktop
header + bottom-nav mobile (a página `/espera` é acessível pelo painel da
agenda e por link direto — sem novo item no bottom-nav no V1).

### 3.8 Multi-tenancy — checklist

- Toda query Prisma de waitlist filtra `clinicId` (lista, PATCH, reorder,
  matches, métricas).
- FKs de body (`patientId`, `professionalProfileId`) validados via
  `src/lib/clinic/ownership.ts` antes de gravar.
- Rotas públicas: `clinicId` derivado da row encontrada por `tokenHash`;
  nenhuma query subsequente sem esse `clinicId`.
- Cron: itera ofertas/clínicas agrupando por `clinicId`; nunca mistura dados
  entre clínicas no mesmo Todo/notificação.

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`,
`vi.useFakeTimers()` onde houver relógio, enums Prisma como string literal.

| Arquivo | Comportamentos cobertos |
|---|---|
| `src/lib/waitlist/preferences.test.ts` | parse válido; json inválido/`{}`/null → "aceita tudo"; rejeita weekday 7 e horário malformado |
| `src/lib/waitlist/settings.test.ts` | defaults (TRIAGEM, SEQUENCIAL, 2h, 3h); json parcial mescla com defaults; valores inválidos caem no default |
| `src/lib/waitlist/matching.test.ts` | `toLocalSlot` converte UTC→America/Sao_Paulo (weekday/horário corretos, inclusive virada de dia); match por weekday, janela de horário (slot 18:00–18:50 dentro de 18:00–21:00; fora não), modalidade (null aceita ambas); preferências vazias aceitam tudo; ranking: profissional explícito > qualquer; desempate priority asc → createdAt asc; entrada de outro profissional excluída; `hasSameDayAppointment` flagado e rebaixado |
| `src/lib/waitlist/slot-events.test.ts` | CONSULTA futura + modo AUTO + gate on → AUTO; LEMBRETE/NOTA/TAREFA/REUNIAO → SKIP; slot no passado → SKIP; antecedência < minNoticeHours → TRIAGE_ONLY; `batchSize > 1` → TRIAGE_ONLY; gate de notificações off → TRIAGE_ONLY; títulos de Todo (single e lote) com DD/MM e HH:mm |
| `src/lib/waitlist/offer-tokens.test.ts` | token com 64 hex chars e único entre chamadas; hash determinístico; URL `/oferta?token=` correta |
| `src/lib/waitlist/expiry.test.ts` | `isOfferExpired` nas bordas; `computeOfferExpiry` = min(now+hold, slotStart); `nextSequentialCandidate` pula já-ofertados e retorna null quando esgota |
| `src/lib/waitlist/metrics.test.ts` | avgWaitDays; conversionRate ACEITA/ENVIADA (0 ofertas → 0, sem NaN); revenueRecovered soma `sessionFee` tratando null como 0 |
| `src/lib/notifications/templates.test.ts` (estender) | render dos templates `WAITLIST_OFFER` e `WAITLIST_OFFER_EXPIRED` com substituição de todas as variáveis |
| `src/lib/rbac/permissions.test.ts` (estender) | `waitlist` presente nos defaults ADMIN/PROFESSIONAL; `resolvePermissions` honra override NONE |

Gates de qualidade antes de cada commit: `npx prisma generate`,
`npm run test`, `npm run build` — todos verdes.

---

## 5. Etapas de Implementação

Cada etapa compila, passa testes e é commitável isoladamente
(conventional commits, terminando com
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; **nunca** `git push`).

1. **Worktree + banco isolado**: `bash scripts/new-feature.sh lista-de-espera`
   e trabalhar em `../clinica-lista-de-espera`. Verificação: `.env` aponta
   para `clinica_lista_de_espera`.
2. **Schema + migration offline**: editar `prisma/schema.prisma` (enums,
   modelos, relações inversas, `Clinic.waitlistSettings`), autorar
   `prisma/migrations/20260611120000_waitlist/migration.sql` à mão (incl.
   índice único parcial). `npx prisma generate` + aplicar a migration no
   banco da feature com `npx prisma migrate deploy` (banco local da
   worktree). Verificação: generate sem erros, tabelas criadas.
3. **Domínio puro**: `types.ts`, `preferences.ts`, `settings.ts`,
   `matching.ts`, `slot-events.ts`, `offer-tokens.ts`, `expiry.ts`,
   `metrics.ts`, `index.ts` + todos os testes da seção 4. Verificação:
   `npx vitest run src/lib/waitlist`.
4. **RBAC + audit + ownership**: feature `waitlist` (types/permissions/labels),
   `AuditAction`s, novo `src/lib/clinic/ownership.ts`. Estender
   `permissions.test.ts`. Verificação: `npm run test`.
5. **CRUD autenticado**: rotas `/api/waitlist` (GET/POST), `[id]`
   (PATCH/DELETE), `reorder`, `matches`, `metrics` — handlers magros,
   escopo `clinicId`, recorte de visibilidade, 409 de duplicidade.
   Verificação: `npm run build` + smoke manual via curl no dev server.
6. **Templates + gating de notificação**: tipos novos em
   `templates.ts`/`notification-service.ts` + testes. Verificação:
   `npm run test`.
7. **Serviço `slot-opened.ts` + ganchos**: implementar `handleSlotsOpened` e
   plugar nos 6 pontos da seção 3.5 (try/catch, pós-sucesso). Verificação
   manual: cancelar uma CONSULTA no dev → Todo de triagem criado; cancelar
   série → 1 Todo só; cancelar LEMBRETE → nada.
8. **Oferta manual**: rota `/api/waitlist/[id]/offer` + criação de
   `WaitlistOffer` + notificação. Verificação: oferta aparece como ENVIADA e
   `Notification` registrada (WhatsApp mock = SENT).
9. **Rotas públicas + página `/oferta`**: GET/accept/decline com rate limit,
   transação de aceite com `checkConflict`, expiração das irmãs, página
   pública com estados. Verificação manual: aceitar oferta cria Appointment
   AGENDADO; segundo aceite do mesmo slot recebe "já preenchido".
10. **Cron `/api/jobs/waitlist-offers`** + entrada no `vercel.json`.
    Verificação: chamada local com `Bearer $CRON_SECRET` expira ofertas
    vencidas e avança a cadeia sequencial.
11. **UI de gestão `/espera`**: página + componentes (metrics, tabela com
    tabs, sheet de cadastro/edição, dialog de remoção, reorder dnd).
    Verificação: fluxo completo criar→editar→reordenar→remover.
12. **Integração agenda + paciente + settings**: `AgendaHeader` badge,
    `WaitlistSidePanel`, `SlotMatchesDialog` no `CalendarEntrySheet`
    (canceladas), ação na página do paciente, `WaitlistTab` em settings +
    persistência de `waitlistSettings`. Verificação: triagem one-click
    funciona da agenda; modo automático configurável.
13. **Gates finais + commit**: `npx prisma generate && npm run test &&
    npm run build`; revisar arquivos > 200 linhas (split); commit final
    `feat(espera): lista de espera com oferta automática de horários`.
    Após merge: `bash scripts/cleanup-feature.sh lista-de-espera`.

---

## 6. Riscos e Questões em Aberto

### Riscos

1. **WhatsApp é mock**: hoje `whatsapp-mock` marca SENT sem entregar. Na
   prática, oferta automática só chega por **e-mail** (Resend) até o provider
   real existir — e e-mail é gated por `appointmentNotificationsEnabled`
   (default false). Mitigação: UI da aba de configurações deixa o modo
   automático desabilitado com hint enquanto o gate estiver off; modo triagem
   entrega valor desde o dia 1 sem nenhuma notificação outbound.
2. **Corrida slot vago × agendamento manual**: staff pode reagendar o slot
   enquanto há oferta aberta. Mitigado pelo `checkConflict` com lock na
   transação de aceite (o aceite falha educadamente); o inverso (oferta
   pendente não bloqueia o staff) é decisão consciente — staff manda.
3. **Cron a cada 15 min** exige Vercel Pro; em planos menores a cadeia
   sequencial avança mais devagar. Correção não depende do cron (expiração
   validada no aceite), apenas a fluidez da fila.
4. **Timezone**: matching usa `Clinic.timezone` (default
   `America/Sao_Paulo`) para derivar weekday/horário local — testes cobrem a
   conversão, mas clínicas em outros fusos do BR (AM/AC) precisam do campo
   correto.
5. **Volume de Todos**: clínica que cancela muito pode acumular Todos de
   triagem. Mitigação: dedupe por slot + lote vira Todo único.
6. **LGPD**: ofertas só com consentimento registrado; leads (sem cadastro)
   não recebem mensagem automática no V1 — só contato manual do staff.

### Questões em aberto

1. **Leads no modo automático**: quando `agendamento-online` (plano
   2026-06-11-002) for implementado, o aceite de lead deve criar uma
   solicitação pendente de aprovação (fluxo de booking request). Até lá,
   leads ficam restritos à triagem. Revisitar ao implementar a outra feature.
2. **Auto-arquivamento por recusas**: arquivar entrada após N recusas/ofertas
   expiradas consecutivas (sugestão: 3, com Todo avisando o staff)? V1 não
   arquiva automaticamente.
3. **Grupos**: vaga em grupo terapêutico (membership encerrada) deveria
   alimentar a lista? Fora do V1; modelagem atual (slot 1:1) não cobre.
4. **Expiração devolve slot ao pool público** quando agendamento-online
   existir — definir ordem de prioridade (lista de espera primeiro, pool
   depois? por quanto tempo?).
5. **Notificar o profissional** quando um aceite cria agendamento na agenda
   dele (push/e-mail interno)? V1 registra audit + aparece na agenda; sem
   notificação ativa.
6. **Limite por plano SaaS**: entradas de lista de espera devem contar em
   `subscription/limits`? V1 sem limite; avaliar com o time de pricing.
