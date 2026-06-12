---
title: "feat: Sincronização Google Agenda / iCal"
type: feat
status: planned
date: 2026-06-11
slug: google-calendar-sync
priority: 6
complexity: XL
---

# feat: Sincronização Google Agenda / iCal (outbound push + feed ICS + busy blocks)

## 1. Contexto de Negócio

### Problema

Profissionais de psicologia no Brasil frequentemente atendem em **mais de uma
clínica** e organizam a vida no **Google Agenda pessoal**. Hoje a Clinica não
conversa com nenhum calendário externo:

- O profissional precisa olhar dois (ou três) calendários para saber se está
  livre — e quando esquece, **agenda duplo** (double-booking) entre a clínica e
  compromissos pessoais ou de outra clínica.
- Sem ver as sessões da clínica no celular (widget do Google Calendar, Apple
  Calendar, relógio), muitos profissionais **abandonam a agenda do produto** e
  voltam para planilha/papel, matando o valor de todo o resto do sistema.
- É item de checklist em **toda comparação de software**: PsicoManager,
  Allminds, Sintropia (BR) e Jane App, Cliniko, Power Diary/Zanda,
  SimplePractice (internacional) anunciam sincronização com Google Calendar
  como recurso de primeira linha. A ausência é critério de eliminação na
  decisão de compra.
- A integração Google OAuth é **self-serve** — só código, sem parceria
  comercial. Custo zero de API.

### Objetivo

1. **Fase 1 (outbound)**: cada profissional vê as sessões da clínica no seu
   calendário pessoal (Google via OAuth, Apple/Outlook via feed ICS somente
   leitura), com privacidade LGPD por padrão (sem nome de paciente). A Clinica
   é **sempre a fonte da verdade** para eventos da clínica.
2. **Fase 2 (inbound)**: compromissos pessoais do Google Agenda viram "blocos
   ocupados" que (a) aparecem como overlay hachurado na agenda da clínica e
   (b) são subtraídos do cálculo de slots do agendamento-online — pacientes
   não conseguem se auto-agendar por cima de compromisso pessoal.

### Usuários-alvo

- **PROFESSIONAL**: conecta o próprio Google Agenda no perfil, escolhe o modo
  de privacidade, recebe os eventos automaticamente; gera link iCal para
  Apple/Outlook.
- **ADMIN**: também pode conectar (se tiver perfil profissional); enxerga o
  status das integrações da equipe (informativo).
- **Paciente** (indireto, fase 2): deixa de conseguir auto-agendar em horário
  que o profissional tem compromisso pessoal.

### Métricas de sucesso

- % de profissionais ativos com Google conectado (meta: 40% em 90 dias).
- Latência mediana entre mutação do Appointment e evento atualizado no Google
  (meta: < 2 min com flush pós-resposta; < 10 min via cron de varredura).
- Taxa de jobs de sync com falha permanente (meta: < 0,5%).
- Redução de reclamações/churn citando "não integra com Google Agenda".
- Fase 2: nº de tentativas de booking público bloqueadas por busy block.

### Reuso estratégico

- O mapeamento appointment→evento e as regras de privacidade são **funções
  puras** em `src/lib/calendar-sync` — reutilizáveis por um futuro provider
  Outlook/Microsoft Graph (mesma interface de client).
- O feed ICS serve qualquer consumidor (Apple, Outlook, Thunderbird, Notion)
  sem OAuth.
- Os `BusyBlock`s da fase 2 plugam diretamente no motor de slots do
  agendamento-online (plano `2026-06-11-002`, módulo `src/lib/booking`).

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **PROFESSIONAL**, quero clicar em "Conectar Google Agenda" no meu
   perfil e autorizar a Clinica, para que minhas sessões apareçam no meu
   calendário pessoal sem digitação manual.
2. Como **PROFESSIONAL**, quero que por padrão os eventos não exponham o nome
   dos meus pacientes ("Atendimento — {{nomeClinica}}"), para cumprir o sigilo
   profissional e a LGPD mesmo se alguém vir meu calendário.
3. Como **PROFESSIONAL**, quero opcionalmente ver o primeiro nome do paciente
   no título do evento, ciente do trade-off de privacidade.
4. Como **PROFESSIONAL**, quero que remarcações (inclusive drag-and-drop),
   cancelamentos e novas ocorrências de recorrência atualizem o Google
   automaticamente — inclusive as geradas pelo cron semanal.
5. Como **usuário de iPhone/Outlook**, quero um link iCal somente leitura
   (regenerável) para assinar minha agenda da clínica sem conta Google.
6. Como **PROFESSIONAL**, quero ser avisado (e-mail + badge no perfil) se a
   sincronização parar de funcionar (token revogado ou erro persistente).
7. (Fase 2) Como **PROFESSIONAL**, quero que meus compromissos pessoais do
   Google bloqueiem o auto-agendamento online e apareçam como "ocupado" na
   agenda da clínica — sem virar Appointment e sem impedir a equipe de agendar
   por cima (com aviso).
8. Como **ADMIN**, quero que tudo isso respeite o isolamento multi-tenant: a
   integração de um profissional só toca os appointments da minha clínica.

### 2.2 Fluxo do PROFESSIONAL — conectar Google (perfil, `/profile`)

Nova seção **"Sincronização de Agenda"** na página de perfil:

1. Estado desconectado: card com ícone `CalendarSync` (lucide), texto
   _"Veja suas sessões da clínica no seu Google Agenda. A Clinica continua
   sendo a fonte oficial: alterações feitas no Google sobre eventos da clínica
   serão sobrescritas."_ e botão **"Conectar Google Agenda"**.
2. Clique → `POST /api/calendar-sync/google/connect` devolve `authUrl` →
   redirect para consentimento Google (escopo `calendar.events`,
   `access_type=offline`, `prompt=consent`, `state` assinado por HMAC).
3. Callback valida `state`, troca o `code` por tokens, criptografa o
   `refresh_token` (AES-256-GCM, mesma `ENCRYPTION_KEY` do módulo bancário),
   cria a `CalendarIntegration` e dispara o **backfill**: enfileira UPSERT de
   todos os appointments futuros (90 dias) do profissional. Redirect para
   `/profile?calendar=conectado` → toast _"Google Agenda conectado! Suas
   próximas sessões serão enviadas em instantes."_
4. Estado conectado: badge **"Conectado"** (verde) + e-mail da conta Google +
   controles:
   - **Calendário de destino**: select carregado de
     `GET /api/calendar-sync/google/calendars` (default "Agenda principal").
   - **Privacidade**: radio — _"Total (recomendado): eventos aparecem como
     'Atendimento — {{nomeClinica}}'"_ / _"Primeiro nome: eventos mostram o
     primeiro nome do paciente (ex.: 'Atendimento — Maria')"_. Nunca telefone,
     CPF ou anotações.
   - Toggle **"Sincronizar lembretes e notas"** (default desligado; LEMBRETE e
     NOTA vão como eventos transparentes, sem bloquear horário no Google).
   - Botão **"Desconectar"** → modal de confirmação com checkbox _"Remover
     também os eventos já criados no Google"_ (opcional).
5. Estados de erro: badge **"Erro"** (âmbar) com `lastErrorMessage` resumida e
   botão "Tentar novamente" (re-enfileira backfill); badge **"Revogada"**
   (vermelho) com botão "Reconectar" quando o Google devolveu
   401/`invalid_grant`.

### 2.3 Fluxo do PROFESSIONAL — feed iCal (Apple/Outlook)

Na mesma seção, bloco **"Link iCal (Apple, Outlook e outros)"**:

- Botão **"Gerar link iCal"** → cria token aleatório e exibe URL
  `https://app…/api/public/calendar/{token}` com botão copiar e instruções
  curtas (_"No iPhone: Ajustes → Calendário → Contas → Adicionar conta →
  Outra → Assinar calendário"_).
- Botão **"Gerar novo link"** (invalida o anterior — usar se o link vazou) e
  **"Desativar"**.
- O feed serve os próximos **90 dias** (e 7 dias passados) dos appointments do
  profissional, com as **mesmas regras de privacidade** (modo configurável no
  mesmo radio — o modo vale para Google e ICS daquele profissional, cada
  integração guarda o seu).
- Aviso fixo: _"Calendários assinados atualizam no ritmo do seu aplicativo
  (geralmente a cada algumas horas). Para tempo real, use a conexão Google."_

### 2.4 Fluxo ADMIN

- ADMIN com perfil profissional usa exatamente o mesmo fluxo no próprio
  perfil.
- Em `/admin/professionals` (tabela existente), coluna informativa com badge
  de status da integração de cada profissional (Conectado / Erro / Revogada /
  —). Somente leitura: ADMIN **não** conecta/desconecta em nome de terceiros
  (o OAuth é pessoal, e a LGPD recomenda consentimento individual).

### 2.5 Fase 2 — blocos ocupados (inbound)

1. Profissional já conectado vê um novo toggle **"Bloquear horários ocupados
   da minha agenda pessoal"**. Ao ligar pela primeira vez, a Clinica pede o
   escopo adicional de leitura (re-consent incremental no Google) e exibe
   checkboxes dos calendários pessoais a considerar (`selectedCalendarIds`).
2. Cron `poll-busy-blocks` (a cada 30 min) consulta `freeBusy` dos calendários
   selecionados num horizonte de 30 dias e substitui os `BusyBlock`s do
   profissional (delete + insert, dados efêmeros).
3. Agenda da clínica: intervalos ocupados aparecem como **overlay hachurado**
   cinza _"Ocupado (agenda pessoal)"_ na timeline — sem horário detalhado do
   compromisso, sem título, sem participantes (só o intervalo).
4. Equipe agendando por cima de um busy block: **aviso, não erro** — banner
   `InlineAlert` no `CreateAppointmentSheet`: _"Atenção: o profissional tem um
   compromisso pessoal neste horário."_ (espelha a UX de aviso de conflito
   existente; o `checkConflict` continua decidindo o que é erro).
5. Agendamento-online (plano 002): o motor de slots subtrai os `BusyBlock`s
   dos horários ofertados ao público.
6. Busy blocks **nunca** criam Appointments locais e **nunca** disparam
   notificações.

### 2.6 Regras de negócio

| #   | Regra |
|-----|-------|
| R1  | **Fonte da verdade**: eventos de clínica no Google são propriedade da Clinica. Edições feitas no Google (horário, título) são sobrescritas no próximo sync. Documentado na UI (texto do card de conexão). |
| R2  | **Privacidade LGPD default**: modo `TOTAL` — título "Atendimento — {{nomeClinica}}", sem nome de paciente. Modo `PRIMEIRO_NOME` opcional mostra só o primeiro nome. Nunca telefone, CPF, e-mail ou notas em nenhum modo, em nenhum campo do evento. |
| R3  | **Tipos sincronizados**: CONSULTA, TAREFA e REUNIAO (bloqueiam horário, `transparency: "opaque"`). LEMBRETE/NOTA só se `syncNonBlocking=true` (vão como `transparency: "transparent"`). |
| R4  | **Cancelamento** (`status=CANCELADO`) ou mudança para tipo não-sincronizável **remove** o evento do Google. Exclusão física do Appointment idem (o link sobrevive à exclusão para permitir a limpeza remota). |
| R5  | **Recorrências viram eventos individuais** no Google (a Clinica materializa ocorrências e tem semântica própria de exceções; RRULE divergiria). Cada ocorrência tem seu próprio `googleEventId`. |
| R6  | **Idempotência**: tabela `CalendarEventLink` (`integrationId` + `appointmentId` únicos) decide insert vs update. Antes de um insert, o processor busca no Google por `privateExtendedProperty clinicaAppointmentId={id}` para recuperar eventos órfãos de execuções interrompidas. Hash do corpo do evento (`lastSyncHash`) evita updates no-op. |
| R7  | **Retry**: backoff exponencial reutilizando `calculateNextRetryDelay` das notificações (`maxAttempts=5`). 429/5xx → retry; falha definitiva → job FAILED + integração `ERRO` + e-mail ao profissional. 401/`invalid_grant` → integração `REVOGADA` imediatamente + e-mail; eventos existentes ficam no Google (limpeza é botão opcional). |
| R8  | **Uma integração Google por User** (`@@unique([userId, provider])`). Dois profissionais compartilhando a mesma conta Google não é suportado (documentado). Profissional multi-clínica = dois Users em tenants distintos = duas integrações independentes com links de evento distintos — funciona naturalmente. |
| R9  | **Timezone**: corpo dos eventos sempre com `timeZone` = `clinic.timezone` (default `America/Sao_Paulo`); instantes vêm do banco em UTC. |
| R10 | **Multi-tenant**: toda query é escoped por `clinicId`. A integração pertence ao `userId` + `clinicId` da sessão; rotas nunca aceitam `userId`/`integrationId` no body. O processor só toca appointments com `clinicId` igual ao do job/integração. |
| R11 | **Fan-out multi-profissional**: o evento é enviado para o profissional dono (`professionalProfileId`) **e** para cada `AppointmentProfessional` adicional que tenha integração ATIVA — um `CalendarEventLink` por integração. |
| R12 | **Bulk**: operações em lote (bulk-cancel, regeneração de recorrência, cron extend-recurrences) enfileiram um job por appointment via `createMany skipDuplicates` (índice único parcial dedupa PENDING) e são processadas com paralelismo limitado, dentro das quotas do Google. |
| R13 | **ICS**: feed somente leitura, token aleatório de 32 bytes, sem OAuth, rate-limited por token+IP (lib `rate-limit` existente), `Cache-Control: private, max-age=300`. Token regenerável invalida o anterior na hora. |
| R14 | **Fase 2**: busy blocks são efêmeros (substituição total por poll), nunca criam Appointment, nunca bloqueiam a equipe (aviso, não erro) e são subtraídos só do **slot público** do agendamento-online. |
| R15 | Conectar/desconectar/alterar privacidade/regenerar token ICS geram `AuditLog` (`entityType: "CalendarIntegration"`). |
| R16 | Requer `professionalProfileId` na sessão — só quem tem perfil profissional possui appointments para sincronizar (User admin sem perfil vê a seção desabilitada com explicação). |

### 2.7 Edge cases

- **Evento apagado manualmente no Google**: update devolve 404/410 → processor
  recria via insert (e atualiza o link). Delete que devolve 404/410 → tratado
  como sucesso.
- **Appointment criado antes da conexão**: coberto pelo backfill (90 dias à
  frente) disparado no callback e pelo botão "Tentar novamente".
- **Reagendamento por drag-and-drop**: passa pelo `PATCH
  /api/appointments/[id]` → mesmo hook de enqueue, nada especial.
- **Confirmação de presença** (status AGENDADO→CONFIRMADO): corpo do evento
  não muda → hash igual → update pulado (no-op barato).
- **Paciente nulo** (TAREFA/REUNIAO/LEMBRETE/NOTA): `patient?.name` com
  optional chaining em todo o mapeamento; título usa `appointment.title` ou
  fallback por tipo ("Tarefa — {{nomeClinica}}" etc.).
- **Troca de calendário de destino**: eventos antigos ficam no calendário
  antigo; processor passa a usar o novo para upserts seguintes. (Migração em
  massa fica fora do escopo — documentado na UI: _"Eventos já criados
  permanecem no calendário anterior."_)
- **Desconexão com limpeza**: enfileira DELETE por link existente antes de
  apagar a integração; sem limpeza: apaga integração + links e deixa os
  eventos.
- **Clínica com assinatura read_only**: mutações já são bloqueadas pelos
  wrappers; o processor continua processando jobs já enfileirados; o feed ICS
  (somente leitura) continua servindo.
- **Duas conexões simultâneas** (duas abas): callback usa upsert por
  `[userId, provider]` — última grava.
- **Job referenciando appointment de outra clínica**: impossível por
  construção (enqueue copia `clinicId` da mutação); processor revalida
  `appointment.clinicId === job.clinicId` por defesa em profundidade.
- **Fase 2 — evento all-day pessoal**: freeBusy devolve o intervalo completo
  do dia → bloqueia o dia no slot público (comportamento desejado).

### 2.8 Copy pt-BR (chaves principais)

| Contexto | Texto |
|---|---|
| Seção do perfil | "Sincronização de Agenda" |
| Botão conectar | "Conectar Google Agenda" |
| Aviso fonte-da-verdade | "A Clinica é a fonte oficial dos seus atendimentos. Alterações feitas diretamente no Google sobre eventos da clínica serão sobrescritas." |
| Privacidade total | "Total (recomendado) — eventos aparecem como 'Atendimento — {{nomeClinica}}', sem nome de paciente" |
| Privacidade primeiro nome | "Primeiro nome — eventos mostram apenas o primeiro nome do paciente" |
| Toggle lembretes | "Sincronizar lembretes e notas (não bloqueiam horário no Google)" |
| Toast conectado | "Google Agenda conectado! Suas próximas sessões serão enviadas em instantes." |
| Toast desconectado | "Google Agenda desconectado." |
| Badge status | "Conectado" / "Erro" / "Revogada" / "Não conectado" |
| Erro revogada | "O acesso ao Google foi revogado. Reconecte para retomar a sincronização." |
| E-mail de erro (assunto) | "Sincronização com Google Agenda interrompida" |
| ICS título | "Link iCal (Apple, Outlook e outros)" |
| ICS regenerar | "Gerar novo link" + confirmação "O link anterior deixará de funcionar imediatamente." |
| Busy overlay (fase 2) | "Ocupado (agenda pessoal)" |
| Aviso staff (fase 2) | "Atenção: o profissional tem um compromisso pessoal neste horário." |
| Título evento (TOTAL) | "Atendimento — {{nomeClinica}}" / "Tarefa — {{nomeClinica}}" / "Reunião — {{nomeClinica}}" |
| Título evento (PRIMEIRO_NOME) | "Atendimento — {{primeiroNome}}" |

---

## 3. Design Técnico

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

> Migração SQL escrita **offline** (nunca `prisma db push` / `migrate dev`):
> novo arquivo `prisma/migrations/<timestamp>_calendar_sync/migration.sql`
> com `CREATE TYPE`, `CREATE TABLE`, `ALTER TYPE "NotificationType" ADD VALUE
> 'CALENDAR_SYNC_ERROR'` e o índice único parcial descrito abaixo.

```prisma
enum CalendarProvider {
  GOOGLE
  ICS
}

enum CalendarIntegrationStatus {
  ATIVA
  ERRO
  REVOGADA
}

enum CalendarPrivacyMode {
  TOTAL          // "Atendimento — {clinicName}" (default LGPD)
  PRIMEIRO_NOME  // "Atendimento — {primeiro nome do paciente}"
}

enum CalendarSyncOperation {
  UPSERT
  DELETE
}

enum CalendarSyncJobStatus {
  PENDING
  DONE
  FAILED
}

/// Conexão de calendário externo de um usuário (uma por provider por User).
/// GOOGLE: OAuth com refresh token criptografado. ICS: feed somente leitura.
model CalendarIntegration {
  id          String                    @id @default(cuid())
  clinicId    String
  userId      String
  provider    CalendarProvider
  status      CalendarIntegrationStatus @default(ATIVA)
  privacyMode CalendarPrivacyMode       @default(TOTAL)
  syncNonBlocking Boolean               @default(false) // LEMBRETE/NOTA

  // GOOGLE (null para provider ICS)
  encryptedRefreshToken String?  @db.Text // AES-256-GCM (src/lib/crypto)
  googleAccountEmail    String?
  targetCalendarId      String?  @default("primary")
  grantedScopes         String[] @default([])
  lastSyncAt            DateTime?
  lastErrorMessage      String?

  // Fase 2 (inbound busy blocks)
  inboundEnabled      Boolean   @default(false)
  selectedCalendarIds String[]  @default([])
  busyBlocksFetchedAt DateTime?

  // ICS (null para provider GOOGLE)
  icsToken String? @unique // hex de 32 bytes; lookup global pelo feed público

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic     Clinic              @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  user       User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  eventLinks CalendarEventLink[]
  busyBlocks BusyBlock[]

  @@unique([userId, provider])
  @@index([clinicId])
  @@index([clinicId, status])
}

/// Mapeamento appointment ↔ evento Google (garantia de idempotência).
/// appointmentId é String SEM FK de propósito: o link precisa sobreviver à
/// exclusão física do Appointment para permitir apagar o evento remoto.
model CalendarEventLink {
  id               String  @id @default(cuid())
  clinicId         String
  integrationId    String
  appointmentId    String
  googleCalendarId String
  googleEventId    String
  lastSyncHash     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic      Clinic              @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  integration CalendarIntegration @relation(fields: [integrationId], references: [id], onDelete: Cascade)

  @@unique([integrationId, appointmentId])
  @@index([clinicId])
  @@index([appointmentId])
}

/// Fila durável (outbox) de sincronização. Um job por appointment; o
/// processor resolve em runtime quais integrações recebem o evento.
/// appointmentId sem FK (pode referenciar appointment já excluído).
model CalendarSyncJob {
  id            String                @id @default(cuid())
  clinicId      String
  appointmentId String
  operation     CalendarSyncOperation
  status        CalendarSyncJobStatus @default(PENDING)
  attempts      Int                   @default(0)
  maxAttempts   Int                   @default(5)
  nextRetryAt   DateTime?
  lastError     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  @@index([status, nextRetryAt])
  @@index([clinicId])
  @@index([appointmentId])
  // Índice único PARCIAL no SQL da migração (precedente: Todo):
  //   CREATE UNIQUE INDEX "CalendarSyncJob_pending_uniq"
  //   ON "CalendarSyncJob"("appointmentId", "operation")
  //   WHERE "status" = 'PENDING';
  // createMany({ skipDuplicates: true }) dedupa re-enfileiramentos.
}

/// Fase 2: intervalo ocupado vindo do calendário pessoal (efêmero —
/// substituído integralmente a cada poll). Nunca vira Appointment.
model BusyBlock {
  id                    String   @id @default(cuid())
  clinicId              String
  integrationId         String
  professionalProfileId String
  startAt               DateTime
  endAt                 DateTime
  sourceCalendarId      String
  fetchedAt             DateTime @default(now())

  clinic              Clinic              @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  integration         CalendarIntegration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)

  @@index([clinicId, professionalProfileId, startAt])
  @@index([integrationId])
}
```

Alterações em modelos existentes:

- `Clinic`: adicionar relations `calendarIntegrations CalendarIntegration[]`,
  `calendarEventLinks CalendarEventLink[]`, `calendarSyncJobs
  CalendarSyncJob[]`, `busyBlocks BusyBlock[]`.
- `User`: adicionar `calendarIntegrations CalendarIntegration[]`.
- `ProfessionalProfile`: adicionar `busyBlocks BusyBlock[]`.
- `enum NotificationType`: adicionar `CALENDAR_SYNC_ERROR` (e-mail interno ao
  profissional; sem gate por clínica — entra em
  `ALWAYS_ENABLED_EMAIL_TYPES` no `notification-service.ts`).

### 3.2 Novo domain module `src/lib/calendar-sync/` (funções puras + testes colocados)

Cada arquivo < 200 linhas; barrel `index.ts`. Tipos de domínio em `types.ts`
(sem dependência de framework; enums Prisma usados como string literals nos
testes).

```
src/lib/calendar-sync/
├── index.ts                 # barrel
├── types.ts                 # SyncSnapshot, IntegrationPrefs, GoogleEventBody,
│                            # BusyInterval, CalendarClient (interface), erros
├── privacy.ts               # funções puras de privacidade
├── privacy.test.ts
├── event-mapping.ts         # appointment -> corpo do evento Google + hash
├── event-mapping.test.ts
├── sync-planner.ts          # decide upsert/deleteRemote/skip (puro)
├── sync-planner.test.ts
├── ics.ts                   # geração do feed ICS (puro)
├── ics.test.ts
├── oauth.ts                 # state HMAC + URL de autorização (puro)
├── oauth.test.ts
├── queue.ts                 # enqueueCalendarSync (tx) + flush pós-resposta
├── processor.ts             # processCalendarSyncJobs (Prisma + client)
├── busy-blocks.ts           # fase 2: merge/subtração de intervalos (puro)
├── busy-blocks.test.ts
└── providers/
    ├── google-calendar-client.ts  # REST fetch (sem SDK googleapis)
    └── google-calendar-mock.ts    # dev/testes (padrão whatsapp-mock)
```

Assinaturas principais:

```ts
// types.ts
export interface SyncSnapshot {
  id: string
  clinicId: string
  type: AppointmentType            // string literal nos testes
  status: AppointmentStatus
  scheduledAt: Date
  endAt: Date
  title: string | null
  patientName: string | null       // patient?.name — paciente é nullable!
  clinicName: string
  timezone: string                 // clinic.timezone
}

export interface IntegrationPrefs {
  privacyMode: "TOTAL" | "PRIMEIRO_NOME"
  syncNonBlocking: boolean
}

export interface GoogleEventBody {
  summary: string
  description?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  transparency: "opaque" | "transparent"
  extendedProperties: { private: { clinicaAppointmentId: string; clinicaClinicId: string } }
}

export interface CalendarClient {
  insertEvent(calendarId: string, body: GoogleEventBody): Promise<{ id: string }>
  updateEvent(calendarId: string, eventId: string, body: GoogleEventBody): Promise<void>
  deleteEvent(calendarId: string, eventId: string): Promise<void>
  findEventsByAppointmentId(calendarId: string, appointmentId: string): Promise<{ id: string }[]>
  listCalendars(): Promise<{ id: string; summary: string; primary: boolean }[]>
  freeBusy(calendarIds: string[], timeMin: Date, timeMax: Date): Promise<BusyInterval[]> // fase 2
}

export class CalendarAuthError extends Error {}      // 401 / invalid_grant
export class CalendarRateLimitError extends Error {} // 429 (carrega retryAfterMs?)

// privacy.ts
export function firstNameOnly(fullName: string): string
export function buildEventTitle(snapshot: SyncSnapshot, mode: CalendarPrivacyMode): string
// CONSULTA/TOTAL -> "Atendimento — {clinicName}"
// CONSULTA/PRIMEIRO_NOME -> "Atendimento — {firstNameOnly(patientName)}" (fallback TOTAL se patientName null)
// TAREFA/REUNIAO/LEMBRETE/NOTA -> title ?? "Tarefa — {clinicName}" etc. (title é livre do staff, sem PII de paciente)

// event-mapping.ts
export function isSyncableType(type: AppointmentType, prefs: IntegrationPrefs): boolean
export function buildGoogleEventBody(snapshot: SyncSnapshot, prefs: IntegrationPrefs, agendaBaseUrl: string): GoogleEventBody
// description = apenas o deep link "{agendaBaseUrl}/agenda?date=YYYY-MM-DD" — nunca notes/telefone
export function computeSyncHash(body: GoogleEventBody): string // sha256 de JSON canônico

// sync-planner.ts
export type SyncAction = "upsert" | "deleteRemote" | "skip"
export function planSyncAction(snapshot: SyncSnapshot | null, prefs: IntegrationPrefs): SyncAction
// null (appointment excluído) -> deleteRemote
// status CANCELADO -> deleteRemote
// tipo não sincronizável -> deleteRemote (cobre mudança de preferência)
// caso contrário -> upsert

// ics.ts
export interface IcsEvent { uid: string; title: string; start: Date; end: Date; cancelled: boolean }
export function buildIcsFeed(opts: { calendarName: string; timezone: string; events: IcsEvent[]; now: Date }): string
export function escapeIcsText(text: string): string   // RFC 5545: \ ; , \n
export function foldIcsLine(line: string): string      // quebra em 75 octetos
export function formatIcsDateLocal(d: Date, timezone: string): string // "YYYYMMDDTHHmmss" no fuso

// oauth.ts (HMAC com AUTH_SECRET, mesmo padrão de appointment-links)
export function signOAuthState(userId: string, clinicId: string, issuedAt: number): string
export function verifyOAuthState(state: string, maxAgeSeconds?: number):
  { valid: boolean; userId?: string; clinicId?: string; error?: string }
export function buildGoogleAuthUrl(opts: {
  clientId: string; redirectUri: string; state: string; includeFreeBusyScope: boolean
}): string

// queue.ts
export async function enqueueCalendarSync(
  db: Prisma.TransactionClient | PrismaClient,
  params: { clinicId: string; appointmentIds: string[]; operation: "UPSERT" | "DELETE" }
): Promise<number> // createMany skipDuplicates (índice parcial dedupa PENDING)
export function flushCalendarSyncAfterResponse(): void
// usa after() de "next/server" (Next 16) p/ chamar processCalendarSyncJobs
// best-effort pós-resposta; o cron é a varredura garantida

// processor.ts
export async function processCalendarSyncJobs(limit?: number):
  Promise<{ processed: number; succeeded: number; retried: number; failed: number }>

// busy-blocks.ts (fase 2)
export interface BusyInterval { start: Date; end: Date }
export function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[]
export function clampToHorizon(intervals: BusyInterval[], from: Date, to: Date): BusyInterval[]
export function overlapsBusy(slotStart: Date, slotEnd: Date, busy: BusyInterval[]): boolean
```

**Algoritmo do processor** (por job PENDING com `nextRetryAt <= now`, lote
default 50, paralelismo 3):

1. Carrega o appointment com `findFirst({ where: { id: job.appointmentId,
   clinicId: job.clinicId }, include: { patient: { select: { name } }, clinic:
   { select: { name, timezone } }, professionalProfile: { select: { userId }
   }, additionalProfessionals: { select: { professionalProfile: { select: {
   userId } } } } } })` — escopo por clinicId sempre.
2. Resolve integrações alvo: `calendarIntegration.findMany({ where: {
   clinicId: job.clinicId, provider: "GOOGLE", status: { not: "REVOGADA" },
   userId: { in: userIdsDosProfissionais } } })`. Para operation DELETE (ou
   appointment inexistente), os alvos vêm dos `CalendarEventLink`s existentes
   do appointmentId (escopo clinicId).
3. Por integração: `planSyncAction(snapshot, prefs)`:
   - `upsert`: monta corpo + hash; se link existe e hash igual → skip; se link
     existe → `updateEvent` (404/410 → re-insert); senão →
     `findEventsByAppointmentId` (recupera órfão) ou `insertEvent`, depois
     `create` do link. Atualiza `lastSyncHash` e `lastSyncAt`.
   - `deleteRemote`: `deleteEvent` por link (404/410 = sucesso) e apaga o
     link.
4. Erros: `CalendarAuthError` → integração `REVOGADA` + e-mail
   (`CALENDAR_SYNC_ERROR` via `createAndSendNotification`, recipient =
   `user.email`) — não conta como retry das demais integrações.
   `CalendarRateLimitError`/5xx → incrementa `attempts`, `nextRetryAt = now +
   calculateNextRetryDelay(attempts)`; em `attempts >= maxAttempts` → job
   FAILED + integração `ERRO` + `lastErrorMessage` + e-mail.
5. Sucesso em todas as integrações → job DONE.

### 3.3 Extração do helper de criptografia

`src/lib/bank-reconciliation/encryption.ts` (AES-256-GCM com `ENCRYPTION_KEY`)
é genérico. Extrair para **`src/lib/crypto/encryption.ts`** (+ teste movido) e
re-exportar do barrel de `bank-reconciliation` para não quebrar imports. O
módulo calendar-sync importa de `@/lib/crypto`.

### 3.4 Rotas de API

Todas as rotas autenticadas usam `withFeatureAuth` e operam **somente sobre a
integração do próprio usuário da sessão** (`userId: user.id, clinicId:
user.clinicId`) — nenhum id de integração/usuário vem do body (tenant-scoping
por construção; nada a validar via ownership além disso).

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/calendar-sync` | GET | `withFeatureAuth({ feature: "calendar_sync", minAccess: "READ" })` | Estado das integrações do usuário (GOOGLE + ICS): status, e-mail Google, privacyMode, targetCalendarId, syncNonBlocking, inboundEnabled, icsUrl (montada do token), lastSyncAt, lastErrorMessage. |
| `/api/calendar-sync` | PATCH | `calendar_sync`, `WRITE` | Body zod: `{ provider: "GOOGLE"\|"ICS", privacyMode?, syncNonBlocking?, targetCalendarId?, inboundEnabled?, selectedCalendarIds? }`. `targetCalendarId`/`selectedCalendarIds` validados contra `listCalendars()` da própria conta. Mudança de privacyMode re-enfileira UPSERT dos próximos 90 dias. AuditLog. |
| `/api/calendar-sync/google/connect` | POST | `calendar_sync`, `WRITE` | 400 se `user.professionalProfileId == null`. Gera `state` HMAC e devolve `{ authUrl }`. |
| `/api/calendar-sync/google/callback` | GET | `withAuthentication` | Valida `state` (HMAC + userId da sessão + idade ≤ 10 min), troca `code`, criptografa refresh token, upsert da integração (`[userId, provider]`), dispara backfill (enqueue UPSERT 90 dias) + `flushCalendarSyncAfterResponse()`, AuditLog, redirect `/profile?calendar=conectado` (erros → `/profile?calendar=erro`). |
| `/api/calendar-sync/google/calendars` | GET | `calendar_sync`, `READ` | Proxy de `listCalendars()` da integração do usuário (404 se não conectado). |
| `/api/calendar-sync/google` | DELETE | `calendar_sync`, `WRITE` | Query `?cleanup=true` → enfileira DELETE por `CalendarEventLink` antes; revoga token no Google (best-effort, `https://oauth2.googleapis.com/revoke`); apaga integração (+links via cascade quando sem cleanup imediato — com cleanup, integração fica `status=REVOGADA` até os jobs drenarem e um job final remove). AuditLog. |
| `/api/calendar-sync/google/retry` | POST | `calendar_sync`, `WRITE` | "Tentar novamente": volta status para ATIVA e re-enfileira backfill 90 dias. |
| `/api/calendar-sync/ics` | POST | `calendar_sync`, `WRITE` | Cria/regenera `icsToken` (32 bytes `randomBytes`, hex) na integração provider ICS (upsert). Devolve URL completa. AuditLog. |
| `/api/calendar-sync/ics` | DELETE | `calendar_sync`, `WRITE` | Desativa o feed (apaga a integração ICS). AuditLog. |
| `/api/public/calendar/[token]` | GET | público (`src/app/api/public/`) | Lookup `calendarIntegration.findUnique({ where: { icsToken } })` (token único global carrega o tenant — sem sessão). Rate limit por token+IP. Busca appointments do profissional (`clinicId` da integração, próximos 90 dias + 7 passados, tipos sincronizáveis) e responde `text/calendar; charset=utf-8` com `buildIcsFeed`. 404 genérico p/ token inválido. |
| `/api/calendar-sync/busy-blocks` | GET | `calendar_sync`, `READ` | Fase 2. Query `professionalProfileId, from, to`. Se diferente do próprio perfil → exige `agenda_others ≥ READ` (mesma regra das rotas de agenda). Sempre `where: { clinicId: user.clinicId }`. Devolve intervalos (sem título/origem). |
| `/api/jobs/process-calendar-sync` | GET | `Bearer CRON_SECRET` | Chama `processCalendarSyncJobs(100)`; devolve contadores (padrão extend-recurrences). |
| `/api/jobs/poll-busy-blocks` | GET | `Bearer CRON_SECRET` | Fase 2. Para cada integração ATIVA com `inboundEnabled`: `freeBusy` 30 dias → `mergeBusyIntervals` → `deleteMany` + `createMany` em transação; atualiza `busyBlocksFetchedAt`. 401 → REVOGADA + e-mail. |

Handlers finos (< 50 linhas de lógica inline): zod parse + Prisma + chamadas
ao módulo `calendar-sync`.

### 3.5 RBAC — nova feature `calendar_sync`

- `src/lib/rbac/types.ts`: adicionar `"calendar_sync"` em `FEATURES` e label
  `calendar_sync: "Sincronizacao de Agenda"` em `FEATURE_LABELS` (labels
  existentes são ASCII sem acento).
- `src/lib/rbac/permissions.ts` (`ROLE_DEFAULTS`): `ADMIN: WRITE`,
  `PROFESSIONAL: WRITE` (recurso self-service por natureza; override por
  usuário continua possível via `UserPermission`).

### 3.6 Hooks de enqueue nos caminhos de CRUD de Appointment

Padrão (2 linhas por rota): dentro da transação da mutação →
`await enqueueCalendarSync(tx, { clinicId: user.clinicId, appointmentIds,
operation })`; após montar a resposta → `flushCalendarSyncAfterResponse()`.

| Arquivo | Operação enfileirada |
|---|---|
| `src/app/api/appointments/route.ts` (POST) | UPSERT dos criados (sessão única e materialização de recorrência — todos os ids do createMany) |
| `src/app/api/appointments/[id]/route.ts` (PATCH/PUT) | UPSERT (cobre drag-and-drop e edição) |
| `src/app/api/appointments/[id]/route.ts` (DELETE) | DELETE (enfileirar **antes** do delete físico, na mesma transação) |
| `src/app/api/appointments/[id]/cancel/route.ts` | UPSERT (planner vê CANCELADO → deleteRemote) |
| `src/app/api/appointments/[id]/status/route.ts` | UPSERT (no-op por hash quando o corpo não muda) |
| `src/app/api/appointments/bulk-cancel/route.ts` | UPSERT em lote |
| `src/app/api/appointments/recurrences/[id]/route.ts` (PATCH/DELETE) | UPSERT/DELETE dos appointments afetados (regeneração: DELETE dos removidos + UPSERT dos novos) |
| `src/app/api/appointments/recurrences/[id]/exceptions/route.ts` | UPSERT/DELETE da ocorrência excetuada |
| `src/app/api/appointments/recurrences/[id]/finalize/route.ts` | DELETE dos futuros removidos |
| `src/app/api/group-sessions/route.ts`, `update`, `reschedule`, `status` | UPSERT (sessões de grupo são Appointments CONSULTA por paciente; para o Google o fan-out por integração do profissional gera 1 evento por appointment — ver Questão Q5) |
| `src/app/api/public/appointments/cancel/route.ts` | UPSERT (cancelamento do paciente) |
| `src/app/api/public/appointments/confirm/route.ts` | UPSERT (no-op por hash; barato) |
| `src/app/api/jobs/extend-recurrences/route.ts` | UPSERT dos appointments criados pelo cron (ids retornados por lote) |

### 3.7 Cron jobs (`vercel.json`)

```json
{ "path": "/api/jobs/process-calendar-sync", "schedule": "*/10 * * * *" },
{ "path": "/api/jobs/poll-busy-blocks", "schedule": "*/30 * * * *" }
```

O flush pós-resposta (`after()`) cobre o caminho feliz em segundos; o cron de
10 min é a varredura de retries e de jobs cujo flush falhou. (Limite do plano
Vercel: ver Riscos.)

### 3.8 Notificações

- Novo `NotificationType.CALENDAR_SYNC_ERROR` (canal EMAIL, recipient =
  e-mail do User do profissional, `patientId`/`appointmentId` nulos).
- `src/lib/notifications/notification-service.ts`: adicionar
  `CALENDAR_SYNC_ERROR` em `ALWAYS_ENABLED_EMAIL_TYPES` (interno à equipe, sem
  gate `appointmentNotificationsEnabled`).
- Conteúdo (template fixo no código, sem `NotificationTemplate` por clínica):
  assunto "Sincronização com Google Agenda interrompida"; corpo com motivo
  (revogada vs erro persistente) e link para `/profile`.

### 3.9 Páginas e componentes de UI

Novos (feature-specific em `src/app/profile/components/`):

- `src/app/profile/components/CalendarSyncSettings.tsx` — card-mãe da seção
  (carrega `GET /api/calendar-sync` via handler de fetch existente no padrão
  da página; estados derivados, sem `useEffect` — usar o mesmo
  `useMountEffect`/fetch-on-mount já empregado pela página de perfil).
- `src/app/profile/components/GoogleCalendarCard.tsx` — status, conectar,
  privacidade (radio), calendário destino (select), toggle lembretes,
  desconectar (modal com checkbox de limpeza), fase 2: toggle inbound +
  checkboxes de calendários.
- `src/app/profile/components/IcsFeedCard.tsx` — gerar/copiar/regenerar/
  desativar link iCal.
- `src/shared/components/CalendarSyncStatusBadge.tsx` — badge
  Conectado/Erro/Revogada/— (reusado em `/admin/professionals`).

Modificados:

- `src/app/profile/page.tsx` — renderiza `<CalendarSyncSettings />` (a página
  já está em ~330 linhas: **não** adicionar lógica inline; só o mount do
  componente).
- `src/app/admin/professionals/...` (tabela) — coluna de badge de status
  (dados agregados no endpoint que já alimenta a tabela, select mínimo de
  `CalendarIntegration.status` por userId, escopo clinicId).
- Fase 2: `src/app/agenda/components/AgendaTimeline.tsx` /
  `DailyOverviewGrid.tsx` — render do novo
  `src/app/agenda/components/BusyBlockOverlay.tsx` (hachura CSS
  `repeating-linear-gradient`, label "Ocupado (agenda pessoal)");
  `CreateAppointmentSheet.tsx` — `InlineAlert` de aviso quando o horário
  escolhido cruza busy block (consulta a `/api/calendar-sync/busy-blocks`
  no evento de seleção de horário — event handler, não effect).

Forms com react-hook-form + zod onde há submissão (privacidade/preferências);
feedback via Sonner; ícones lucide (`CalendarSync`, `Link`, `RefreshCw`,
`Unplug`).

### 3.10 Auditoria

`createAuditLog` (`src/lib/rbac/audit.ts`) com `entityType:
"CalendarIntegration"`, `entityId: integration.id` e actions:
`calendar_integration.connected`, `.disconnected`, `.updated`
(old/new de privacyMode, targetCalendarId, syncNonBlocking, inboundEnabled),
`.ics_token_generated`, `.ics_token_revoked`, `.cleanup_requested`. Se houver
labels de campos em `src/lib/audit/field-labels`, registrar os novos campos.

### 3.11 Variáveis de ambiente

| Var | Uso |
|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` | OAuth app (Google Cloud Console, tipo Web) |
| `GOOGLE_CALENDAR_REDIRECT_URI` | `${origin}/api/calendar-sync/google/callback` (fallback derivado de `NEXTAUTH_URL`) |
| `CALENDAR_SYNC_PROVIDER` | `google` \| `mock` (default `mock` em dev — padrão whatsapp-mock) |
| `ENCRYPTION_KEY` | já existe (módulo bancário) — reusada |
| `AUTH_SECRET` | já existe — assina o `state` OAuth |
| `CRON_SECRET` | já existe — protege os jobs |

Cliente Google implementado com `fetch` puro contra
`https://www.googleapis.com/calendar/v3` e
`https://oauth2.googleapis.com/token` (sem dependência `googleapis` — pesada
para Vercel). Access token obtido por refresh sob demanda e cacheado em
memória por execução (não persistido).

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`. Enums
Prisma como string literals. `vi.useFakeTimers()` onde há tempo.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/calendar-sync/privacy.test.ts` | `firstNameOnly` (nome composto, espaços, vazio); título TOTAL por tipo (CONSULTA/TAREFA/REUNIAO/LEMBRETE/NOTA); PRIMEIRO_NOME com paciente; **paciente null → fallback TOTAL** (gotcha do patient nullable); título nunca contém telefone/notes (entrada com PII não vaza). |
| `src/lib/calendar-sync/event-mapping.test.ts` | `isSyncableType` (matriz tipo × syncNonBlocking); corpo: timeZone da clínica, transparency opaque/transparent, extendedProperties com appointmentId/clinicId; description só contém o deep link; `computeSyncHash` estável (mesma entrada → mesmo hash; ordem de chaves irrelevante) e sensível (mudou horário/título → muda). |
| `src/lib/calendar-sync/sync-planner.test.ts` | snapshot null → deleteRemote; CANCELADO → deleteRemote; tipo não sincronizável → deleteRemote; LEMBRETE com syncNonBlocking=true → upsert; CONSULTA AGENDADO/CONFIRMADO/FINALIZADO → upsert. |
| `src/lib/calendar-sync/ics.test.ts` | estrutura VCALENDAR/VEVENT válida (BEGIN/END pareados, PRODID, X-WR-CALNAME); escaping RFC 5545 (`;` `,` `\n` `\\`); folding de linha > 75 octetos; datas no fuso São Paulo (`formatIcsDateLocal` converte UTC→local); evento cancelado → `STATUS:CANCELLED`; UID estável = `{appointmentId}@clinica`. |
| `src/lib/calendar-sync/oauth.test.ts` | sign/verify round-trip; state adulterado → invalid; expirado (> 10 min) → invalid; `buildGoogleAuthUrl` contém scope events, `access_type=offline`, `prompt=consent`, state url-encoded; flag freeBusy adiciona o escopo de leitura. |
| `src/lib/calendar-sync/busy-blocks.test.ts` | `mergeBusyIntervals` (sobrepostos, adjacentes, desordenados); `clampToHorizon` (corta bordas, descarta fora); `overlapsBusy` (toque de borda não conta, contido conta). |
| `src/lib/crypto/encryption.test.ts` | movido de bank-reconciliation (round-trip, chave inválida) — garante que a extração não regrediu. |
| `src/lib/notifications/*` (existentes) | atualizar teste do service para cobrir `CALENDAR_SYNC_ERROR` em `ALWAYS_ENABLED_EMAIL_TYPES`. |
| `src/lib/rbac/permissions.test.ts` (existente) | defaults da nova feature `calendar_sync` (ADMIN WRITE, PROFESSIONAL WRITE) e label registrado. |

O processor/queue dependem de Prisma e do client — a lógica decidível foi
extraída para `sync-planner.ts`/`event-mapping.ts` (puros, testados); o client
real fica atrás da interface `CalendarClient` com `google-calendar-mock.ts`
para dev. Gates antes de cada commit: `npx prisma generate && npm run test &&
npm run build`.

---

## 5. Etapas de Implementação

> `bash scripts/new-feature.sh google-calendar-sync` → trabalhar em
> `../clinica-google-calendar-sync` com banco isolado. Commits convencionais
> locais (sem push) terminando com
> `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

**Fase 1 — outbound + ICS**

1. **Schema + migração offline**: enums e modelos da §3.1, relations em
   Clinic/User/ProfessionalProfile, `ALTER TYPE NotificationType`, índice
   único parcial de `CalendarSyncJob`. Escrever
   `prisma/migrations/<ts>_calendar_sync/migration.sql` à mão; `npx prisma
   generate`. ✅ Verifica: generate limpo; SQL aplica no banco da worktree.
2. **Extração do crypto**: criar `src/lib/crypto/encryption.ts` (+ teste),
   re-export em bank-reconciliation. ✅ `npm run test` verde.
3. **Módulo puro**: `types.ts`, `privacy.ts`, `event-mapping.ts`,
   `sync-planner.ts`, `oauth.ts`, `ics.ts` + todos os testes colocados +
   barrel. ✅ Testes do módulo verdes (nenhuma dependência de framework).
4. **Providers**: interface `CalendarClient`, `google-calendar-client.ts`
   (fetch REST: token refresh, insert/update/delete/list/findByPrivateProp,
   classificação de erros 401/429/5xx) e `google-calendar-mock.ts` (log +
   sucesso, padrão whatsapp-mock; selecionável por `CALENDAR_SYNC_PROVIDER`).
   ✅ Build verde; mock usado em dev.
5. **Queue + processor**: `queue.ts` (`enqueueCalendarSync` com createMany
   skipDuplicates; `flushCalendarSyncAfterResponse` com `after()`),
   `processor.ts` (algoritmo §3.2, retries via `calculateNextRetryDelay`,
   REVOGADA/ERRO + notificação). Adicionar `CALENDAR_SYNC_ERROR` ao
   notification-service. ✅ Teste manual: enfileirar job no banco isolado e
   rodar o processor com mock.
6. **RBAC**: feature `calendar_sync` em types/permissions (+ testes
   atualizados). ✅ `npm run test`.
7. **Rotas de conexão**: connect, callback, calendars, PATCH, DELETE, retry,
   ICS POST/DELETE, GET estado (§3.4) + AuditLog. ✅ Fluxo completo manual com
   `CALENDAR_SYNC_PROVIDER=mock` (callback grava integração; com Google real
   em conta de teste: evento aparece no calendário).
8. **Feed ICS público**: `/api/public/calendar/[token]/route.ts` + rate
   limit. ✅ Assinar a URL no Apple Calendar/validador ICS; privacidade
   respeitada; token regenerado invalida o antigo.
9. **Hooks nos CRUD paths**: §3.6, um por rota (2 linhas), incluindo
   extend-recurrences. ✅ Criar/remarcar/cancelar/excluir appointment e bulk
   cancel refletem no Google (mock loga as chamadas certas; hash evita no-op
   no confirm).
10. **Cron**: `/api/jobs/process-calendar-sync` + entrada no `vercel.json`.
    ✅ `curl` com Bearer CRON_SECRET processa pendências.
11. **UI do perfil**: `CalendarSyncSettings` + `GoogleCalendarCard` +
    `IcsFeedCard` + badge compartilhado + coluna em admin/professionals. ✅
    Fluxo visual completo: conectar → configurar → desconectar; estados
    Erro/Revogada renderizam.
12. **Gates + commit fase 1**: `npx prisma generate && npm run test && npm run
    build`; commit `feat(calendar-sync): outbound Google Calendar push + ICS
    feed`.

**Fase 2 — inbound busy blocks**

13. **busy-blocks.ts** (+ testes) e `freeBusy` no client/mock. ✅ Testes.
14. **Poll job**: `/api/jobs/poll-busy-blocks` + entrada no `vercel.json`;
    re-consent incremental (PATCH `inboundEnabled` → se escopo ausente,
    devolve `{ authUrl }` para re-autorizar com `includeFreeBusyScope`). ✅
    Rodar o job no banco isolado popula BusyBlocks.
15. **Endpoint + overlay**: `/api/calendar-sync/busy-blocks`,
    `BusyBlockOverlay` na timeline/grade, aviso no `CreateAppointmentSheet`.
    ✅ Visual na agenda; agendar por cima mostra aviso e permite salvar.
16. **Integração agendamento-online**: subtrair busy blocks no motor de slots
    (`src/lib/booking`, plano 002) — se o módulo ainda não existir, deixar
    função `overlapsBusy` exportada e registrar a pendência no plano 002. ✅
    Slot público some quando há busy block (ou pendência documentada).
17. **Gates + commit fase 2**: gates completos; commit
    `feat(calendar-sync): inbound busy blocks + agenda overlay`.

---

## 6. Riscos e Questões em Aberto

**Riscos**

- **Verificação do app OAuth no Google**: escopos de Calendar são
  "sensíveis" — produção exige verificação do app (política de privacidade
  publicada, vídeo demo, dias/semanas de prazo) e, sem verificação, limite de
  100 usuários + tela "app não verificado". Mitigação: iniciar a verificação
  cedo, em paralelo ao desenvolvimento; usar test users no início.
- **Frequência de cron na Vercel**: cron de 10/30 min requer plano Pro (Hobby
  só permite execuções diárias). Mitigação principal já no design: o flush
  pós-resposta via `after()` cobre o caminho normal; o cron é varredura. Se o
  plano não permitir, reduzir para horário e aceitar retry mais lento.
- **`after()` em serverless**: execução pós-resposta é best-effort (timeout da
  função). O outbox durável garante que nada se perde — só atrasa até o cron.
- **Quotas Google** (~600 req/min/usuário): bulk grandes (regenerar recorrência
  de 1 ano) podem tomar 429. Mitigação: paralelismo 3, backoff com
  `Retry-After`, jobs por appointment dedupados.
- **LGPD**: mesmo no modo TOTAL, horários de atendimento saem para a Google
  (operador fora do controle da clínica). Mitigação: default máximo de
  privacidade, opt-in individual do profissional, documentação na UI; avaliar
  menção no aviso de privacidade do produto.
- **Vazamento do link ICS**: quem tem a URL lê a agenda (com privacidade
  aplicada). Mitigação: token de 256 bits, regeneração 1-clique, rate limit,
  instrução de não compartilhar.
- **Drift de fuso**: Brasil sem DST desde 2019, mas eventos usam
  `clinic.timezone` + dateTime UTC — robusto a mudanças legais futuras.

**Questões em aberto**

- **Q1 — Escopo freeBusy (fase 2)**: usar o escopo granular
  `calendar.freebusy` (mínimo necessário) ou `calendar.readonly` (necessário
  se quisermos listar nomes dos calendários para os checkboxes)? Proposta:
  `calendar.readonly` apenas quando `inboundEnabled` for ligado (incremental),
  documentando o porquê. Decidir no início da fase 2.
- **Q2 — Watch channels (push) vs polling**: webhooks do Google Calendar
  exigem renovação de canal (cron extra) e endpoint público; polling de 30
  min é suficiente para slot público? Proposta: lançar com polling; medir.
- **Q3 — Gate por plano SaaS**: sincronização entra em todos os planos ou só
  pagos? (Hoje `Plan` só limita `maxProfessionals`.) Decisão de produto;
  o design não bloqueia (checagem futura via `subscription/limits`).
- **Q4 — Limpeza de eventos órfãos**: appointments excluídos enquanto a
  integração estava REVOGADA deixam eventos no Google sem link ativo. Vale um
  job de reconciliação por `privateExtendedProperty`? Proposta: fora do
  escopo; botão de limpeza na desconexão cobre o grosso.
- **Q5 — Sessões de grupo**: cada paciente do grupo é um Appointment no mesmo
  horário → N eventos sobrepostos no Google do profissional. Colapsar em um
  evento por `groupId+scheduledAt` ("Sessão em grupo — {{nomeClinica}}")?
  Proposta: fase 1 colapsa por dedupe no processor (pular appointments cujo
  `groupId+scheduledAt` já tenha link); validar com usuários.
- **Q6 — `Clinic.timezone` vs pino São Paulo**: spec pede pino
  `America/Sao_Paulo`; o campo `clinic.timezone` já existe com esse default.
  Plano usa o campo (equivalente hoje, preparado para multi-fuso).
