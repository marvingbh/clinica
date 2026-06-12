---
title: "feat: Agendamento Online (página pública de auto-agendamento)"
type: feat
status: planned
date: 2026-06-11
slug: agendamento-online
priority: 10
complexity: XL
---

# feat: Agendamento Online — página pública de auto-agendamento de pacientes

## 1. Contexto de Negócio

### Problema

Hoje **toda** criação de agendamento na Clinica passa pela equipe da clínica: a
secretária ou o profissional abre a agenda e cria o `Appointment` manualmente.
Não existe nenhuma superfície voltada ao paciente para marcar horário — nem
mesmo para clínicas que já cadastraram suas `AvailabilityRule` /
`AvailabilityException` (modelos que existem desde o início do produto e são a
fundação natural deste recurso).

Isso significa que:

- Pacientes novos só conseguem horário ligando/mandando WhatsApp em horário
  comercial. A Doctoralia reporta que **~35% das marcações acontecem fora do
  horário comercial** — demanda que a clínica perde ou atende com atraso.
- O link de divulgação que toda clínica quer colocar na bio do Instagram /
  WhatsApp Business hoje só pode apontar para a ficha de cadastro
  (`/intake/[slug]`), que não marca horário.
- É a feature mais universalmente anunciada pelos concorrentes diretos:
  **Doctoralia/Docplanner, PsicoManager, PsicoPlanner, Corpora, SimplesAgenda,
  Allminds, Amplimed, iClinic** (BR) e **Jane App, SimplePractice, Cliniko**
  (internacional). É item de comparação em toda decisão de compra
  (Roadmap Tier 1 #2).

### Objetivo

Auto-agendamento público 24/7, restrito à disponibilidade publicada de cada
profissional, com prevenção de conflitos (revalidação transacional) e alertas
para a equipe — em dois modos: **confirmação automática** ou **aprovação pela
equipe** (default, mais conservador, espelhando o fluxo de intake
approve-with-edit já existente).

### Usuários-alvo

- **Paciente / responsável** (não autenticado): escolhe profissional, vê
  horários livres, se identifica e agenda.
- **ADMIN da clínica**: habilita e configura o recurso, aprova/rejeita
  solicitações, gerencia blocklist.
- **PROFESSIONAL**: liga/desliga sua própria listagem, recebe alertas de novos
  agendamentos, aprova/rejeita solicitações dos próprios horários.

### Métricas de sucesso

- % de clínicas ativas com agendamento online habilitado (meta: 30% em 90 dias).
- Nº de agendamentos criados via página pública / total de agendamentos.
- % de bookings fora do horário comercial (validar a tese dos ~35%).
- Taxa de conversão do funil público: visita → slot escolhido → submissão.
- Taxa de rejeição/expiração de solicitações (qualidade do lead).

### Reuso estratégico

O motor de slots (`src/lib/booking`) é deliberadamente **puro e reutilizável**
pelas features futuras do roadmap: portal-do-paciente (reagendamento),
lista-de-espera (claim links) e google-calendar-sync (busy blocks).

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **paciente**, quero abrir `agendar/[clinicSlug]`, escolher um
   profissional e um horário livre e me identificar, para marcar uma sessão sem
   ligar para a clínica.
2. Como **paciente recorrente**, quero que meu telefone seja reconhecido para
   que o agendamento caia direto no meu cadastro (sem duplicar paciente).
3. Como **ADMIN**, quero habilitar o agendamento online, definir antecedência
   mínima, horizonte, modalidades e modo (auto-confirmação vs aprovação), para
   controlar como a agenda é exposta.
4. Como **PROFESSIONAL**, quero um deep link `agendar/[clinicSlug]/[meu-slug]`
   para colocar na bio do Instagram, e quero poder me retirar da listagem.
5. Como **equipe**, quero ser alertada (badge in-app + e-mail + tarefa) quando
   chega uma solicitação, e aprovar/rejeitar em poucos cliques — incluindo
   criar o paciente na hora quando o contato é desconhecido (espelho do fluxo
   de aprovação do intake).
6. Como **paciente**, quero receber a confirmação com links de
   confirmar/cancelar (HMAC já existentes) e entrar no fluxo padrão de
   lembretes.

### 2.2 Fluxo do paciente (público, mobile-first)

`/agendar/[clinicSlug]` (e deep link `/agendar/[clinicSlug]/[professionalSlug]`
que pula a etapa 1):

1. **Escolha do profissional** — cards com foto (avatar com iniciais como
   fallback), nome, especialidade e mini-bio (`ProfessionalProfile.bio`).
   Profissionais sem `AvailabilityRule` ativa ou com `allowOnlineBooking=false`
   **não aparecem**.
2. **Escolha do horário** — visão semanal mobile-first (colunas por dia,
   navegação ‹ semana ›), exibindo apenas slots livres calculados pelo motor.
   Datas em `DD/MM`, horas em `HH:mm` (24h), timezone fixo America/Sao_Paulo.
   Se a clínica permite ambas as modalidades, seletor ONLINE/PRESENCIAL.
3. **Identificação** — formulário react-hook-form + zod: nome completo,
   telefone (máscara BR com suporte internacional via `src/lib/phone`), e-mail,
   CPF (opcional), checkbox de consentimento LGPD (obrigatório) com texto:
   _"Autorizo o contato por WhatsApp e e-mail para confirmações e lembretes de
   sessões, conforme a Política de Privacidade."_ Campo honeypot oculto
   (`website`). Botão **"Confirmar agendamento"**.
4. **Resultado**:
   - Modo auto-confirmação **e** telefone casou com exatamente 1 paciente:
     _"Agendamento confirmado! Você receberá uma mensagem com os detalhes."_
   - Caso contrário (modo aprovação, ou contato desconhecido/ambíguo):
     _"Solicitação enviada! A clínica vai confirmar seu horário em breve."_
   - Slot ocupado entre a renderização e o envio → toast/tela 409:
     _"Ops! Esse horário acabou de ser preenchido. Escolha outro horário."_ +
     grade de slots atualizada (retornada na própria resposta 409).

Clínica com assinatura `read_only` (trial expirado/cancelada/unpaid) ou recurso
desabilitado → página fechada: _"O agendamento online desta clínica está
temporariamente indisponível. Entre em contato pelo telefone {{clinicPhone}}."_

### 2.3 Fluxo do ADMIN — configurações (`/admin/settings/agendamento-online`)

Nova página em Configurações com dois blocos:

**Bloco "Agendamento online" (clínica)**
- Toggle **"Habilitar agendamento online"** (default desligado).
- Link público exibido com botão copiar: `https://app…/agendar/{slug}`.
- **Modo**: radio "Aprovação manual (recomendado)" / "Confirmação automática".
- **Duração padrão da sessão**: 50 min (usado quando o profissional não tem
  `appointmentDuration` próprio — campo já existe e prevalece).
- **Antecedência mínima**: horas (default 12).
- **Horizonte de agendamento**: dias (default 30; o menor entre este valor e o
  `maxAdvanceBookingDays` do profissional prevalece).
- **Modalidades permitidas**: checkboxes ONLINE / PRESENCIAL.
- **Máx. de agendamentos futuros em aberto por telefone**: default 2.
- **Telefones bloqueados** (blocklist, um por linha, normalizados).

**Bloco "Profissionais"** — tabela com cada profissional da clínica:
- Toggle "Listado" (`allowOnlineBooking`, campo existente).
- Slug público editável (`publicBookingSlug`) + botão copiar deep link.
- Indicador "Sem disponibilidade cadastrada" (link para
  `/settings/availability`) quando não há `AvailabilityRule` ativa.
- Buffer entre sessões e duração — somente leitura aqui (editados no perfil do
  profissional; campos `bufferBetweenSlots`/`appointmentDuration` já existem).

### 2.4 Fluxo da equipe — caixa de solicitações (`/agenda/solicitacoes`)

Lista de `BookingRequest` (espelha a UI de intake-submissions):

- Filtro por status (Pendentes default / Aprovadas / Rejeitadas / Expiradas).
- PROFESSIONAL vê apenas as próprias solicitações; quem tem `agenda_others ≥
  READ` (ADMIN) vê todas as da clínica.
- Card: nome, telefone formatado, e-mail, profissional, data/hora pedida
  (`DD/MM/YYYY HH:mm`), modalidade, badge "Paciente já cadastrado: {nome}"
  quando `patientId` resolvido, ou "Novo contato".
- **Aprovar**:
  - Com `patientId` → confirma direto (revalida conflito) e agenda.
  - Sem `patientId` → painel inline com duas opções: **"Vincular a paciente
    existente"** (busca) ou **"Criar novo paciente"** (form mínimo pré-preenchido
    com nome/telefone/e-mail/CPF da solicitação — espelho do
    approve-with-edit do intake). Consentimentos da solicitação persistem em
    `consentWhatsApp/consentEmail` + timestamps.
  - Conflito na aprovação → erro amigável com o compromisso conflitante
    (reusa `formatConflictError`).
- **Rejeitar** → modal com motivo opcional; envia mensagem educada ao contato.
- Badge de pendências na navegação (desktop header + bottom nav + sidebar),
  espelhando o padrão `usePendingIntakeCount`/`PendingIntakeBanner`.

### 2.5 Regras de negócio

| # | Regra |
|---|-------|
| R1 | Slots livres = `AvailabilityRule` ativas − `AvailabilityException` (datas específicas, recorrentes e clinic-wide; `isAvailable=true` ADICIONA janela extra) − appointments bloqueantes (CONSULTA/TAREFA/REUNIAO não cancelados; LEMBRETE/NOTA **não** bloqueiam — mesma semântica de `blocksTime` da agenda) − buffer do profissional. |
| R2 | Slot só é ofertado se `início ≥ now + minAdvanceHours` e `início ≤ now + min(horizonDays, prof.maxAdvanceBookingDays)`. |
| R3 | Passo da grade = duração efetiva (prof.`appointmentDuration` ?? settings.`sessionDurationMinutes`) + prof.`bufferBetweenSlots`, ancorado no início de cada janela de disponibilidade. |
| R4 | Timezone **fixo** America/Sao_Paulo (UTC−3, sem DST desde 2019). Regras `HH:mm` são interpretadas nesse fuso e convertidas para instantes UTC. |
| R5 | Booking público cria **somente sessões avulsas** tipo CONSULTA (recorrências continuam exclusivas da equipe; nenhuma `AppointmentRecurrence` é criada). |
| R6 | Sessões de grupo nunca são ofertadas (aparecem apenas como tempo ocupado). |
| R7 | Profissional sem `AvailabilityRule` ativa simplesmente não é listado. |
| R8 | Submissão revalida o slot **dentro de transação** com `checkConflict` (FOR UPDATE). Corrida → 409 + slots atualizados. |
| R9 | Auto-confirmação só se aplica quando o telefone casa com **exatamente 1** paciente da clínica (`Patient.phone` ∪ `PatientPhone.phone`, normalizados). Match ambíguo ou inexistente → sempre vira solicitação PENDING (nenhum `Patient` é criado antes da aprovação). |
| R10 | Anti-abuso: rate limit por IP (slots e submit), limite de N solicitações/agendamentos futuros em aberto por telefone, blocklist por clínica, honeypot. Telefone bloqueado recebe resposta genérica de sucesso de solicitação (não revela o bloqueio). |
| R11 | Clínica `read_only` pela assinatura (`isReadOnly` em `src/lib/subscription`) → página e APIs públicas respondem "agendamento fechado" (o plano atual só limita `maxProfessionals`; checagem é por status da assinatura). |
| R12 | Aprovação/rejeição/alterações de configuração geram `AuditLog`. |
| R13 | Appointment criado entra no pipeline padrão: confirmação com links HMAC (`buildConfirmUrl`/`buildCancelUrl`) e lembretes do cron `send-reminders` (respeitando `appointmentNotificationsEnabled` e consentimentos). |
| R14 | `price` do Appointment = `patient.sessionFee` quando o paciente é conhecido (mesma regra do fluxo da equipe); nulo caso contrário. |
| R15 | Solicitações PENDING cujo horário já passou expiram (status EXPIRED) via cron diário. |

### 2.6 Edge cases

- **Dois pacientes com o mesmo telefone** (mãe responsável por dois filhos):
  match ambíguo → solicitação PENDING mesmo em modo auto-confirmação; equipe
  escolhe o paciente na aprovação.
- **Slot tomado entre render e submit**: 409 com slots atualizados (R8).
- **Duas solicitações PENDING para o mesmo slot**: permitido (não bloqueiam
  agenda); a primeira aprovação vence, a segunda falha na revalidação de
  conflito com mensagem clara para a equipe.
- **Exceção clinic-wide (feriado)**: `AvailabilityException` com `clinicId`
  preenchido e `professionalProfileId` nulo remove slots de todos.
- **Janela parcialmente bloqueada**: exceção 12:00–14:00 remove apenas os slots
  que intersectam o intervalo.
- **`isAvailable=true`** (disponibilidade extra em data específica): adiciona
  janela mesmo sem regra semanal para aquele dia.
- **Modalidade**: se settings permitem só ONLINE, o seletor não aparece e o
  Appointment é criado com `modality=ONLINE`.
- **Telefone internacional** (`+351…`): aceito (regex de `src/lib/phone`),
  normalizado antes de matching/limites.
- **Honeypot preenchido**: responde 201 genérico e **não** persiste nada.
- **Solicitação aprovada após o horário passar**: bloqueada — botão desabilitado
  e API retorna 422 _"Esta solicitação expirou."_

### 2.7 Copy pt-BR (chaves principais)

| Contexto | Texto |
|---|---|
| Título da página pública | `Agende sua sessão` |
| Etapas | `Profissional` · `Horário` · `Seus dados` |
| Vazio de slots na semana | `Sem horários livres nesta semana. Tente a próxima.` |
| Consentimento LGPD | `Autorizo o contato por WhatsApp e e-mail para confirmações e lembretes de sessões, conforme a Política de Privacidade.` |
| Sucesso auto-confirmação | `Agendamento confirmado! Você receberá uma mensagem com os detalhes.` |
| Sucesso aprovação | `Solicitação enviada! A clínica vai confirmar seu horário em breve.` |
| Conflito (409) | `Ops! Esse horário acabou de ser preenchido. Escolha outro horário.` |
| Limite por telefone | `Você já possui agendamentos aguardando confirmação. Aguarde o retorno da clínica.` |
| Rate limit (429) | `Muitas tentativas. Aguarde alguns minutos e tente novamente.` |
| Página fechada | `O agendamento online desta clínica está temporariamente indisponível.` |
| Badge navegação | `Solicitações` |
| Botões aprovação | `Aprovar e agendar` · `Rejeitar` · `Vincular a paciente existente` · `Criar novo paciente` |
| E-mail equipe (assunto) | `Novo agendamento online — {{patientName}}` |
| Notificação rejeição | `Olá, {{patientName}}. Infelizmente não foi possível confirmar seu horário de {{date}} às {{time}}. {{reason}} Entre em contato com a {{clinicName}} para encontrarmos um novo horário.` |

---

## 3. Design Técnico

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

> Migração SQL autorada **offline** (nunca `prisma db push`/`migrate dev`) em
> `prisma/migrations/<timestamp>_online_booking/migration.sql` + `npx prisma generate`.

**Novos enums**

```prisma
enum OnlineBookingMode {
  AUTO_CONFIRM
  APPROVAL_REQUIRED
}

enum BookingRequestStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
}
```

**Valores novos em enum existente** (`ALTER TYPE … ADD VALUE` no SQL; não usar
o valor novo na mesma transação da migração):

```prisma
enum NotificationType {
  // ... existentes
  ONLINE_BOOKING_RECEIVED   // para a equipe
  ONLINE_BOOKING_REJECTED   // para o contato
}
```

**Novo model 1:1 com Clinic** (evita inflar o model `Clinic`, já enorme):

```prisma
/// Per-clinic settings for the public self-booking page (/agendar/[slug])
model OnlineBookingSettings {
  id                      String                @id @default(cuid())
  clinicId                String                @unique
  enabled                 Boolean               @default(false)
  mode                    OnlineBookingMode     @default(APPROVAL_REQUIRED)
  sessionDurationMinutes  Int                   @default(50)  // fallback; prof.appointmentDuration wins
  minAdvanceHours         Int                   @default(12)
  horizonDays             Int                   @default(30)  // capped by prof.maxAdvanceBookingDays
  allowedModalities       AppointmentModality[] @default([ONLINE, PRESENCIAL])
  maxOpenBookingsPerPhone Int                   @default(2)
  blockedPhones           String[]              @default([])  // normalized digits

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)
}
```

**Novo model BookingRequest** (toda submissão pública vira uma linha — mesmo no
modo auto-confirmação, para trilha de auditoria e contagem de limites; nenhum
`Patient` é criado antes da aprovação, espelhando `IntakeSubmission`):

```prisma
/// A public self-booking submission. APPROVED rows always have appointmentId.
model BookingRequest {
  id                    String               @id @default(cuid())
  clinicId              String
  professionalProfileId String
  status                BookingRequestStatus @default(PENDING)

  scheduledAt DateTime
  endAt       DateTime
  modality    AppointmentModality

  // Contact (as typed by the visitor; phone normalized via src/lib/phone)
  name  String
  phone String
  email String
  cpf   String?

  // LGPD consents captured at submission time
  consentWhatsApp Boolean  @default(false)
  consentEmail    Boolean  @default(false)
  consentAt       DateTime @default(now())

  // Resolution
  patientId        String?   // unique phone match at submission, or set on approval
  appointmentId    String?   @unique
  reviewedByUserId String?
  reviewedAt       DateTime?
  rejectionReason  String?

  ipAddress String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic              Clinic              @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  patient             Patient?            @relation(fields: [patientId], references: [id], onDelete: SetNull)
  appointment         Appointment?        @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  reviewedBy          User?               @relation(fields: [reviewedByUserId], references: [id], onDelete: SetNull)

  @@index([clinicId, status])
  @@index([clinicId, scheduledAt])
  @@index([clinicId, phone])
  @@index([professionalProfileId, status, scheduledAt])
}
```

**Campos novos em models existentes**

```prisma
model ProfessionalProfile {
  // ... existentes (allowOnlineBooking, appointmentDuration,
  //     bufferBetweenSlots, maxAdvanceBookingDays, bio JÁ EXISTEM)
  publicBookingSlug String?   // unique PER CLINIC, validated in app code
  photoUrl          String?   // public page avatar (optional)
  bookingRequests   BookingRequest[]

  @@index([publicBookingSlug])
}

model Clinic {
  // ...
  onlineBookingSettings OnlineBookingSettings?
  bookingRequests       BookingRequest[]
}

model Patient {
  // ...
  bookingRequests BookingRequest[]
}

model User {
  // ...
  reviewedBookingRequests BookingRequest[]
}

model Appointment {
  // ...
  bookingRequest BookingRequest?
}
```

> **Atenção (tenant scoping):** `ProfessionalProfile` **não tem** `clinicId` —
> toda query de profissional deve passar por `user: { clinicId }`. A unicidade
> de `publicBookingSlug` é por clínica e validada em código (lookup é sempre
> `clinicSlug → profissionais da clínica → slug`), nunca por unique global
> (duas clínicas podem ter "ana").

**Esqueleto da migração SQL**

```sql
CREATE TYPE "OnlineBookingMode" AS ENUM ('AUTO_CONFIRM', 'APPROVAL_REQUIRED');
CREATE TYPE "BookingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
ALTER TYPE "NotificationType" ADD VALUE 'ONLINE_BOOKING_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'ONLINE_BOOKING_REJECTED';
ALTER TABLE "ProfessionalProfile" ADD COLUMN "publicBookingSlug" TEXT, ADD COLUMN "photoUrl" TEXT;
CREATE INDEX "ProfessionalProfile_publicBookingSlug_idx" ON "ProfessionalProfile"("publicBookingSlug");
CREATE TABLE "OnlineBookingSettings" ( ... );  -- conforme model acima
CREATE TABLE "BookingRequest" ( ... );         -- conforme model acima + FKs + índices
```

### 3.2 Novo domain module `src/lib/booking/` (funções puras + testes colocados)

Todos os arquivos < 200 linhas; barrel `index.ts`; zero dependência de
framework/Prisma (rotas passam dados já buscados).

```
src/lib/booking/
├── index.ts          # barrel
├── types.ts          # tipos compartilhados
├── timezone.ts       # conversões São Paulo (UTC-3 fixo) ↔ UTC
├── slot-engine.ts    # motor de slots livres
├── matching.ts       # classificação de match por telefone
├── validation.ts     # zod schema da submissão pública + guards de janela
├── anti-abuse.ts     # blocklist, limite por telefone, honeypot
└── slug.ts           # geração/normalização de slug de profissional
```

**types.ts**

```typescript
export interface RuleInput { dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }
export interface ExceptionInput {
  date: string | null          // "YYYY-MM-DD" (SP) — null para recorrente
  dayOfWeek: number | null
  isRecurring: boolean
  isAvailable: boolean         // false = bloqueia; true = janela extra
  startTime: string | null     // null = dia inteiro
  endTime: string | null
}
export interface BusyInterval { start: Date; end: Date }   // só blocksTime=true não cancelados
export interface Slot { start: string; end: string; label: string }  // ISO UTC + "HH:mm" SP
export interface DaySlots { date: string; weekday: number; slots: Slot[] }
export interface SlotEngineInput {
  rules: RuleInput[]
  exceptions: ExceptionInput[]
  busy: BusyInterval[]
  durationMinutes: number
  bufferMinutes: number
  from: string                 // "YYYY-MM-DD" (SP), primeiro dia da janela pedida
  days: number                 // tamanho da janela (UI pede 7)
  now: Date
  minAdvanceHours: number
  horizonDays: number
}
```

**timezone.ts** — America/Sao_Paulo é UTC−3 fixo (DST abolido em 2019):

```typescript
export const SP_UTC_OFFSET = "-03:00"
export function spToUtc(dateISO: string, time: string): Date        // "2026-06-15","14:00" → Date UTC
export function utcToSpTime(d: Date): string                        // → "HH:mm"
export function utcToSpDateISO(d: Date): string                     // → "YYYY-MM-DD"
export function addDaysISO(dateISO: string, days: number): string
export function spWeekdayOf(dateISO: string): number                // 0=domingo … 6=sábado
```

**slot-engine.ts** — coração do recurso:

```typescript
/** Janelas de disponibilidade de um dia: regras ativas do weekday
 *  + exceções isAvailable=true, − exceções bloqueantes (data exata,
 *  recorrente por weekday e clinic-wide), com recorte parcial. */
export function resolveDayWindows(
  dateISO: string,
  rules: RuleInput[],
  exceptions: ExceptionInput[]
): Array<{ start: string; end: string }>

/** Grade de candidatos: passo = duration + buffer ancorado no início
 *  da janela; descarta candidato que não cabe inteiro na janela. */
export function generateCandidates(
  windows: Array<{ start: string; end: string }>,
  dateISO: string,
  durationMinutes: number,
  bufferMinutes: number
): Slot[]

/** Remove candidatos que intersectam busy (start1 < end2 && end1 > start2;
 *  back-to-back permitido) e fora da janela [now+minAdvance, now+horizon]. */
export function computeFreeSlots(input: SlotEngineInput): DaySlots[]
```

**matching.ts**

```typescript
export type PhoneMatch =
  | { kind: "none" }
  | { kind: "unique"; patientId: string }
  | { kind: "ambiguous"; patientIds: string[] }
/** candidates = ids distintos vindos de Patient.phone ∪ PatientPhone.phone */
export function classifyPhoneMatch(candidatePatientIds: string[]): PhoneMatch
```

**validation.ts**

```typescript
export const publicBookingSchema = z.object({
  professionalSlug: z.string().min(1),
  start: z.string().datetime(),            // ISO UTC do slot escolhido
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  name: z.string().min(3).max(120),
  phone: z.string().refine(isValidPhone, PHONE_ERROR_MESSAGE),   // src/lib/phone
  email: z.string().email("E-mail inválido"),
  cpf: z.string().optional(),
  consent: z.literal(true, { message: "É necessário aceitar o termo de consentimento" }),
  website: z.string().max(0).optional(),   // honeypot — preenchido ⇒ descartar
})
export type PublicBookingInput = z.infer<typeof publicBookingSchema>

export function isWithinBookingWindow(
  start: Date, now: Date, minAdvanceHours: number, horizonDays: number
): boolean
```

**anti-abuse.ts**

```typescript
export function isPhoneBlocked(blockedPhones: string[], normalizedPhone: string): boolean
export function exceedsOpenBookingLimit(openCount: number, max: number): boolean
export function isHoneypotTripped(input: { website?: string }): boolean
```

**slug.ts**

```typescript
export function slugifyProfessionalName(name: string): string   // "Dra. Ana Müller" → "ana-muller"
export function isValidBookingSlug(slug: string): boolean       // ^[a-z0-9]+(-[a-z0-9]+)*$, 2–60
```

**Rate-limit** — acrescentar configs em `src/lib/rate-limit.ts`:

```typescript
bookingSlots:  { maxRequests: 30, windowMs: 60_000 },        // GET slots, por IP
bookingSubmit: { maxRequests: 5,  windowMs: 10 * 60_000 },   // POST, por IP
bookingPhone:  { maxRequests: 3,  windowMs: 24 * 60 * 60_000 }, // POST, por telefone
```

### 3.3 Rotas de API

**Públicas** (`src/app/api/public/booking/…` — sem auth; allowlist já cobre
`/api/public`). Handlers finos: Prisma + chamadas ao módulo `src/lib/booking`.

| Rota | Método | Descrição |
|---|---|---|
| `/api/public/booking/[slug]` | GET | Info da clínica + profissionais listáveis. Scoped por `clinic.slug`; profissionais via `user: { clinicId }`, filtrando `allowOnlineBooking=true` **e** ≥1 `AvailabilityRule` ativa. Resposta: `{ clinic: { name, hasLogo, phone }, settings: { mode, allowedModalities }, professionals: [{ slug, name, specialty, bio, photoUrl }] }`. 404 se slug inexistente/inativa; `{ closed: true }` se desabilitado ou assinatura `read_only`. Rate limit `publicApi`. |
| `/api/public/booking/[slug]/slots` | GET | Query `professional` (slug), `from` (YYYY-MM-DD), `days` (≤14). Busca regras/exceções (próprias + clinic-wide) e appointments bloqueantes do intervalo (`blocksTime: true`, `status notIn` cancelados, índice `[professionalProfileId, scheduledAt]`), monta `SlotEngineInput`, responde `{ days: DaySlots[] }`. Rate limit `bookingSlots`; header `Cache-Control: public, s-maxage=60, stale-while-revalidate=30`. |
| `/api/public/booking/[slug]/route.ts` | POST | Submissão (corpo = `publicBookingSchema`). Fluxo abaixo. Rate limits `bookingSubmit` (IP) + `bookingPhone` (telefone normalizado). |

**Fluxo do POST público** (handler < 50 linhas orquestrando helpers):

1. Rate limits; parse zod; honeypot → 201 genérico sem persistir.
2. Carrega clinic por slug + `onlineBookingSettings` + assinatura. Fechado →
   403 `{ error: "Agendamento online indisponível." }`.
3. Resolve profissional pelo `publicBookingSlug` dentro da clínica
   (`professionalProfile.findFirst({ where: { publicBookingSlug, allowOnlineBooking: true, user: { clinicId, isActive: true } } })`).
4. Normaliza telefone (`normalizePhone`); blocklist → 201 "solicitação enviada"
   (sem persistir); limite de abertos
   (`bookingRequest.count` PENDING futuros + APPROVED com appointment futuro
   não cancelado, sempre `where clinicId`) → 422 com copy R10.
5. Valida janela/modalidade/alinhamento: recomputa slots do dia via motor e
   exige que `start` seja um candidato exato — defesa contra payload forjado.
6. Match de paciente: ids distintos de `patient.findMany({ where: { clinicId, phone } })`
   ∪ `patientPhone.findMany({ where: { clinicId, phone } })` → `classifyPhoneMatch`.
7. `prisma.$transaction`:
   - `checkConflict({ professionalProfileId, scheduledAt, endAt }, tx)` (FOR
     UPDATE). Conflito → 409 `{ error, refreshedDays }`.
   - **AUTO_CONFIRM + match unique**: cria `Appointment` (type CONSULTA,
     status AGENDADO, `blocksTime: true`, modality, `price: patient.sessionFee`)
     + `BookingRequest` APPROVED com `patientId`/`appointmentId`; atualiza
     consentimentos do paciente se recém-concedidos (com `…At = now()`).
   - Senão: cria `BookingRequest` PENDING (com `patientId` se match unique em
     modo aprovação; nulo se none/ambiguous).
8. Pós-transação (try/catch, falha não derruba a resposta — padrão do intake):
   - Auto-confirmado → notificações APPOINTMENT_CONFIRMATION ao paciente
     (WhatsApp/e-mail conforme consentimentos, links HMAC) + e-mail
     ONLINE_BOOKING_RECEIVED ao profissional/admins.
   - PENDING → e-mail ONLINE_BOOKING_RECEIVED + `Todo` para o profissional
     (`title: "Aprovar agendamento online: {name} — DD/MM HH:mm"`, `day: hoje`).
9. 201 `{ status: "confirmed" | "pending" }`.

**Autenticadas** (`withFeatureAuth`; toda query `where: { clinicId: user.clinicId }`;
ids de corpo validados contra a clínica — padrão ownership):

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/booking-requests` | GET | `{ feature: "online_booking", minAccess: "READ" }` | Lista por `?status=`. PROFESSIONAL sem `agenda_others ≥ READ` → filtro adicional `professionalProfileId: user.professionalProfileId`. |
| `/api/booking-requests/pending-count` | GET | `{ feature: "online_booking", minAccess: "WRITE" }` | Espelho exato de `intake-submissions/pending-count` (mesmo Cache-Control). |
| `/api/booking-requests/[id]/approve` | POST | `{ feature: "online_booking", minAccess: "WRITE" }` | Corpo: `{}` (request já tem patientId) \| `{ patientId }` \| `{ newPatient: { name, phone, email?, cpf? } }`. Carrega request `findFirst({ where: { id, clinicId } })` (404 se de outra clínica); PROFESSIONAL só aprova as próprias; `patientId` do corpo validado por `patient.findFirst({ where: { id, clinicId } })`. Transação: revalida `checkConflict`, cria Patient se `newPatient` (consents da request com timestamps), cria Appointment, marca APPROVED + reviewedBy/reviewedAt. Notifica paciente; `createAuditLog`. 409 amigável em conflito; 422 se expirada/não-PENDING. |
| `/api/booking-requests/[id]/reject` | POST | idem WRITE | Corpo `{ reason?: string }`. Marca REJECTED, envia ONLINE_BOOKING_REJECTED ao contato (canal conforme consentimento), `createAuditLog`. |
| `/api/clinic/booking-settings` | GET/PUT | `{ feature: "clinic_settings", minAccess: READ/WRITE }` | Upsert de `OnlineBookingSettings` (`where: { clinicId: user.clinicId }`). PUT valida com zod (horas 0–168, dias 1–90, modalidades ⊆ enum, telefones normalizados). `createAuditLog` nas mudanças. |
| `/api/professionals/[id]` (existente) | PATCH | rota existente | Estender payload aceito com `publicBookingSlug` (validado por `isValidBookingSlug` + unicidade dentro da clínica) e `photoUrl`. |

**Cron** (`src/app/api/jobs/expire-booking-requests/route.ts`): `updateMany`
de PENDING com `scheduledAt < now()` → EXPIRED (sem filtro de clínica — job de
plataforma, como os demais). Adicionar em `vercel.json`:

```json
{ "path": "/api/jobs/expire-booking-requests", "schedule": "0 5 * * *" }
```

### 3.4 RBAC — nova feature `online_booking`

Em `src/lib/rbac/types.ts`:
- `FEATURES`: adicionar `"online_booking"`.
- `FEATURE_LABELS`: `online_booking: "Agendamento Online"`.

Em `src/lib/rbac/permissions.ts` (`ROLE_DEFAULTS`):
- ADMIN: `online_booking: "WRITE"`.
- PROFESSIONAL: `online_booking: "WRITE"` (atua só sobre as próprias
  solicitações — scoping no handler, como agenda_own).

Overrides por usuário funcionam automaticamente via `UserPermission` (a UI de
permissões itera `FEATURES`). Atualizar `permissions.test.ts` (snapshot dos
defaults) e quaisquer asserts de contagem.

### 3.5 Notificações

`src/lib/notifications/templates.ts` — novos `DEFAULT_TEMPLATES`:
- `ONLINE_BOOKING_RECEIVED` / EMAIL (equipe): assunto
  `Novo agendamento online — {{patientName}}`; corpo com data/hora,
  modalidade, telefone e link `/agenda/solicitacoes`.
- `ONLINE_BOOKING_REJECTED` / WHATSAPP e EMAIL (contato): copy da §2.7.
- Variáveis extras não são necessárias (`TemplateVariables` já cobre
  patientName/professionalName/date/time/clinicName/modality; `{{reason}}`
  entra como variável nova opcional no interface).

Confirmação ao paciente **reusa** `APPOINTMENT_CONFIRMATION` + links HMAC
(`buildConfirmUrl`/`buildCancelUrl` de `src/lib/appointments/appointment-links.ts`)
e as rotas públicas `/confirm`/`/cancel` existentes — nada novo aí. Lembretes:
o cron `send-reminders` já varre `Appointment`; bookings entram de graça.
Gate `clinic.appointmentNotificationsEnabled` continua valendo (ver Riscos).

### 3.6 Páginas e componentes de UI

**Allowlist de rota pública** — `src/lib/auth.config.ts`: adicionar
`const isBookingPage = nextUrl.pathname.startsWith("/agendar")` ao
`isPublicRoute` (sem isso o middleware redireciona para /login).

**Página pública** (mobile-first; sem useEffect — fetch em server component +
mutações em event handlers; reset por `key`):

```
src/app/agendar/[clinicSlug]/page.tsx                  # server: clinic + profissionais → <BookingWizard>
src/app/agendar/[clinicSlug]/[professionalSlug]/page.tsx  # server: idem com profissional pré-selecionado
src/app/agendar/[clinicSlug]/components/
├── BookingWizard.tsx        # client; máquina de etapas (state local, sem effects)
├── ProfessionalPicker.tsx   # cards foto/bio
├── WeekSlotPicker.tsx       # grade semanal; navegação ‹ › refaz fetch no handler
├── IdentificationForm.tsx   # react-hook-form + zod (reusa formatPhoneInput de src/lib/phone)
├── BookingResult.tsx        # telas de sucesso / 409 com slots atualizados
└── ClosedNotice.tsx         # clínica fechada/indisponível
```

**Configurações ADMIN**

```
src/app/admin/settings/agendamento-online/page.tsx
src/app/admin/settings/agendamento-online/components/
├── BookingSettingsForm.tsx        # bloco clínica (rhf+zod, Sonner no save)
└── ProfessionalBookingTable.tsx   # toggles, slug, copiar deep link, aviso sem disponibilidade
```

Adicionar item de navegação na página de Configurações existente.

**Caixa de solicitações**

```
src/app/agenda/solicitacoes/page.tsx
src/app/agenda/solicitacoes/components/
├── BookingRequestList.tsx     # filtros por status + cards
├── BookingRequestDetail.tsx   # aprovar (vincular/criar) / rejeitar
└── LinkOrCreatePatient.tsx    # busca paciente OU form mínimo pré-preenchido
```

**Badge/banner de pendências** — espelhar o padrão intake:

```
src/shared/hooks/usePendingBookingCount.ts (+ .test.ts)
src/shared/components/PendingBookingBadge.tsx
```

Tocar: `sidebar-nav.tsx`, `desktop-header.tsx`, `bottom-navigation.tsx`
(badge no item Agenda → Solicitações). Avaliar generalizar o
`PendingIntakeProvider` em um provider único de alertas (ver Questões).

**Arquivos existentes alterados (resumo)**: `prisma/schema.prisma`,
`src/lib/auth.config.ts`, `src/lib/rate-limit.ts`, `src/lib/rbac/types.ts`,
`src/lib/rbac/permissions.ts` (+ test), `src/lib/notifications/templates.ts`
(+ test), `src/app/api/professionals/[id]/route.ts`, `vercel.json`, navegação
(3 arquivos), página índice de settings.

### 3.7 Auditoria

Novas ações em `AuditAction` (`src/lib/rbac/audit.ts`):
`BOOKING_SETTINGS_UPDATED`, `BOOKING_REQUEST_APPROVED`,
`BOOKING_REQUEST_REJECTED`. Aprovação/rejeição registram
`createAuditLog({ clinicId, userId, action, resource: "booking-request", resourceId })`.
A criação pública não tem usuário — a trilha é o próprio `BookingRequest`
(ipAddress, timestamps), como no intake.

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`; enums como
string literal; `vi.useFakeTimers()` para janelas de tempo.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/booking/timezone.test.ts` | `spToUtc` ("2026-06-15","14:00" → 17:00Z); ida-e-volta `utcToSpTime`/`utcToSpDateISO`; `addDaysISO` virando mês/ano; `spWeekdayOf` em datas conhecidas. |
| `src/lib/booking/slot-engine.test.ts` | dia sem regra → vazio; regra 09–17 + duração 50 + buffer 10 → grade 09:00, 10:00…; candidato que não cabe na janela é descartado; exceção data-específica dia inteiro remove tudo; exceção parcial 12–14 remove só os slots que intersectam; exceção recorrente por weekday; exceção clinic-wide; `isAvailable=true` adiciona janela sem regra semanal; busy interval remove slot sobreposto; back-to-back permitido (busy termina 10:00 → slot 10:00 ofertado); `minAdvanceHours` corta slots de hoje; `horizonDays` corta o fim; janela multi-dia agrupa por `DaySlots`; duas regras no mesmo dia. |
| `src/lib/booking/matching.test.ts` | lista vazia → none; 1 id → unique; ids duplicados deduplicados → unique; 2 ids distintos → ambiguous. |
| `src/lib/booking/validation.test.ts` | schema aceita payload válido BR e internacional (+351…); rejeita sem consent, telefone inválido, e-mail inválido, honeypot preenchido; `isWithinBookingWindow` nos limites exatos (≥ now+min, ≤ now+horizon). |
| `src/lib/booking/anti-abuse.test.ts` | blocklist com telefone normalizado; limite atingido/abaixo; honeypot. |
| `src/lib/booking/slug.test.ts` | acentos/maiúsculas/pontuação; `isValidBookingSlug` (hífens duplos, tamanho). |
| `src/lib/rbac/permissions.test.ts` (atualizar) | defaults de `online_booking` para ADMIN/PROFESSIONAL; resolução com override. |
| `src/lib/notifications/templates.test.ts` (atualizar) | novos templates default existem para os 2 tipos novos; render com `{{reason}}` vazio não quebra. |
| `src/lib/rate-limit.test.ts` (atualizar) | novas configs exportadas com janelas corretas. |
| `src/shared/hooks/usePendingBookingCount.test.ts` | espelho do teste do intake count. |
| `src/app/api/jobs/expire-booking-requests/route.test.ts` | PENDING passado → EXPIRED; PENDING futuro intocado (espelhar estilo de `send-reminders/route.test.ts`). |

Verificação manual (sem teste automatizado): corrida de submissão dupla no
mesmo slot (dois curls paralelos → um 201, um 409), página pública em viewport
mobile, fluxo completo aprovar/rejeitar.

---

## 5. Etapas de Implementação

Branch isolada: `bash scripts/new-feature.sh agendamento-online` (worktree +
DB próprios). Cada etapa termina com `npx prisma generate && npm run test &&
npm run build` verdes. **Nunca** `prisma db push`/`migrate dev` — SQL offline.

1. **Schema + migração** — editar `prisma/schema.prisma` (§3.1); autorar
   `prisma/migrations/<ts>_online_booking/migration.sql`; aplicar no banco da
   worktree com `psql` local; `npx prisma generate`.
   _Verificação:_ `prisma validate`, build verde, tabelas existem no DB local.
2. **Módulo `src/lib/booking`** — `types.ts`, `timezone.ts`, `slot-engine.ts`,
   `matching.ts`, `validation.ts`, `anti-abuse.ts`, `slug.ts`, `index.ts` +
   todos os testes da §4. _Verificação:_ `npx vitest run src/lib/booking`.
3. **Rate-limit + RBAC** — novas configs em `rate-limit.ts`; feature
   `online_booking` em types/permissions + testes atualizados.
   _Verificação:_ `npm run test`.
4. **Rotas públicas** — `GET /api/public/booking/[slug]`, `GET …/slots`,
   `POST …` (fluxo §3.3, helpers extraídos para manter handlers < 50 linhas;
   side-effects de notificação num helper `notify-booking.ts` dentro de
   `src/lib/booking` ou colado à rota). _Verificação:_ curl contra dev server
   com dados seedados; corrida dupla retorna um 409.
5. **Templates + Todo** — novos DEFAULT_TEMPLATES; criação de Todo na
   submissão PENDING. _Verificação:_ teste de templates + inspeção do Todo no
   Prisma Studio.
6. **Rotas autenticadas** — `booking-requests` (list, pending-count, approve,
   reject) + `clinic/booking-settings` + extensão do PATCH de professionals;
   auditoria. _Verificação:_ curls autenticados; tentativa cross-clinic → 404;
   PROFESSIONAL não aprova solicitação alheia.
7. **Cron de expiração** — rota job + entrada no `vercel.json` + teste.
8. **Allowlist pública** — `/agendar` em `auth.config.ts`.
   _Verificação:_ página acessível deslogado.
9. **Página pública** — wizard + componentes (§3.6), mobile-first, pt-BR.
   _Verificação:_ fluxo completo no navegador (modo aprovação e
   auto-confirmação), 409 simulado.
10. **Settings ADMIN** — página agendamento-online + link na navegação de
    configurações. _Verificação:_ salvar settings persiste e audita; copiar
    links funciona; slug duplicado na clínica é rejeitado.
11. **Caixa de solicitações + badge** — página, componentes, hook de contagem,
    badges na navegação. _Verificação:_ badge atualiza após aprovar.
12. **Passo final de qualidade** — `npx prisma generate`, `npm run test`,
    `npm run build` (atenção ao gotcha de `patient` nullable em qualquer
    componente tocado); revisão de tamanho de arquivos (< ~200 linhas).
13. **Commit local** (sem push):
    `feat(agendamento-online): public patient self-booking page with slot engine and approval inbox`
    + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## 6. Riscos e Questões em Aberto

### Riscos

- **Rate limit em serverless é por instância** (store em memória). Mitigações
  já no design: limite por telefone é **persistido** (count de
  `BookingRequest`), honeypot, blocklist. CAPTCHA fica para depois (spec).
- **Corrida de booking**: `checkConflict` usa `SELECT … FOR UPDATE` dentro da
  transação — mesma proteção do fluxo da equipe. Duas PENDING para o mesmo
  slot são aceitas por design; a aprovação revalida.
- **`ALTER TYPE … ADD VALUE`**: não referenciar os valores novos na mesma
  transação da migração (separar em statements; Postgres ≥ 12 ok).
- **Cache CDN de slots (s-maxage=60)**: janela curta de staleness é aceitável
  porque o POST revalida tudo; o 409 devolve slots frescos.
- **`appointmentNotificationsEnabled` default false**: clínicas fora do
  rollout de notificações terão bookings confirmados **sem** mensagem ao
  paciente (registrada como FAILED "feature disabled" — comportamento atual).
  A UI de settings deve avisar quando a flag estiver off.
- **LGPD / retenção**: `BookingRequest` guarda dados pessoais de
  não-pacientes. Expiração via cron ajuda; avaliar purge de
  REJECTED/EXPIRED após N meses (alinhar com prática do `IntakeSubmission`).
- **WhatsApp é mock em dev**: e-mail (Resend) é o canal garantido; copy do
  fluxo não deve prometer "mensagem no WhatsApp" sem consentimento/canal ativo.
- **Unicidade de `publicBookingSlug` é app-level** (sem unique composto por
  falta de `clinicId` em `ProfessionalProfile`): risco teórico de corrida no
  PATCH de dois admins — aceitável; validação re-checa no save.

### Questões em aberto

1. **`Clinic.minAdvanceBooking` (existente, default 2h)** vs novo
   `minAdvanceHours` (12h) — o plano mantém o campo novo booking-specific para
   não mudar semântica existente. Confirmar se vale migrar/unificar depois.
2. **`photoUrl`**: não há infra de upload além de `Clinic.logoData`. MVP usa
   URL externa + fallback de iniciais. Upload binário (padrão logoData) fica
   para um follow-up?
3. **Generalizar `PendingIntakeProvider`** em um provider único de alertas
   (intake + booking) em vez de dois pollers paralelos? Recomendado se o toque
   nos 3 arquivos de navegação ficar repetitivo.
4. **Limites de plano**: `Plan` só tem `maxProfessionals`. Criar quota de
   bookings/mês por plano (upsell) ou deixar ilimitado? Plano assume
   ilimitado, gate apenas por status da assinatura.
5. **Mensagem pós-aprovação para match ambíguo**: ao aprovar vinculando a um
   dos pacientes, os consentimentos da request devem sobrescrever os do
   paciente escolhido? Plano: só liga consentimento que estava `false`
   (nunca desliga), com timestamp novo — confirmar com o usuário.
6. **Slot exato obrigatório no POST** (defesa anti-forjamento) recomputa o dia
   inteiro — custo OK (1 profissional × 1 dia). Alternativa mais barata
   (validar apenas janela+alinhamento) se virar gargalo.
