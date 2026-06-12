---
title: "feat: Teleconsulta — sala de vídeo integrada para sessões online"
type: feat
status: draft
date: 2026-06-11
slug: teleconsulta
priority: 8
complexity: L
---

# feat: Teleconsulta — sala de vídeo integrada para sessões online

## 1. Contexto de Negócio

### Problema

A Clinica já registra a modalidade de cada consulta (`AppointmentModality.ONLINE | PRESENCIAL`
em `prisma/schema.prisma:35`) e até possui um campo `Appointment.meetingUrl` (linha 585) que
**nunca é exposto na UI**. Na prática, clínicas que atendem online hoje:

1. Criam manualmente um link no Google Meet / Zoom para cada paciente;
2. Colam o link no WhatsApp fora do sistema (sem rastro, sem auditoria);
3. Reenviam o link a cada reagendamento;
4. Não têm como saber se o paciente acessou a sala.

A telepsicologia é permanentemente mainstream desde a autorização do CFP e a
Resolução CFP nº 09/2024 a regulamenta de forma definitiva. **Todo concorrente relevante
empacota sala de vídeo própria**: PsicoManager ("Sala Virtual"), iClinic, Amplimed, Feegow,
Corpora, PsicoPlanner, Allminds e, internacionalmente, SimplePractice, Jane App, Cliniko e
TherapyNotes. A ausência dessa funcionalidade é hoje um critério de desclassificação em
comparativos de compra.

### Solução em uma frase

Toda CONSULTA com modalidade ONLINE ganha uma sala de vídeo embutida, acessível pelo
profissional a partir do card da agenda ("Iniciar teleconsulta") e pelo paciente a partir
de um link HMAC nos lembretes/confirmações — **sem conta para o paciente, sem links
externos, sem nova tabela no banco**.

### Usuários-alvo

| Persona | Necessidade |
|---|---|
| **PROFESSIONAL** | Iniciar a sessão online em 1 clique a partir da agenda; encerrar e marcar FINALIZADO |
| **ADMIN** | Habilitar/desabilitar o recurso para a clínica; iniciar sessões de qualquer profissional (se tiver `agenda_others`) |
| **Paciente** (sem login) | Entrar na sala pelo link do lembrete, em qualquer dispositivo, sem instalar nada |

### Métricas de sucesso

- ≥ 60% das consultas ONLINE com sala iniciada (`telehealthStartedAt` preenchido) em 60 dias;
- Redução de links externos colados manualmente (campo `meetingUrl` usado só como exceção);
- Taxa de acesso do paciente ao link (`AuditLog action=TELECONSULTA_ACESSO_PACIENTE` / consultas ONLINE) ≥ 70%;
- Zero incidentes de acesso indevido a salas (nome de sala não-adivinhável + janela de validade).

### Não-objetivos da v1

- **Gravação de sessões** — evitada deliberadamente (ética CFP + complexidade de consentimento LGPD);
- Contrato de telepsicologia assinado digitalmente (depende da feature futura `assinatura-digital-tcle` — ver §6);
- Chat persistente, compartilhamento de arquivos, fila de espera multi-sala;
- Provider pago (Daily.co etc.) — a interface `VideoProvider` deixa o caminho aberto.

---

## 2. Especificação Funcional

### 2.1 User stories

1. **Como profissional**, quero ver um botão "Iniciar teleconsulta" no card de uma consulta
   ONLINE para abrir a sala embutida no sistema, sem procurar links.
2. **Como profissional**, ao encerrar a chamada quero ser perguntado se desejo marcar a
   consulta como FINALIZADO (reuso da transição de status existente).
3. **Como paciente**, quero receber no lembrete um link `{{videoLink}}` que abre uma página
   de pré-entrada com meu nome preenchido, teste de câmera/microfone e aviso de que a
   sessão não é gravada — sem criar conta.
4. **Como paciente**, se eu entrar antes do profissional, quero ver uma tela de espera que
   me coloca na sala automaticamente quando o profissional iniciar.
5. **Como administrador**, quero habilitar/desabilitar a teleconsulta da clínica em
   Configurações, e quero poder colar um link externo (Zoom/Meet) em uma consulta
   específica quando necessário — esse link substitui a sala embutida no `{{videoLink}}`.
6. **Como membro de grupo terapêutico**, quero receber um link individualizado que me leva
   à **mesma sala** dos demais membros da sessão (correlação de presença por membro no futuro).

### 2.2 Fluxos por papel

#### Profissional (e ADMIN com `agenda_others`)

1. Agenda → card/sheet de uma CONSULTA `modality=ONLINE` (status AGENDADO ou CONFIRMADO)
   mostra o botão **"Iniciar teleconsulta"** (ícone `Video` do lucide).
2. Clique → `POST /api/appointments/[id]/teleconsulta/start` grava `telehealthStartedAt`
   (idempotente) + AuditLog → abre **modal full-screen** com o iframe Jitsi
   (moderador, nome do profissional pré-preenchido).
3. Se a consulta tem `meetingUrl` (link externo colado), o botão vira
   **"Abrir link da reunião"** e abre o link em nova aba (sem modal embutido).
4. Ao sair da chamada (`videoConferenceLeft`/`readyToClose` do iframe), o modal mostra
   o prompt: **"Deseja marcar esta consulta como finalizada?"** → `PATCH
   /api/appointments/[id]/status` com `FINALIZADO` (lógica de transição existente em
   `src/lib/appointments/status-transitions.ts`). Botões: "Marcar como finalizada" /
   "Agora não".
5. Sessão de grupo ONLINE: o sheet da sessão (`GroupSessionSheet`) mostra o mesmo botão;
   todos os membros caem na mesma sala (ver §3.2 — chave da sala).

#### Paciente (público, sem autenticação)

1. Lembrete/confirmação (WhatsApp/e-mail) contém
   `{{videoLink}}` → `https://app.../teleconsulta/<token>`.
2. Página `/teleconsulta/[token]`:
   - **Token inválido** → "Link de teleconsulta inválido. Confira o link recebido ou entre em contato com a clínica."
   - **Consulta cancelada** → "Esta sessão foi cancelada. Entre em contato com a clínica para reagendar."
   - **Fora da janela (cedo demais)** → "Sua teleconsulta está agendada para **{DD/MM/YYYY} às {HH:mm}**. A sala abre 15 minutos antes do horário."
   - **Fora da janela (tarde demais) ou FINALIZADO** → "Esta sessão já foi encerrada. Em caso de dúvida, entre em contato com a clínica."
   - **Teleconsulta desabilitada na clínica / não configurada** → "A teleconsulta não está disponível. Entre em contato com a clínica."
   - **Dentro da janela** → tela de pré-entrada.
3. **Pré-entrada**: nome do paciente pré-preenchido (editável), preview de câmera/microfone
   (prejoin nativo do Jitsi), avisos fixos:
   - "Esta sessão **não é gravada**."
   - "Ao entrar, você concorda com o atendimento por videochamada. Seus dados são tratados conforme a LGPD."
   Botão: **"Entrar na sessão"**.
4. **Sala de espera**: se `telehealthStartedAt` ainda é nulo, mostra
   "Aguardando o(a) profissional entrar na sala..." e faz polling (10s) em
   `GET /api/public/teleconsulta/[token]/status` até `professionalJoined=true`; então
   monta o iframe automaticamente.
5. **Falha de conexão**: "Não foi possível conectar. Verifique sua internet e tente
   novamente." + botão "Tentar novamente" + telefone da clínica quando cadastrado
   ("Precisa de ajuda? Ligue para {telefone}").

#### ADMIN — configurações

- Configurações → aba **Agendamento** (`SchedulingTab.tsx`) ganha a seção **"Teleconsulta"**:
  - Toggle **"Teleconsulta integrada"** — descrição: "Gera uma sala de vídeo para consultas
    online e inclui o link nos lembretes e confirmações." (campo `Clinic.telehealthEnabled`).
  - Texto auxiliar quando a plataforma não tem domínio de vídeo configurado (env ausente):
    "Indisponível no momento — fale com o suporte." (toggle desabilitado).

### 2.3 Telas (layout)

| Tela | Descrição |
|---|---|
| **Modal do profissional** (`TeleconsultaModal`) | Overlay full-screen (z-index acima do Sheet), header fino com nome do paciente (`patient?.name ?? title`), horário `HH:mm`, botão fechar. Corpo = iframe Jitsi 100%. Footer aparece só no pós-chamada com o prompt de FINALIZADO. |
| **`/teleconsulta/[token]` — pré-entrada** | Card centralizado, logo "Teleconsulta", nome da clínica, data/hora `DD/MM/YYYY HH:mm`, nome do profissional, avisos LGPD/não-gravação, botão primário "Entrar na sessão". Mobile-first (pacientes usam celular). |
| **`/teleconsulta/[token]` — espera** | Spinner + "Aguardando o(a) profissional entrar na sala..." + data/hora. |
| **`/teleconsulta/[token]` — erro/fora da janela** | Card com ícone (`CalendarClock`/`XCircle`), mensagem pt-BR conforme estado, telefone da clínica quando houver. |
| **Card da agenda** | `AppointmentCard`/`CalendarEntrySheet` ganham o botão "Iniciar teleconsulta" (apenas ONLINE + CONSULTA + status ativo + janela aberta para destaque; fora da janela o botão fica disponível no sheet, com tooltip "A sala abre 15 minutos antes"). |
| **Editor de consulta** | `AppointmentEditor`, seção modalidade ONLINE: campo opcional **"Link externo (Zoom/Meet)"** (grava `meetingUrl`) + ação **"Copiar link do paciente"** (copia a URL `/teleconsulta/<token>` via toast Sonner "Link copiado"). |

### 2.4 Regras de negócio

| # | Regra |
|---|---|
| RN-01 | Sala embutida existe apenas para `type=CONSULTA` (individual ou de grupo) com `modality=ONLINE`. `TAREFA/REUNIAO/LEMBRETE/NOTA` nunca têm sala. |
| RN-02 | Nome da sala é derivado por HMAC de uma **chave da sala** + `AUTH_SECRET` — determinístico, não-adivinhável, **sem PII** (nunca nome do paciente). |
| RN-03 | Janela de validade do link do paciente: de **15 min antes de `scheduledAt`** até **`endAt` + 30 min**. A janela é calculada **na hora da requisição** a partir do registro vivo — reagendar move a janela automaticamente sem trocar o link. |
| RN-04 | Token do paciente não embute expiração; a validade vem do estado vivo da consulta (espelha o comportamento de bloqueio de sessões de grupo canceladas). Cancelamento (`CANCELADO_*`) invalida o acesso imediatamente. |
| RN-05 | Identidade da sala é estável por consulta (reagendamento NÃO regenera a sala; só a janela). |
| RN-06 | `meetingUrl` preenchido ⇒ `{{videoLink}}` = `meetingUrl` (link externo tem prioridade sobre a sala embutida). |
| RN-07 | `{{videoLink}}` só é injetado em notificações de consultas ONLINE com teleconsulta efetiva (toggle da clínica + plataforma configurada, ou `meetingUrl` presente). Linhas de template com `{{videoLink}}` não resolvido são **removidas** da mensagem renderizada. |
| RN-08 | Sessões de grupo: **uma sala por sessão** (chave = `sessionGroupId`, ou `groupId + scheduledAt` para sessões recorrentes); cada membro recebe token individual (cada membro já tem sua própria linha `Appointment`). |
| RN-09 | Dois dispositivos com o mesmo token podem entrar simultaneamente (casal no celular + notebook) — token é stateless, sem lock de sessão. |
| RN-10 | Sem gravação na v1 — config do provider desabilita gravação/transmissão. |
| RN-11 | Todo acesso de paciente à página de entrada e todo início pelo profissional geram `AuditLog` (clinic-scoped). Polling não gera audit. |
| RN-12 | Toggle por clínica (`Clinic.telehealthEnabled`); plataforma só ativa quando `TELEHEALTH_JITSI_DOMAIN` está configurado no ambiente. |
| RN-13 | Profissional sem `agenda_others` só inicia salas das próprias consultas (titular ou em `additionalProfessionals`). |

### 2.5 Edge cases

- **Reagendamento**: janela recalculada da consulta viva (RN-03); link antigo continua válido.
- **Cancelamento**: estado `CANCELLED` no resolver → página mostra mensagem de cancelada; iframe nunca monta.
- **Modalidade muda ONLINE → PRESENCIAL**: resolver retorna `NOT_ONLINE` → "Esta consulta será presencial. Em caso de dúvida, entre em contato com a clínica."
- **Consulta FINALIZADO dentro da janela**: tratada como encerrada (`ENDED`).
- **`patient` nulo**: impossível para CONSULTA (validação existente), mas todo o código usa `patient?.name` (gotcha do projeto) com fallback `"Paciente"` no displayName.
- **Clínica desativa o toggle com links já enviados**: endpoint público responde `DISABLED` — mensagem orienta contato com a clínica.
- **Profissional nunca inicia**: paciente fica na tela de espera até o fim da janela; depois, estado `ENDED`.
- **Domínio Jitsi público com lobby/login de moderador** (meet.jit.si exige login do moderador desde 2023): risco documentado em §6; domínio é configurável (self-hosted/JaaS).
- **Duplo clique em "Iniciar"**: `POST .../start` é idempotente (não sobrescreve `telehealthStartedAt` existente).

### 2.6 Copy pt-BR (chaves principais)

| Contexto | Texto |
|---|---|
| Botão profissional | "Iniciar teleconsulta" / "Abrir link da reunião" (externo) |
| Botão paciente | "Entrar na sessão" |
| Espera | "Aguardando o(a) profissional entrar na sala..." |
| Cedo demais | "Sua teleconsulta está agendada para {date} às {time}. A sala abre 15 minutos antes do horário." |
| Encerrada | "Esta sessão já foi encerrada. Em caso de dúvida, entre em contato com a clínica." |
| Cancelada | "Esta sessão foi cancelada. Entre em contato com a clínica para reagendar." |
| Inválido | "Link de teleconsulta inválido. Confira o link recebido ou entre em contato com a clínica." |
| Indisponível | "A teleconsulta não está disponível. Entre em contato com a clínica." |
| Não-gravação | "Esta sessão não é gravada." |
| LGPD | "Ao entrar, você concorda com o atendimento por videochamada. Seus dados são tratados conforme a LGPD." |
| Erro de conexão | "Não foi possível conectar. Verifique sua internet e tente novamente." + "Precisa de ajuda? Ligue para {telefone}" |
| Pós-chamada | "Deseja marcar esta consulta como finalizada?" / "Marcar como finalizada" / "Agora não" |
| Template (linha nova) | "💻 Teleconsulta — acesse no horário: {{videoLink}}" |
| Settings | "Teleconsulta integrada" — "Gera uma sala de vídeo para consultas online e inclui o link nos lembretes e confirmações." |

---

## 3. Design Técnico

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

**Sem novas tabelas.** Dois campos aditivos:

```prisma
model Clinic {
  // ... campos existentes ...
  // Per-clinic toggle for the built-in telehealth room. Effective only when
  // the platform has TELEHEALTH_JITSI_DOMAIN configured (see src/lib/telehealth/config.ts).
  telehealthEnabled Boolean @default(true)
}

model Appointment {
  // ... campos existentes (meetingUrl já existe e será reutilizado como link externo) ...
  // Set when the professional opens the built-in room ("Iniciar teleconsulta").
  // Drives the patient waiting screen and serves as a coarse attendance signal.
  telehealthStartedAt DateTime?
}
```

**Migração** (autorada offline — NUNCA `prisma db push` / `prisma migrate dev`):

`prisma/migrations/20260611000000_add_telehealth_fields/migration.sql`

```sql
ALTER TABLE "Clinic" ADD COLUMN "telehealthEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Appointment" ADD COLUMN "telehealthStartedAt" TIMESTAMP(3);
```

Sem índices novos: `telehealthStartedAt` só é lido por PK; `telehealthEnabled` só via
`clinic.findUnique`. Deploy aplica via `prisma migrate deploy` no `vercel-build`.

> Nota multi-tenant: nenhum modelo novo, logo nenhum `clinicId` novo. Toda query de
> Appointment continua obrigatoriamente filtrada por `clinicId` no handler (ver §3.4).

### 3.2 Novo módulo de domínio: `src/lib/telehealth/`

Segue o padrão do módulo `notifications` (interface de provider + implementação mock +
funções puras com testes colocados). Todos os arquivos < 200 linhas.

```
src/lib/telehealth/
├── index.ts                 # barrel
├── types.ts                 # tipos + interface VideoProvider
├── config.ts                # leitura de env (única fronteira impura)
├── room-names.ts            # derivação HMAC do nome da sala (puro)
├── video-tokens.ts          # assinatura/verificação do token do paciente (puro)
├── join-window.ts           # janela de validade + máquina de estados (puro)
├── video-link.ts            # construção do {{videoLink}} + strip de linhas não resolvidas (puro)
├── providers/
│   ├── jitsi.ts             # provider default (URLs + opções do iframe)
│   └── mock.ts              # provider para dev/teste
├── *.test.ts                # colocados (ver §4)
```

#### `types.ts`

```typescript
export interface TelehealthConfig {
  provider: "jitsi" | "mock"
  jitsiDomain: string | null      // ex.: "meet.suaclinica.com.br" ou "8x8.vc/<tenant>"
  configured: boolean             // provider utilizável (domínio presente p/ jitsi)
}

export interface RoomDescriptor {
  roomName: string                // HMAC-derivado, sem PII
}

export interface JoinInfo {
  provider: "jitsi" | "mock"
  domain: string
  roomName: string
  displayName: string
  isModerator: boolean
  subject: string                 // título da sala mostrado no header do Jitsi (sem PII: "Teleconsulta")
}

export interface VideoProvider {
  id: "jitsi" | "mock"
  /** Limite de participantes documentado do provider (grupos — RN-08) */
  maxParticipants: number
  professionalJoinInfo(room: RoomDescriptor, displayName: string): JoinInfo
  patientJoinInfo(room: RoomDescriptor, displayName: string): JoinInfo
}

export type JoinState =
  | { kind: "OK" }
  | { kind: "TOO_EARLY"; opensAt: Date; scheduledAt: Date }
  | { kind: "ENDED" }
  | { kind: "CANCELLED" }
  | { kind: "NOT_ONLINE" }
  | { kind: "DISABLED" }
  | { kind: "INVALID" }
```

#### `room-names.ts` (puro)

```typescript
/** Chave estável da sala: sessões de grupo compartilham sala; individuais são por consulta. */
export function resolveRoomKey(appointment: {
  id: string
  groupId: string | null
  sessionGroupId: string | null
  scheduledAt: Date
}): string
// groupId       → `group:${groupId}:${scheduledAt.toISOString()}`
// sessionGroupId → `session:${sessionGroupId}`
// senão          → `appt:${appointment.id}`

/** HMAC-SHA256(roomKey, secret) truncado p/ 20 hex chars, prefixo "clinica-". Sem PII. */
export function deriveRoomName(roomKey: string, secret: string): string
```

#### `video-tokens.ts` (puro — mesmo padrão de `appointment-links.ts`)

```typescript
/** sig = HMAC-SHA256(`${appointmentId}:video`, AUTH_SECRET). Sem expiração embutida (RN-03/04). */
export function signVideoToken(appointmentId: string, secret: string): string

/** Token opaco da URL pública: `${appointmentId}.${sig}` (cuid não contém "."). */
export function buildVideoToken(appointmentId: string, secret: string): string
export function parseVideoToken(token: string): { appointmentId: string; sig: string } | null
export function verifyVideoToken(appointmentId: string, sig: string, secret: string): boolean
```

> Comparação de assinaturas com `crypto.timingSafeEqual` (melhoria sobre o `!==` de
> `appointment-links.ts`; não alterar o módulo antigo neste plano).

#### `join-window.ts` (puro)

```typescript
export const JOIN_WINDOW_BEFORE_MIN = 15
export const JOIN_WINDOW_GRACE_AFTER_MIN = 30

export function computeJoinWindow(scheduledAt: Date, endAt: Date): { opensAt: Date; closesAt: Date }

/** Máquina de estados central — usada pelo endpoint público e pelo botão do profissional. */
export function resolveJoinState(
  appointment: {
    type: string; modality: string | null; status: string
    scheduledAt: Date; endAt: Date
  },
  clinic: { telehealthEnabled: boolean },
  config: { configured: boolean },
  now: Date
): JoinState
// Ordem de avaliação: DISABLED → NOT_ONLINE (type!==CONSULTA ou modality!==ONLINE)
// → CANCELLED (status CANCELADO_*) → ENDED (FINALIZADO ou now > closesAt)
// → TOO_EARLY (now < opensAt) → OK
```

#### `video-link.ts` (puro)

```typescript
/** URL pública do paciente. */
export function buildPatientVideoUrl(baseUrl: string, appointmentId: string, secret: string): string
// `${baseUrl}/teleconsulta/${buildVideoToken(...)}`

/** Decide o valor de {{videoLink}} para notificações (RN-06/07). Retorna null quando não aplicável. */
export function resolveVideoLinkForNotification(args: {
  appointment: { id: string; type: string; modality: string | null; meetingUrl: string | null }
  clinic: { telehealthEnabled: boolean }
  config: { configured: boolean }
  baseUrl: string
  secret: string
}): string | null

/** Remove linhas que ainda contenham "{{videoLink}}" após renderização (RN-07). */
export function stripUnresolvedVideoLines(content: string): string
```

#### `config.ts` (única fronteira impura — lê env)

```typescript
export function getTelehealthConfig(): TelehealthConfig
// provider: TELEHEALTH_PROVIDER ?? (NODE_ENV === "test" ? "mock" : "jitsi")
// jitsiDomain: TELEHEALTH_JITSI_DOMAIN ?? null
// configured: provider === "mock" || jitsiDomain != null
export function getVideoProvider(config: TelehealthConfig): VideoProvider
```

#### `providers/jitsi.ts`

`maxParticipants: 25` (limite prático recomendado para vídeo simultâneo; documentar no
JSDoc que instâncias self-hosted suportam mais). `professionalJoinInfo`/`patientJoinInfo`
retornam `JoinInfo` com `domain` do config. As opções do iframe (sem gravação — RN-10)
ficam no componente cliente compartilhado (§3.5): `prejoinConfig.enabled: true`,
`disableDeepLinking: true`, toolbar sem `recording`/`livestreaming`.

#### `providers/mock.ts`

Retorna `JoinInfo` determinístico (`domain: "mock.local"`) — usado em testes e dev sem rede.

### 3.3 Notificações — variável `{{videoLink}}`

Arquivos alterados:

1. **`src/lib/notifications/templates.ts`**
   - `TemplateVariables` ganha `videoLink?: string`;
   - `TEMPLATE_VARIABLES` ganha `{ key: "videoLink", label: "Link da Teleconsulta", example: "https://..." }`;
   - `DEFAULT_TEMPLATES` de `APPOINTMENT_CONFIRMATION` e `APPOINTMENT_REMINDER`
     (WhatsApp e e-mail) ganham a linha `💻 Teleconsulta — acesse no horário: {{videoLink}}`
     logo após a linha de modalidade;
   - `previewTemplate` inclui `videoLink` nos sample variables.

2. **`src/lib/jobs/send-reminders.ts`**
   - `buildReminderTemplateVariables(...)` ganha parâmetro final opcional
     `videoLink?: string | null` — incluído no record apenas quando string.

3. **Pontos de envio** (todos passam a: resolver `videoLink` via
   `resolveVideoLinkForNotification` e aplicar `stripUnresolvedVideoLines` após
   `renderTemplate`):
   - `src/app/api/jobs/send-reminders/route.ts` (cron de lembretes — o `include` da clínica
     passa a selecionar `telehealthEnabled`);
   - `src/app/api/appointments/route.ts` (confirmação no create — arquivo já está em 52,8 KB:
     **não** adicionar lógica inline; apenas 2 chamadas às funções do módulo);
   - `src/app/api/appointments/[id]/resend-confirmation/route.ts`;
   - `src/app/api/groups/[groupId]/sessions/route.ts` (cada membro recebe token do **seu**
     `appointmentId` — RN-08; a sala compartilhada é resolvida por `resolveRoomKey`).

> O par render+strip deve ser encapsulado num helper único do módulo
> (`renderWithVideoLink(content, variables)` em `video-link.ts`) para não duplicar o
> padrão em 4 arquivos.

### 3.4 Rotas de API

#### Públicas (`src/app/api/public/` — sem auth, rate-limited, espelham `confirm/route.ts`)

**`GET /api/public/teleconsulta/[token]/route.ts`** — resolução inicial (auditada)

- Rate limit: `RATE_LIMIT_CONFIGS.publicApi` por IP (`checkRateLimit("teleconsulta:" + ip)`).
- `parseVideoToken` → 400 `{ error: "Link de teleconsulta inválido..." }` se malformado;
- `prisma.appointment.findUnique({ where: { id }, include: { clinic: {...}, patient: { select: { name: true } }, professionalProfile: { include: { user: { select: { name: true } } } } } })`
  — busca por PK é segura aqui (rota pública sem tenant na sessão); o tenant scoping é
  garantido pelo HMAC: só quem recebeu o link assinado chega ao registro;
- `verifyVideoToken` → 400 se assinatura inválida (não revelar existência da consulta);
- `resolveJoinState(...)` → resposta única:

```typescript
// 200
{
  state: "OK" | "TOO_EARLY" | "ENDED" | "CANCELLED" | "NOT_ONLINE" | "DISABLED",
  scheduledAt?: string,          // ISO — para a mensagem de "cedo demais"
  patientFirstName?: string,     // só primeiro nome (minimiza PII), patient?.name (gotcha nulo)
  professionalName?: string,
  clinicName?: string,
  clinicPhone?: string | null,
  professionalJoined?: boolean,  // telehealthStartedAt != null
  join?: JoinInfo                // presente apenas quando state === "OK"
}
```

- Auditoria (RN-11): `prisma.auditLog.create({ clinicId: appointment.clinicId, userId: null, action: "TELECONSULTA_ACESSO_PACIENTE", entityType: "Appointment", entityId, ipAddress, userAgent })` — apenas neste endpoint inicial.

**`GET /api/public/teleconsulta/[token]/status/route.ts`** — polling leve (NÃO auditado)

- Mesma verificação de token + rate limit; retorna somente
  `{ state, professionalJoined }`. Header `Cache-Control: no-store`.

#### Autenticadas (sempre `withFeatureAuth` de `src/lib/api`)

**Decisão RBAC**: teleconsulta **não** introduz feature nova no mapa de permissões —
é uma capacidade da agenda. Gate: `agenda_own` + checagem de titularidade no handler;
quem não é titular/participante precisa de `agenda_others`. O toggle da clínica usa a
feature existente `clinic_settings` (rota `PATCH /api/admin/settings`). Isso evita inflar
a matriz de permissões para uma ação que não tem dado próprio. (Se no futuro a
teleconsulta ganhar dados próprios — gravações, relatórios — aí sim registrar feature
`telehealth` em `src/lib/rbac/types.ts` + `ROLE_DEFAULTS`.)

**`GET /api/appointments/[id]/teleconsulta/route.ts`** — join info do profissional

```typescript
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (req, { user }, params) => { ... }
)
```

- **Tenant scoping obrigatório**: `prisma.appointment.findFirst({ where: { id: params.id, clinicId: user.clinicId }, include: {...} })` → 404 se não achar (não vazar existência);
- Titularidade: se `appointment.professionalProfileId !== user.professionalProfileId` e o
  usuário não está em `additionalProfessionals`, exigir
  `meetsMinAccess(user.permissions.agenda_others, "READ")` → senão 403;
- Resposta: `{ state, join?: JoinInfo, externalUrl?: string, patientVideoUrl: string }`
  (`patientVideoUrl` alimenta a ação "Copiar link do paciente"; `externalUrl = meetingUrl`).
- Para o profissional, `TOO_EARLY` não bloqueia (ele pode abrir a sala antes); o estado é
  retornado apenas para a UI decidir o destaque do botão.

**`POST /api/appointments/[id]/teleconsulta/start/route.ts`** — iniciar sala

```typescript
export const POST = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }, params) => { ... }
)
```

- Mesmo scoping/titularidade (WRITE em `agenda_others` para consultas de terceiros);
- Valida `resolveJoinState` ∉ {CANCELLED, NOT_ONLINE, DISABLED, INVALID} → 422 com mensagem pt-BR;
- `updateMany({ where: { id, clinicId: user.clinicId, telehealthStartedAt: null }, data: { telehealthStartedAt: now } })` — idempotente;
- AuditLog `action: "TELECONSULTA_INICIADA"`, `entityType: "Appointment"`, `userId: user.id`;
- Retorna o mesmo shape do GET (com `join` de moderador).
- Handler fino (< 50 linhas de lógica): toda decisão vem de `resolveJoinState`/provider.

**`PATCH /api/admin/settings/route.ts`** (existente) — adicionar ao zod schema:
`telehealthEnabled: z.boolean().optional()` e incluir o campo no `data` do update e no
shape do GET. (Auth existente: `withFeatureAuth({ feature: "clinic_settings", ... })`.)

> Body FK validation: nenhuma rota nova aceita ids estrangeiros no body (o id vem do
> path e é validado com `clinicId` na própria query — padrão de self-scoping do projeto).

### 3.5 UI — componentes e páginas

**Novos:**

| Arquivo | Papel |
|---|---|
| `src/shared/components/telehealth/JitsiRoom.tsx` | Wrapper cliente do iframe Jitsi (`external_api.js` carregado via `useMountEffect` — regra de useEffect nº 4; cleanup `api.dispose()`). Props: `join: JoinInfo`, `onLeft()`, `onFailed()`. Reutilizado pelo modal do profissional e pela página pública. Provider `mock` renderiza placeholder estático. |
| `src/app/agenda/components/TeleconsultaButton.tsx` | Botão "Iniciar teleconsulta"/"Abrir link da reunião" (decisão por props: `modality`, `type`, `status`, `meetingUrl`). |
| `src/app/agenda/components/TeleconsultaModal.tsx` | Modal full-screen; chama `POST .../start`; monta `JitsiRoom`; no `onLeft` mostra o prompt de FINALIZADO (chama `PATCH /api/appointments/[id]/status`, toasts Sonner). Estados derivados, sem `useEffect` de sincronização (regra nº 1); reset por `key={appointmentId}` (regra nº 5). |
| `src/app/teleconsulta/[token]/page.tsx` | Página pública (client component fino que delega à `TeleconsultaFlow`). |
| `src/app/teleconsulta/components/TeleconsultaFlow.tsx` | Orquestra estados: carrega `GET /api/public/teleconsulta/[token]` (fetch disparado em `useMountEffect`), decide tela. Polling de espera com `setInterval` em `useMountEffect` (padrão `usePendingIntakeCount`). |
| `src/app/teleconsulta/components/PreJoinScreen.tsx` | Pré-entrada (nome editável, avisos LGPD/não-gravação, botão "Entrar na sessão"). |
| `src/app/teleconsulta/components/WaitingScreen.tsx` | Tela de espera com polling. |
| `src/app/teleconsulta/components/JoinErrorScreen.tsx` | Estados TOO_EARLY/ENDED/CANCELLED/etc. com copy pt-BR de §2.6 (datas `DD/MM/YYYY`, horas `HH:mm`, locale `pt-BR`). |

**Alterados:**

| Arquivo | Mudança |
|---|---|
| `src/app/agenda/components/CalendarEntrySheet.tsx` | Renderiza `<TeleconsultaButton>` + `<TeleconsultaModal>` para CONSULTA ONLINE. Arquivo já tem ~30 KB — adicionar **apenas** a composição dos novos componentes (zero lógica inline). |
| `src/app/agenda/components/AppointmentCard.tsx` | Badge "Online" existente (linha ~127) vira gatilho visual: ícone `Video` com destaque quando a janela está aberta (cálculo client-side com `computeJoinWindow` importado do módulo). |
| `src/app/agenda/components/GroupSessionSheet.tsx` | Mesmo botão para sessões de grupo ONLINE. |
| `src/app/agenda/components/AppointmentEditor.tsx` | Campo "Link externo (Zoom/Meet)" (react-hook-form + zod `z.string().url().nullable()`, grava `meetingUrl`) + ação "Copiar link do paciente". |
| `src/app/admin/settings/components/SchedulingTab.tsx` | Seção "Teleconsulta" com o toggle. |
| `src/app/api/appointments/[id]/route.ts` (PATCH existente) | Aceitar `meetingUrl` no zod do update (se ainda não aceitar). |

**App shell**: conferir que `/teleconsulta` está na lista de rotas públicas do
`src/shared/components/ui/app-shell.tsx` (mesmo tratamento de `/confirm`, `/cancel`,
`/intake/[slug]`) para não montar nav/polling autenticado.

### 3.6 Pontos de integração

- **Notificações**: §3.3 (variável + 4 pontos de envio). Nenhum `NotificationType` novo.
- **Cron jobs**: nenhum job novo em `vercel.json`. O `send-reminders` existente passa a injetar `{{videoLink}}`.
- **RBAC**: nenhuma feature nova (decisão documentada em §3.4).
- **Audit logging**: ações novas `TELECONSULTA_INICIADA` e `TELECONSULTA_ACESSO_PACIENTE`
  (entityType `"Appointment"`). Adicionar labels pt-BR em `src/lib/audit/` (field-labels/action labels) se o mapa de ações for exibido na UI de auditoria.
- **Subscription**: rotas autenticadas já herdam o bloqueio read-only de `withFeatureAuth`
  (mutações bloqueadas com assinatura inativa). Plan gating fino (por plano Stripe) fica
  para depois — o modelo `Plan` não tem flags de feature hoje (§6).
- **Env vars** (documentar em `.env.example`): `TELEHEALTH_PROVIDER` (`jitsi`|`mock`),
  `TELEHEALTH_JITSI_DOMAIN` (ex.: `meet.suaclinica.com.br`). Reusa `AUTH_SECRET` (HMAC)
  e `NEXT_PUBLIC_APP_URL` (links).

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`. Enums Prisma como
string literal (`"ONLINE"`, `"CONSULTA"`, `"CANCELADO_ACORDADO"`). Tempo com
`vi.useFakeTimers()`/`vi.useRealTimers()`.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/telehealth/room-names.test.ts` | Determinismo (mesma entrada ⇒ mesmo nome); chaves distintas ⇒ nomes distintos; sem PII (nome ∉ entrada, formato `clinica-[0-9a-f]{20}`); `resolveRoomKey`: grupo recorrente compartilha por `groupId+scheduledAt`, one-off por `sessionGroupId`, individual por `appointmentId`; mudança de secret muda o nome. |
| `src/lib/telehealth/video-tokens.test.ts` | round-trip sign→build→parse→verify; sig adulterada falha; token malformado (`sem ponto`, vazio, ponto duplo) ⇒ `parse` null; token de outro `appointmentId` falha; estabilidade (token independe de `scheduledAt` — RN-03). |
| `src/lib/telehealth/join-window.test.ts` | Janela abre exatamente 15 min antes e fecha `endAt`+30 min; `resolveJoinState`: TOO_EARLY antes da janela; OK dentro; ENDED depois e quando FINALIZADO; CANCELLED para os 3 status `CANCELADO_*`; NOT_ONLINE para PRESENCIAL/modality null/type TAREFA; DISABLED quando toggle off ou config não configurada; **reagendamento**: mover `scheduledAt` move a janela com o mesmo token; precedência DISABLED > NOT_ONLINE > CANCELLED > ENDED > TOO_EARLY. |
| `src/lib/telehealth/video-link.test.ts` | `buildPatientVideoUrl` monta `/teleconsulta/<token>`; `resolveVideoLinkForNotification`: null p/ PRESENCIAL, null p/ toggle off, null p/ não configurado **sem** `meetingUrl`, `meetingUrl` tem prioridade (RN-06), URL embutida p/ ONLINE habilitado; `stripUnresolvedVideoLines` remove a linha inteira com `{{videoLink}}` e preserva o resto (inclusive linhas vazias adjacentes corretas); `renderWithVideoLink` integra render + strip. |
| `src/lib/telehealth/providers/jitsi.test.ts` | `professionalJoinInfo.isModerator === true` / paciente `false`; domain vem do config; `maxParticipants` documentado; roomName repassado intacto. |
| `src/lib/telehealth/providers/mock.test.ts` | Shape determinístico; `domain: "mock.local"`. |
| `src/lib/telehealth/config.test.ts` | `configured=false` sem domínio com provider jitsi; `mock` sempre configured; default por NODE_ENV. (Manipular `process.env` com save/restore por teste.) |
| `src/lib/notifications/templates.test.ts` (estender) | `renderTemplate` substitui `videoLink`; templates default contêm `{{videoLink}}` em CONFIRMATION/REMINDER (ambos canais); `previewTemplate` resolve a variável. |
| `src/lib/jobs/send-reminders.test.ts` (estender) | `buildReminderTemplateVariables` inclui `videoLink` quando passado e omite quando null/undefined (RN-07 — a linha será removida pelo strip). |
| `src/app/api/public/teleconsulta/[token]/route.test.ts` | (padrão do `send-reminders/route.test.ts`, com mock do Prisma) token inválido ⇒ 400 sem tocar o banco; sig errada ⇒ 400; estados TOO_EARLY/CANCELLED/OK no shape de resposta; `join` presente só em OK; auditLog criado com `clinicId` da consulta; rate limit 429; `patient` nulo não explode (optional chaining). |

Cobertura mínima de UI fica para smoke manual (Etapa 10) — o projeto não tem harness de
testes de componente hoje; não introduzir um neste plano.

---

## 5. Etapas de Implementação

Pré-requisito: `bash scripts/new-feature.sh teleconsulta` (worktree + DB isolados — padrão
do projeto) e trabalhar em `../clinica-teleconsulta`.

Cada etapa termina com `npx prisma generate && npm run test && npm run build` verdes.

1. **Schema + migração**
   - Editar `prisma/schema.prisma` (§3.1); criar `prisma/migrations/20260611000000_add_telehealth_fields/migration.sql` manualmente (SQL de §3.1);
   - Aplicar localmente com `npx prisma migrate deploy` (no banco isolado do worktree — nunca produção, nunca `db push`);
   - Verificar: `npx prisma generate` compila; `npm run build` verde.

2. **Módulo `src/lib/telehealth/` — núcleo puro**
   - `types.ts`, `room-names.ts`, `video-tokens.ts`, `join-window.ts`, `video-link.ts` + testes colocados + `index.ts`;
   - Verificar: `npx vitest run src/lib/telehealth/` verde; nenhum arquivo > 200 linhas.

3. **Providers + config**
   - `config.ts`, `providers/jitsi.ts`, `providers/mock.ts` + testes; `.env.example` com `TELEHEALTH_PROVIDER`/`TELEHEALTH_JITSI_DOMAIN`;
   - Verificar: testes do módulo verdes.

4. **Templates de notificação**
   - `templates.ts` (variável + defaults + preview) e `send-reminders.ts` (param novo) + testes estendidos;
   - Verificar: `npx vitest run src/lib/notifications/ src/lib/jobs/` verde.

5. **Injeção nos 4 pontos de envio** (§3.3)
   - `send-reminders/route.ts`, `appointments/route.ts` (create), `resend-confirmation/route.ts`, `groups/[groupId]/sessions/route.ts` usando `resolveVideoLinkForNotification` + `renderWithVideoLink`;
   - Verificar: `npm run test` total verde (testes de rota existentes não regridem); inspecionar uma mensagem renderizada no log do provider mock de WhatsApp em dev.

6. **Rotas públicas**
   - `GET /api/public/teleconsulta/[token]` + `/status` (rate limit, audit, shapes de §3.4) + `route.test.ts`;
   - Verificar: testes da rota verdes; `curl` manual com token gerado via script Node one-liner.

7. **Página pública `/teleconsulta/[token]`**
   - `JitsiRoom.tsx` compartilhado + `TeleconsultaFlow` + telas (PreJoin/Waiting/JoinError); registrar rota pública no `app-shell.tsx`;
   - Verificar: dev server — token válido mostra pré-entrada; consulta cancelada mostra mensagem; fora da janela mostra data/hora `DD/MM/YYYY HH:mm`.

8. **Rotas autenticadas do profissional**
   - `GET .../teleconsulta` + `POST .../teleconsulta/start` (scoping por `clinicId`, titularidade vs `agenda_others`, idempotência, audit);
   - Verificar: PROFESSIONAL não-titular sem `agenda_others` recebe 403; duplo POST não altera `telehealthStartedAt`.

9. **UI da agenda + settings**
   - `TeleconsultaButton`/`TeleconsultaModal`, integração em `CalendarEntrySheet`/`AppointmentCard`/`GroupSessionSheet`, campo `meetingUrl` + "Copiar link do paciente" no `AppointmentEditor`, toggle em `SchedulingTab` + zod no `PATCH /api/admin/settings`;
   - Verificar: fluxo ponta-a-ponta em dev com `TELEHEALTH_PROVIDER=mock` — iniciar → paciente em outra aba anônima sai da espera → encerrar → prompt FINALIZADO transiciona o status.

10. **Gates finais + commit**
    - `npx prisma generate && npm run test && npm run build` — todos verdes (regra do projeto: build antes de commit);
    - Smoke manual: lembrete renderizado para consulta PRESENCIAL **não** contém linha de teleconsulta; ONLINE contém o link; clínica com toggle off não injeta link e endpoint público responde DISABLED;
    - Commit local (sem push): `feat(teleconsulta): integrated video room for online sessions` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## 6. Riscos e Questões em Aberto

### Riscos

| Risco | Mitigação |
|---|---|
| **meet.jit.si público exige login de moderador** (desde ago/2023) e exibe branding/limites — sala "quebrada" se usado como default. | `TELEHEALTH_JITSI_DOMAIN` é obrigatório para `configured=true`; recomendação operacional: instância self-hosted (docker no Hetzner/Fly) ou JaaS (8x8.vc). Sem domínio, o recurso fica oculto (toggle desabilitado com aviso). Decisão de infra é pré-lançamento, não bloqueia o código. |
| Qualidade de chamada fora do nosso controle (rede do paciente). | Tela de erro com retry + telefone da clínica (RN da §2.5); P2P de 2 participantes do Jitsi reduz dependência de servidor. |
| Link encaminhado a terceiros (token é portador). | Sem PII no payload da página além do primeiro nome; janela curta de validade; sala morre com cancelamento; AuditLog de cada acesso com IP/user-agent. Aceitável — mesmo trade-off dos links de confirmar/cancelar. |
| `appointments/route.ts` (52,8 KB) e `CalendarEntrySheet.tsx` (29,7 KB) já violam o limite de tamanho. | Este plano adiciona apenas chamadas de 1-2 linhas a funções do módulo. Refatoração/extração desses arquivos é dívida separada (regra do CLAUDE.md: sugerir extração, não silenciosamente engordar). |
| Carregamento do `external_api.js` de domínio externo falhar (CSP/adblock). | `onFailed` no `JitsiRoom` cai na tela de erro com retry; documentar domínio no CSP se headers forem endurecidos futuramente. |
| Grupos grandes estourarem o limite do provider. | `VideoProvider.maxParticipants` documentado (25 no Jitsi default); UI pode exibir aviso no futuro — grupos do produto são pequenos (terapia), risco baixo. |

### Questões em aberto

1. **Plan gating fino**: o modelo `Plan` só tem `maxProfessionals`. Gating de teleconsulta
   por plano Stripe exige flags de feature no `Plan` (mudança de schema + superadmin UI).
   v1 entrega toggle por clínica + bloqueio read-only de assinatura inativa. Decidir com
   produto se teleconsulta será diferencial de plano pago antes de criar `Plan.features`.
2. **Contrato de telepsicologia (Resolução CFP 09/2024)**: o chip de aviso não-bloqueante
   "Enviar contrato" ao agendar ONLINE sem contrato assinado depende da feature
   `assinatura-digital-tcle` (não existe). Deixar hook de UI documentado e implementar
   quando a dependência existir.
3. **Sinal de presença do paciente** (correlação de joins por membro em grupos): a v1
   grava o acesso à página no AuditLog. Promover isso a um modelo de presença
   (`TelehealthAttendance`) só quando o prontuário/relatórios de assiduidade existirem.
4. **`telehealthEnabled` default `true` vs `false`**: o plano propõe `true` (descoberta do
   recurso) condicionado ao env da plataforma. Se o rollout preferir opt-in explícito por
   clínica (padrão `appointmentNotificationsEnabled`), trocar o default na migração é uma
   linha — confirmar com produto antes da Etapa 1.
5. **JWT de moderador**: instância Jitsi self-hosted pode exigir JWT para distinguir
   moderador de convidado de forma forte (hoje a distinção é cosmética no domínio público).
   A interface `VideoProvider` comporta isso (campo extra em `JoinInfo`); decidir junto com
   a escolha de infra (risco nº 1).

### Referências internas seguidas

- HMAC de links: `src/lib/appointments/appointment-links.ts` + rota pública `src/app/api/public/appointments/confirm/route.ts` (rate limit + verificação).
- Padrão provider: `src/lib/notifications/types.ts` + `providers/whatsapp-mock.ts`.
- Injeção de variáveis no cron: `src/app/api/jobs/send-reminders/route.ts` + `src/lib/jobs/send-reminders.ts`.
- Toggle por clínica: `Clinic.appointmentNotificationsEnabled` (`prisma/schema.prisma:216`) + gate em `notification-service.ts`.
- Polling sem `useEffect` cru: plano `2026-05-05-001-feat-pending-intake-alert-plan.md` (`useMountEffect`).
- Transição de status: `src/lib/appointments/status-transitions.ts` + `PATCH /api/appointments/[id]/status`.
- Bloqueio de sessões canceladas (espelhado pela RN-04): commit `7d28fc9`.
