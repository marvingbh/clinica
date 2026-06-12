---
title: "feat: Área do Paciente (portal web / PWA do paciente)"
type: feat
status: planned
date: 2026-06-11
slug: portal-do-paciente
priority: 9
complexity: XL
---

# feat: Área do Paciente (portal web / PWA do paciente)

Portal logado, com a marca da clínica, em `/paciente/[clinicSlug]` (pt-BR, mobile-first,
instalável como PWA), que tira do WhatsApp da clínica as tarefas de confirmação,
cancelamento, reagendamento, financeiro e atualização cadastral do paciente.

---

## 1. Contexto de Negócio

### Problema

Hoje toda interação do paciente com a clínica passa pelo WhatsApp da secretaria:
confirmar/cancelar sessão, pedir segunda via de fatura/NFS-e, atualizar telefone,
perguntar "que horas é minha sessão?". Isso consome horas de staff por semana, gera
erros de transcrição e não escala. Os únicos pontos de autoatendimento atuais são os
links HMAC de confirmar/cancelar (`/confirm`, `/cancel`) com validade de 24h — links
descartáveis, sem visão de histórico, financeiro ou dados.

### Evidência de mercado

- **Table stakes internacionalmente**: SimplePractice (Client Portal), TherapyNotes
  (TherapyPortal), Jane App, TheraNest e Healthie têm portal do paciente como recurso
  central de retenção.
- **Monetização comprovada no Brasil**: PsicoManager vende o portal como add-on pago
  (~R$ 19/mês). Clinicorp (Clini.me) e Amplimed (AmpliSaúde) usam o portal como
  diferencial de plano superior.
- **Roadmap Tier 1 #3** na análise de negócio. O portal é também a superfície de
  entrega para features futuras: formulários de anamnese, assinatura digital de TCLE,
  pagamentos (cobrança automática) e links de telessaúde.

### Usuários-alvo

| Persona | Uso |
|---|---|
| Paciente adulto | Ver/confirmar/cancelar sessões, baixar faturas e NFS-e, atualizar dados |
| Responsável (pais) | Mesmo acesso, em nome de uma ou mais crianças ("Responsável por {nome}") |
| ADMIN da clínica | Habilita o portal, define janela de cancelamento, trata solicitações |
| PROFESSIONAL | Recebe pedidos de reagendamento dos próprios pacientes |

### Métricas de sucesso

- ≥ 50% das confirmações/cancelamentos de pacientes migram do WhatsApp para o portal
  em 60 dias (medível via `AuditLog.action` `PORTAL_*` vs `PATIENT_CANCELLATION` por link).
- ≥ 30% dos pacientes ativos com pelo menos 1 login no portal em 90 dias.
- Redução de pedidos de 2ª via de fatura para a secretaria (qualitativo, NPS clinica).
- Upsell: portal como gatilho de upgrade de plano (campo `allowPatientPortal` no Plan).

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **paciente**, quero entrar no portal apenas com meu telefone ou e-mail
   (código OTP de 6 dígitos), sem criar senha, para acessar minhas informações.
2. Como **paciente**, quero ver minhas próximas sessões (data DD/MM/YYYY, hora HH:mm,
   profissional, modalidade) e confirmar ou cancelar dentro da política da clínica.
3. Como **paciente**, quero pedir reagendamento e ser avisado de que a clínica vai
   me retornar (v1 sem agendamento online: vira solicitação para o staff).
4. Como **paciente**, quero ver meu histórico de sessões passadas.
5. Como **paciente**, quero ver minhas faturas (status, vencimento), baixar o PDF e,
   quando houver NFS-e emitida, baixar a DANFSE.
6. Como **paciente**, quero ver e atualizar (via solicitação) meus dados cadastrais e
   gerenciar meus consentimentos de contato (WhatsApp/e-mail) diretamente.
7. Como **responsável**, quero alternar entre os perfis dos meus filhos na mesma
   clínica após um único login.
8. Como **paciente**, quero tocar em "Ver meus horários" no lembrete recebido e cair
   direto na lista de sessões, sem digitar OTP.
9. Como **ADMIN**, quero ligar/desligar o portal, definir a antecedência mínima de
   cancelamento e copiar o link do portal para divulgar.
10. Como **ADMIN/PROFESSIONAL**, quero ver e tratar as solicitações vindas do portal
    (reagendamento, atualização de dados, export LGPD) em uma fila única.

### 2.2 Fluxos

#### Fluxo A — Login por OTP (paciente)

1. Paciente acessa `/paciente/{slug}` → tela "Entrar" com a marca da clínica.
2. Digita telefone (máscara BR, aceita internacional) **ou** e-mail.
3. Sistema (sempre respondendo 200 — sem enumeração de cadastro):
   - Normaliza o identificador (`normalizePhone` de `@/lib/phone` / lowercase e-mail).
   - Busca pacientes ativos da clínica com aquele contato (`Patient.phone`,
     `PatientPhone.phone` com `notify=true`, `Patient.email`).
   - Se houver match **e** canal consentido (`consentWhatsApp`/`consentEmail`),
     gera OTP de 6 dígitos (TTL 10 min) e envia pelo canal correspondente via
     notification service (rate-limited).
   - Se houver match mas **nenhum canal disponível** (sem e-mail e sem consentimento
     WhatsApp), a tela seguinte mostra orientação genérica para contatar a clínica.
4. Paciente digita o código → `verify`:
   - Máx. 5 tentativas por código; código consumido após sucesso.
   - Sucesso → cria `PatientPortalSession` (cookie httpOnly, janela deslizante de
     30 dias) e retorna a lista de perfis acessíveis.
5. Se o identificador mapeia para >1 paciente → tela "Quem é você hoje?" (seletor de
   perfil). Se 1 só → vai direto para "Próximas sessões".

#### Fluxo B — Deep link "Ver meus horários" (OTP-light)

1. Lembrete (WhatsApp/e-mail) inclui link `/paciente/{slug}/entrar?token=...`
   assinado por HMAC (mesma infra de `appointment-links`), amarrado a `patientId`
   e com expiração igual à do lembrete (24h após a sessão).
2. Ao abrir, o token é verificado e cria-se uma sessão **escopo `AGENDA`** de 24h,
   restrita àquele paciente: vê e age sobre sessões, mas Financeiro/Documentos/Meus
   dados pedem elevação por OTP ("Confirme seu acesso para ver dados financeiros").

#### Fluxo C — Confirmar / cancelar sessão (paciente)

- **Confirmar**: permitido para `AGENDADO` → grava `CONFIRMADO` + `confirmedAt`
  (mesma semântica do token de confirmação atual; transição validada por
  `VALID_TRANSITIONS` de `src/lib/appointments/status-transitions.ts`).
- **Cancelar**: permitido para `AGENDADO`/`CONFIRMADO` **até X horas antes**
  (`Clinic.portalCancelMinHours`, default 24). Reusa o fluxo público existente:
  status `CANCELADO_ACORDADO`, `cancelledAt`, `cancellationReason`
  ("Cancelado pelo paciente via portal"), AuditLog `PORTAL_APPOINTMENT_CANCELLED`.
  Fora da janela → botão desabilitado com aviso + CTA "Solicitar reagendamento".

#### Fluxo D — Solicitar reagendamento (paciente → staff)

1. Paciente escolhe a sessão, escreve mensagem opcional e até 3 preferências de
   dia/período.
2. Cria `PortalRequest` (`type: RESCHEDULE`, payload com a mensagem/preferências) e
   um `Todo` para o profissional da sessão ("Reagendar: {paciente} — {DD/MM HH:mm}").
3. Staff resolve na fila "Solicitações do Portal" (remarca manualmente na agenda) e
   marca como resolvida. (Quando `agendamento-online` existir, este fluxo ganha a
   escolha de slot direto — ver Questões em Aberto.)

#### Fluxo E — Meus dados (paciente → solicitação, nunca escrita direta)

1. Tela mostra dados minimizados: nome, telefone(s), e-mail, endereço.
2. "Solicitar alteração" abre formulário; o diff vira `PortalRequest`
   (`type: UPDATE_DATA`, payload `{ field, currentValue, requestedValue }[]`).
3. Staff vê o diff na fila e clica "Aplicar" (escreve no `Patient` + AuditLog) ou
   "Rejeitar" (com motivo).
4. **Exceção (escrita direta permitida)**: toggles de consentimento de canal
   (WhatsApp/e-mail) são self-service — atualizam `consentWhatsApp/At`,
   `consentEmail/At` na hora, com AuditLog `PORTAL_CONSENT_CHANGED`.
5. Botão "Solicitar meus dados (LGPD)" cria `PortalRequest` (`type: LGPD_EXPORT`).

#### Fluxo F — ADMIN habilita o portal

1. Em Configurações da clínica → seção "Portal do Paciente":
   toggle "Habilitar portal", campo "Cancelamento permitido até (horas antes)",
   botão "Copiar link do portal".
2. Toggle só disponível se o plano permite (`Plan.allowPatientPortal`); senão mostra
   CTA de upgrade.

### 2.3 Telas (paciente — mobile-first, header desktop + bottom-nav mobile)

| Tela | Rota | Layout |
|---|---|---|
| Entrar | `/paciente/[slug]` (deslogado) | Logo da clínica, campo telefone/e-mail, botão "Receber código"; passo 2: 6 caixas de dígito, reenviar em 60s |
| Seletor de perfil | modal pós-login | Cards "Responsável por {nome}" / "{nome}" |
| Próximas sessões | `/paciente/[slug]` (logado) | Cards: data/hora, profissional, badge modalidade (Online/Presencial), badge status; ações Confirmar / Cancelar / Reagendar |
| Histórico | `/paciente/[slug]/historico` | Lista paginada de sessões passadas (data, profissional, status) |
| Financeiro | `/paciente/[slug]/financeiro` | Cards de fatura: mês de referência, valor R$, vencimento DD/MM/YYYY, badge status, botões "Baixar PDF" e "Baixar NFS-e" (quando emitida) |
| Documentos | `/paciente/[slug]/documentos` | Cards de ação: recibos (faturas pagas) hoje; placeholders para formulários pendentes e assinaturas (features futuras) |
| Meus dados | `/paciente/[slug]/dados` | Dados cadastrais read-only + "Solicitar alteração"; toggles de consentimento; "Solicitar meus dados (LGPD)" |

Navegação do portal: bottom-nav mobile com 5 itens (Sessões, Histórico, Financeiro,
Documentos, Dados) usando lucide-react (`CalendarDays`, `History`, `Receipt`,
`FileText`, `UserRound`); header desktop com os mesmos itens + nome da clínica +
seletor de perfil + "Sair".

### 2.4 Telas (staff)

- **Configurações** (`/admin` → settings): nova seção "Portal do Paciente" (Fluxo F).
- **Pacientes** (`/patients`): nova aba "Solicitações do Portal" — tabela com tipo,
  paciente, data, payload resumido, ações Aplicar/Resolver/Rejeitar. Badge de
  contagem pendente no padrão do alerta de fichas de cadastro
  (`docs/plans/2026-05-05-001-feat-pending-intake-alert-plan.md`).

### 2.5 Regras de negócio

1. **Tenant-scoped por slug**: todas as queries do portal filtram por `clinicId`
   resolvido do slug. O mesmo telefone em duas clínicas gera sessões independentes
   (cookie por slug: `portal_session_{slug}`).
2. **Só CONSULTA com `patientId` no conjunto da sessão** aparece no portal. Tipos
   TAREFA/LEMBRETE/NOTA/REUNIAO e sessões de outros pacientes nunca aparecem.
3. **Conteúdo clínico nunca aparece**: `Appointment.notes`, `Patient.notes`,
   `therapeuticProject`, preços de sessão por appointment — fora do payload.
   Serialização sempre via mappers de minimização (`serialize.ts`).
4. **Janela de cancelamento**: `now < scheduledAt - portalCancelMinHours` e status
   em {AGENDADO, CONFIRMADO}. Confirmação permitida só de `AGENDADO`.
5. **Gating**: portal ativo ⇔ `Plan.allowPatientPortal && Clinic.patientPortalEnabled`.
   Assinatura da clínica em `read_only` (trial expirado/cancelada — via
   `getSubscriptionAccess`) → portal **somente leitura** (sem confirmar/cancelar/
   solicitar; banner explicativo). `past_due` mantém escrita (full_access_warning).
   Clínica `isActive=false` → 404.
6. **Sessão**: 30 dias deslizantes (`expiresAt = lastUsedAt + 30d`), teto absoluto de
   90 dias, `lastUsedAt` tocado no máx. 1×/hora. Sessões escopo `AGENDA` (deep link):
   24h fixas, 1 paciente.
7. **OTP**: 6 dígitos, TTL 10 min, máx. 5 verificações por código, máx. 3 envios por
   identificador a cada 15 min e 10/min por IP (`checkRateLimit`).
8. **Auditoria**: toda mutação e todo download do portal gera `AuditLog` com
   `userId: null` e `action` prefixado `PORTAL_` (marcador de ator paciente), com
   `newValues.patientId` para rastreio. Logins idem (`PORTAL_LOGIN`).
9. **Menores**: pacientes do fluxo de intake infantil são acessados pelo contato do
   responsável; UI exibe "Responsável por {childName}" quando `birthDate` indica
   menor de 18 ou quando o login veio por telefone adicional rotulado de responsável.

### 2.6 Edge cases

| Caso | Comportamento |
|---|---|
| Sessão expira no meio de uma ação | API responde 401 `{ error, reauth: true }`; o client guarda a rota atual, reabre OTP e retorna ao mesmo ponto após login |
| Clínica fica read-only (assinatura) | GETs funcionam; POSTs respondem 403 com mensagem; UI mostra banner "Portal em modo leitura" |
| Paciente sem e-mail e sem consentimento WhatsApp | Tela pós-submit mostra "Se houver cadastro, enviaremos um código. Não recebeu? Entre em contato com a clínica para atualizar seus dados de contato." |
| Mesmo telefone em 2+ clínicas | Sessões independentes; nada vaza entre slugs |
| Mudança feita pelo staff (remarcou sessão) | Revalidação SWR: listas refetch on focus + `Cache-Control: private, no-store` nas APIs do portal |
| Appointment cancelado entre o GET e o POST | POST revalida status no banco; responde 409 "Esta sessão já foi cancelada" |
| Deep link expirado | Tela de OTP normal com aviso "Link expirado — entre com seu telefone ou e-mail" |
| Identificador sem nenhum match | Mesma resposta 200 do fluxo normal (anti-enumeração) |
| Paciente inativado (`isActive=false`) | Some da resolução de perfis; sessão existente perde acesso àquele perfil |

### 2.7 Copy pt-BR (chaves principais)

```
Entrar:            "Acesse sua área do paciente"
Campo:             "Telefone ou e-mail cadastrado na clínica"
CTA OTP:           "Receber código"
Pós-envio:         "Se houver cadastro, você receberá um código em instantes."
OTP:               "Digite o código de 6 dígitos"
Reenviar:          "Reenviar código (60s)"
Erro OTP:          "Código inválido ou expirado. Tente novamente."
Bloqueio OTP:      "Muitas tentativas. Aguarde alguns minutos."
Sessões:           "Próximas sessões" / "Você não tem sessões agendadas."
Confirmar:         "Confirmar presença"  → toast "Presença confirmada!"
Cancelar:          "Cancelar sessão"     → confirm "Tem certeza? Cancelamentos até {X}h antes."
Cancelado:         "Sessão cancelada. A clínica foi avisada."
Fora da janela:    "Cancelamento disponível até {X}h antes da sessão. Fale com a clínica ou solicite reagendamento."
Reagendar:         "Solicitar reagendamento" → toast "Solicitação enviada! A clínica entrará em contato."
Financeiro:        "Minhas faturas" / badges: "Pendente", "Enviada", "Parcial", "Paga", "Cancelada"
PDF:               "Baixar fatura (PDF)" / "Baixar NFS-e"
Meus dados:        "Meus dados" / "Solicitar alteração" / "Alteração enviada para aprovação da clínica."
Consentimento:     "Aceito receber mensagens por WhatsApp" / "Aceito receber e-mails"
LGPD:              "Solicitar meus dados (LGPD)" → "Solicitação registrada. A clínica responderá pelos seus contatos cadastrados."
Read-only:         "O portal está temporariamente em modo somente leitura. Entre em contato com a clínica."
Sair:              "Sair"
Responsável:       "Responsável por {nome}"
Sessão expirada:   "Sua sessão expirou. Entre novamente para continuar."
```

---

## 3. Design Técnico

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

**Novos enums:**

```prisma
enum PortalSessionScope {
  FULL    // login por OTP: todos os perfis do identificador, todas as áreas
  AGENDA  // deep link: 1 paciente, apenas área de sessões
}

enum PortalRequestType {
  RESCHEDULE
  UPDATE_DATA
  LGPD_EXPORT
}

enum PortalRequestStatus {
  PENDING
  RESOLVED
  REJECTED
}
```

**Extensão de enum existente** (`NotificationType`): adicionar `PATIENT_PORTAL_OTP`.

**Novos campos em `Clinic`:**

```prisma
  patientPortalEnabled  Boolean @default(false) // toggle por clínica (Fluxo F)
  portalCancelMinHours  Int     @default(24)    // janela de cancelamento do portal
```

E nas relações de `Clinic`: `patientPortalSessions PatientPortalSession[]`,
`patientPortalOtps PatientPortalOtp[]`, `portalRequests PortalRequest[]`.

**Novo campo em `Plan`:**

```prisma
  allowPatientPortal Boolean @default(false) // gating premium (economics PsicoManager)
```

**Novos models:**

```prisma
/// Sessão passwordless do portal do paciente (cookie httpOnly, hash do token)
model PatientPortalSession {
  id                String             @id @default(cuid())
  clinicId          String
  identifier        String             // contato verificado, normalizado (telefone dígitos ou e-mail lowercase)
  patientId         String?            // só para scope AGENDA (deep link fixa 1 paciente)
  tokenHash         String             @unique // sha256 do token aleatório de 256 bits
  scope             PortalSessionScope @default(FULL)
  expiresAt         DateTime           // janela deslizante: lastUsedAt + 30d
  absoluteExpiresAt DateTime           // teto: createdAt + 90d
  lastUsedAt        DateTime           @default(now())
  revokedAt         DateTime?
  ipAddress         String?
  userAgent         String?
  createdAt         DateTime           @default(now())

  clinic  Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  patient Patient? @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([clinicId, identifier])
  @@index([expiresAt])
  @@index([patientId])
}

/// Código OTP de login do portal (hash HMAC, nunca o código em claro)
model PatientPortalOtp {
  id         String              @id @default(cuid())
  clinicId   String
  identifier String              // normalizado, mesmo formato da sessão
  codeHash   String              // HMAC-SHA256(AUTH_SECRET, clinicId:identifier:code)
  channel    NotificationChannel
  attempts   Int                 @default(0)
  expiresAt  DateTime            // createdAt + 10min
  consumedAt DateTime?
  createdAt  DateTime            @default(now())

  clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  @@index([clinicId, identifier, expiresAt])
  @@index([expiresAt])
}

/// Solicitação feita pelo paciente no portal, tratada pelo staff
model PortalRequest {
  id               String              @id @default(cuid())
  clinicId         String
  patientId        String
  appointmentId    String?             // para RESCHEDULE
  type             PortalRequestType
  status           PortalRequestStatus @default(PENDING)
  payload          Json                // RESCHEDULE: { message, preferences[] } | UPDATE_DATA: { changes: [{field, current, requested}] } | LGPD_EXPORT: {}
  resolutionNotes  String?
  resolvedByUserId String?
  resolvedAt       DateTime?
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  clinic      Clinic       @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  patient     Patient      @relation(fields: [patientId], references: [id], onDelete: Cascade)
  appointment Appointment? @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  resolvedBy  User?        @relation(fields: [resolvedByUserId], references: [id], onDelete: SetNull)

  @@index([clinicId, status])
  @@index([clinicId, createdAt])
  @@index([patientId])
  @@index([appointmentId])
}
```

`Patient` ganha as relações `portalSessions PatientPortalSession[]` e
`portalRequests PortalRequest[]`; `Appointment` ganha `portalRequests PortalRequest[]`;
`User` ganha `resolvedPortalRequests PortalRequest[]`.

**Migração**: autorar SQL offline em
`prisma/migrations/20260611120000_patient_portal/migration.sql`
(CREATE TYPE × 3, ALTER TYPE "NotificationType" ADD VALUE, ALTER TABLE "Clinic"/"Plan"
ADD COLUMN, CREATE TABLE × 3 com índices acima). **Nunca** rodar `prisma db push` ou
`migrate dev`; `vercel-build` aplica via `migrate deploy`. Validar com
`npx prisma validate` + `npx prisma generate`.

> Nota: `ALTER TYPE ... ADD VALUE` não roda dentro de transação no Postgres < 12 com
> uso no mesmo bloco. Colocar o ALTER TYPE em statement isolado no topo da migração
> (padrão das migrações existentes do projeto).

### 3.2 Módulo de domínio `src/lib/patient-portal/` (funções puras + barrel)

| Arquivo | Assinaturas |
|---|---|
| `identifier.ts` | `normalizeIdentifier(raw: string): { kind: "phone" \| "email"; value: string } \| null` (reusa `normalizePhone` de `@/lib/phone`; e-mail → trim+lowercase; inválido → null) |
| `otp.ts` | `generateOtpCode(): string` (6 dígitos, `crypto.randomInt`); `hashOtpCode(secret: string, clinicId: string, identifier: string, code: string): string`; `verifyOtpCode(args: { secret; clinicId; identifier; code; codeHash }): boolean` (timing-safe); `isOtpUsable(otp: { expiresAt: Date; consumedAt: Date \| null; attempts: number }, now: Date): { usable: boolean; reason?: "expired" \| "consumed" \| "too_many_attempts" }`; constantes `OTP_TTL_MINUTES = 10`, `OTP_MAX_ATTEMPTS = 5` |
| `session.ts` | `generateSessionToken(): string` (32 bytes base64url); `hashSessionToken(token: string): string` (sha256 hex); `initialSessionExpiry(now: Date): { expiresAt: Date; absoluteExpiresAt: Date }`; `slideSession(session: { lastUsedAt; expiresAt; absoluteExpiresAt }, now: Date): { shouldTouch: boolean; expiresAt: Date }` (toca no máx. 1×/h, nunca passa do teto); `isSessionValid(session, now): boolean`; `portalCookieName(slug: string): string` (`portal_session_${slug}`) |
| `deep-link.ts` | `signPortalLink(patientId: string, clinicSlug: string, expires: number): string` e `verifyPortalLink(token: string): { valid: boolean; patientId?: string; clinicSlug?: string; error?: string }` — HMAC-SHA256 com `AUTH_SECRET`, payload `portal:{slug}:{patientId}:{expires}`, espelhando `src/lib/appointments/appointment-links.ts`; `buildPortalDeepLink(baseUrl: string, slug: string, patientId: string, scheduledAt: Date): string` (expira 24h após a sessão, igual aos links de confirmar/cancelar) |
| `policy.ts` | `canConfirmInPortal(status: string): boolean`; `canCancelInPortal(args: { status: string; scheduledAt: Date; now: Date; minHours: number }): { allowed: boolean; reason?: "status" \| "window" }`; `resolvePortalAccess(args: { planAllows: boolean; clinicEnabled: boolean; clinicActive: boolean; subscription: SubscriptionInfo }): "full" \| "read_only" \| "disabled"` (compõe `getSubscriptionAccess` de `@/lib/subscription`) |
| `serialize.ts` | `toPortalAppointment(appt): PortalAppointment` (id, scheduledAt, endAt, status, modality, professionalName — **nunca** notes/price); `toPortalInvoice(invoice): PortalInvoice` (id, referenceMonth/Year, totalAmount, dueDate, status, hasNfse, paidAt); `toPortalPatient(patient): PortalPatientProfile` (id, name, displayName, phone, email, address*, consentWhatsApp, consentEmail) |
| `guardian.ts` | `isMinor(birthDate: Date \| null, now: Date): boolean`; `portalDisplayName(patient: { name: string; birthDate: Date \| null }, now: Date): string` ("Responsável por {nome}" para menores) |
| `requests.ts` | `buildUpdateRequestPayload(current: PortalPatientProfile, requested: Partial<...>): UpdateChange[]` (diff campo a campo, ignora iguais, valida campos permitidos); `summarizePortalRequest(req: { type; payload }): string` (texto da fila do staff); `rescheduleTodoTitle(args: { patientName: string; scheduledAt: Date }): string` |
| `index.ts` | barrel re-exportando tudo |

**Adapter (não puro, mas no módulo):** `src/lib/patient-portal/with-portal-session.ts`

```ts
export interface PortalContext {
  clinic: { id: string; slug: string; name: string; portalCancelMinHours: number }
  session: { id: string; scope: "FULL" | "AGENDA"; identifier: string }
  patientIds: string[]          // perfis acessíveis (revalidados a cada request)
  access: "full" | "read_only"  // resultado de resolvePortalAccess
}

export function withPortalSession(
  handler: (req: NextRequest, ctx: PortalContext, params: Record<string, string>) => Promise<NextResponse>,
  opts?: { requireScope?: "FULL" }   // áreas financeiro/documentos/dados exigem FULL
)
```

Comportamento: resolve clínica por `params.slug` (404 se inexistente/inativa/portal
desabilitado), lê o cookie `portal_session_{slug}`, valida hash + expiração + clinicId,
recalcula `patientIds` na hora — `FULL`: pacientes ativos da clínica com aquele
identificador; `AGENDA`: apenas `session.patientId` se ainda ativo —, aplica o slide
de expiração e devolve 401 `{ error, reauth: true }` quando inválida. Toda rota do
portal recebe `patientId` por query/body e **deve** validar `patientIds.includes(patientId)`
(equivalente portal do `ownership` de FKs).

### 3.3 Rotas de API

Todas as rotas do paciente ficam em `src/app/api/public/portal/[slug]/` (sem NextAuth),
com `Cache-Control: private, no-store`, rate limit por IP nas rotas de auth e
handlers finos (<50 linhas de lógica inline; regra de negócio no módulo).

| Rota | Método | Auth | Request → Response |
|---|---|---|---|
| `/api/public/portal/[slug]/config` | GET | nenhuma (rate-limited) | → `{ name, hasLogo, portalEnabled }` (branding da tela de login; espelho de `public/intake/[slug]`) |
| `/api/public/portal/[slug]/otp/request` | POST | rate limit IP + identificador | `{ identifier }` → sempre `{ ok: true }` (anti-enumeração). Internamente: match, consent-gate, cria `PatientPortalOtp`, envia via `createNotification` (`PATIENT_PORTAL_OTP`) |
| `/api/public/portal/[slug]/otp/verify` | POST | rate limit IP | `{ identifier, code }` → set-cookie + `{ profiles: [{ id, displayName, isGuardianAccess }] }`; 400 código inválido/expirado; incrementa `attempts` |
| `/api/public/portal/[slug]/session/link` | POST | rate limit IP | `{ token }` → verifica `verifyPortalLink`, cria sessão `AGENDA` 24h + cookie → `{ profiles: [um perfil] }` |
| `/api/public/portal/[slug]/session` | DELETE | `withPortalSession` | logout: `revokedAt = now`, limpa cookie |
| `/api/public/portal/[slug]/me` | GET | `withPortalSession` | → `{ clinic: { name, hasLogo, cancelMinHours }, access, scope, profiles: PortalPatientProfile[] }` |
| `/api/public/portal/[slug]/appointments` | GET | `withPortalSession` | `?patientId=&range=upcoming\|past&page=` → `{ appointments: PortalAppointment[] }` (where: `clinicId`, `patientId` validado, `type: "CONSULTA"`) |
| `/api/public/portal/[slug]/appointments/[id]/confirm` | POST | `withPortalSession` + access=full | → 200 `{ appointment }`; 409 se status não permite; AuditLog `PORTAL_APPOINTMENT_CONFIRMED` |
| `/api/public/portal/[slug]/appointments/[id]/cancel` | POST | `withPortalSession` + access=full | `{ reason? }` → reusa a lógica de `public/appointments/cancel` (CANCELADO_ACORDADO + audit `PORTAL_APPOINTMENT_CANCELLED`); 422 fora da janela (`canCancelInPortal`) |
| `/api/public/portal/[slug]/appointments/[id]/reschedule-request` | POST | `withPortalSession` + access=full | `{ message?, preferences? }` → cria `PortalRequest` + `Todo` (assignee = `professionalProfileId` da sessão) → `{ requestId }` |
| `/api/public/portal/[slug]/invoices` | GET | `withPortalSession({ requireScope: "FULL" })` | `?patientId=` → `{ invoices: PortalInvoice[] }` (where `clinicId` + `patientId`; exclui `CANCELADO`? não — exibe com badge) |
| `/api/public/portal/[slug]/invoices/[id]/pdf` | GET | idem | → PDF binário; reusa `buildInvoicePDFData` + `createInvoiceDocument` + `INVOICE_INCLUDE` (mesmo pipeline de `financeiro/faturas/[id]/pdf`); `findFirst({ id, clinicId, patientId in patientIds })`; AuditLog `PORTAL_INVOICE_DOWNLOADED` |
| `/api/public/portal/[slug]/invoices/[id]/danfse` | GET | idem | → DANFSE PDF quando há `NfseEmission` EMITIDA com `xml` (reusa `buildDanfseData` + `createDanfseDocument` de `@/lib/nfse`); 404 caso contrário; AuditLog `PORTAL_DANFSE_DOWNLOADED` |
| `/api/public/portal/[slug]/profile/update-request` | POST | idem + access=full | `{ patientId, changes }` (zod) → valida campos permitidos (`buildUpdateRequestPayload`) → `PortalRequest UPDATE_DATA` |
| `/api/public/portal/[slug]/profile/consents` | POST | idem + access=full | `{ patientId, consentWhatsApp?, consentEmail? }` → escrita direta nos booleans + timestamps + AuditLog `PORTAL_CONSENT_CHANGED` |
| `/api/public/portal/[slug]/profile/lgpd-export` | POST | idem + access=full | → `PortalRequest LGPD_EXPORT` (1 pendente por paciente; 409 se já existe) |
| `/api/public/portal/[slug]/manifest` | GET | nenhuma | → manifest JSON dinâmico do PWA do paciente (nome da clínica, `start_url`/`scope` = `/paciente/{slug}`) |

**Rotas staff (NextAuth + feature RBAC):**

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/portal-requests` | GET | `withFeatureAuth({ feature: "patients", minAccess: "READ" })` | Lista `PortalRequest` do `user.clinicId` (filtro `status`, paginação). PROFESSIONAL: filtrar por pacientes cujo `referenceProfessionalId`/sessões pertencem a ele (mesmo padrão "own" das faturas) |
| `/api/portal-requests/pending-count` | GET | idem | `{ count }` para o badge (espelho de `intake-submissions/pending-count`) |
| `/api/portal-requests/[id]` | PATCH | `withFeatureAuth({ feature: "patients", minAccess: "WRITE" })` | `{ action: "resolve" \| "reject" \| "apply", resolutionNotes? }`. `apply` (só UPDATE_DATA): escreve os campos no `Patient` (validando `clinicId` do request E do patient = `user.clinicId` — convenção de tenant isolation) + AuditLog `PORTAL_REQUEST_APPLIED` |
| `/api/admin/settings` | PATCH (editar existente) | já existe | aceitar `patientPortalEnabled`, `portalCancelMinHours` (zod: int 1–168); rejeitar enable se `!plan.allowPatientPortal` |
| `/api/jobs/cleanup-portal-sessions` | GET | `CRON_SECRET` (padrão dos jobs) | deleta `PatientPortalOtp` expirados e `PatientPortalSession` com `expiresAt < now - 7d` |

**Tenant scoping** — checklist por handler: (1) clínica resolvida por slug uma única
vez; (2) todo `findFirst/findMany/update` inclui `clinicId`; (3) `patientId` de
query/body validado contra `ctx.patientIds`; (4) `appointmentId`/`invoiceId` buscados
com `clinicId` + `patientId` no where (nunca `findUnique` por id puro); (5) staff:
ids de body validados contra `user.clinicId` antes de qualquer escrita.

### 3.4 RBAC

Sem feature nova: a fila de solicitações é uma extensão do contexto **patients**
(ADMIN WRITE / PROFESSIONAL READ por default — professional vê, admin aplica;
overrides por usuário continuam funcionando). A configuração do portal fica sob
`clinic_settings` (já WRITE só para ADMIN). Justificativa: o portal não cria uma
área de staff própria — cria itens de trabalho sobre pacientes/agenda; registrar uma
feature `portal` criaria uma 15ª permissão sem caso de uso de override distinto.
(Se no futuro a fila crescer para um inbox próprio, promover para feature dedicada.)

### 3.5 UI — páginas e componentes

**Novo (superfície do paciente):**

```
src/app/paciente/[slug]/
├── layout.tsx                 # shell do portal: branding, <link rel="manifest" href=`/api/public/portal/${slug}/manifest`>, theme-color, PortalSessionProvider
├── page.tsx                   # decide login × "Próximas sessões" (server component lê cookie via withPortalSession-helper)
├── historico/page.tsx
├── financeiro/page.tsx
├── documentos/page.tsx
├── dados/page.tsx
└── components/
    ├── PortalLogin.tsx        # passo identificador (react-hook-form + zod, máscara BR)
    ├── OtpInput.tsx           # 6 dígitos, contagem de reenvio (sem useEffect cru — timer via useMountEffect)
    ├── ProfileSwitcher.tsx    # seletor "Responsável por {nome}"
    ├── PortalNav.tsx          # header desktop + bottom-nav mobile (5 itens)
    ├── SessionCard.tsx        # card de sessão + ações (Confirmar/Cancelar/Reagendar)
    ├── RescheduleDialog.tsx
    ├── InvoiceCard.tsx
    ├── DocumentCard.tsx
    ├── ConsentToggles.tsx
    ├── UpdateDataDialog.tsx
    ├── ReadOnlyBanner.tsx
    └── PortalSessionProvider.tsx  # contexto client: perfil ativo, access, reauth-flow (guarda rota e reabre OTP)
```

Cada arquivo < 200 linhas; dados via fetch nos event handlers / server components +
revalidação on-focus (padrão SWR leve já usado no projeto, ex.: `usePendingIntakeCount`).
Datas sempre `toLocaleDateString("pt-BR")` / `HH:mm`; moeda via
`src/lib/financeiro/format`.

**PWA**: o manifest do paciente é servido por rota dinâmica
(`/api/public/portal/[slug]/manifest`) com `scope: "/paciente/{slug}"` e
`start_url: "/paciente/{slug}"`, então a instalação do PWA profissional
(`public/manifest.json`, scope `/`) não é afetada — o `layout.tsx` do portal
sobrescreve o `<link rel="manifest">` da árvore. Ícones: reusar `/icons/*` no v1.

**Edições em arquivos existentes:**

| Arquivo | Mudança |
|---|---|
| `src/shared/components/ui/app-shell.tsx` | adicionar `"/paciente"` a `PUBLIC_PATHS` (linha 8) para não montar sidebar/poller de staff |
| `src/shared/components/ui/sidebar-nav.tsx` | mesmo ajuste de paths públicos, se aplicável |
| `src/app/admin/...` (página de settings que consome `/api/admin/settings`) | seção "Portal do Paciente" (toggle + horas + copiar link) |
| `src/app/patients/...` (página com abas) | aba "Solicitações do Portal" + componente `PortalRequestsTable.tsx` (novo, em `src/app/patients/components/`) |
| `src/app/api/admin/settings/route.ts` | aceitar/validar os 2 novos campos + checagem de plano |
| `src/lib/notifications/templates.ts` | template default `PATIENT_PORTAL_OTP` (WhatsApp + e-mail): "Seu código de acesso à área do paciente de {{clinicName}}: {{otpCode}}. Válido por 10 minutos." e variável `{{portalLink}}` nos templates de lembrete |
| `src/lib/notifications/notification-service.ts` | adicionar `PATIENT_PORTAL_OTP` a `ALWAYS_ENABLED_EMAIL_TYPES` (transacional, iniciado pelo usuário — não depende de `appointmentNotificationsEnabled`) |
| `src/lib/jobs/send-reminders.ts` + `src/app/api/jobs/send-reminders/route.ts` | incluir `portalLink` (via `buildPortalDeepLink`) nas variáveis quando `clinic.patientPortalEnabled` |
| `vercel.json` | cron `{ "path": "/api/jobs/cleanup-portal-sessions", "schedule": "0 4 * * *" }` |
| `prisma/schema.prisma` | seção 3.1 |

### 3.6 Integrações

- **Notificações**: OTP usa `createNotification` (canal escolhido pelo tipo de
  identificador: telefone→WHATSAPP, e-mail→EMAIL). ⚠️ WhatsApp hoje é
  `whatsapp-mock` (não entrega) — ver Riscos; e-mail (Resend) é o canal funcional.
- **Auditoria**: ações `PORTAL_LOGIN`, `PORTAL_LOGIN_LINK`, `PORTAL_OTP_REQUESTED`,
  `PORTAL_APPOINTMENT_CONFIRMED`, `PORTAL_APPOINTMENT_CANCELLED`,
  `PORTAL_RESCHEDULE_REQUESTED`, `PORTAL_UPDATE_REQUESTED`, `PORTAL_CONSENT_CHANGED`,
  `PORTAL_LGPD_EXPORT_REQUESTED`, `PORTAL_INVOICE_DOWNLOADED`,
  `PORTAL_DANFSE_DOWNLOADED`, `PORTAL_REQUEST_APPLIED` — sempre `userId: null`,
  `newValues.patientId` preenchido, IP/user-agent como no fluxo público de cancel.
  Adicionar labels em `src/lib/audit/` (field-labels/action labels) para a UI de logs.
- **Todos**: reagendamento cria `Todo` com `professionalProfileId` da sessão e
  `day = hoje` (modelo já existente; sem mudança de schema).
- **Assinatura/planos**: `resolvePortalAccess` compõe `getSubscriptionAccess`
  (`src/lib/subscription/status.ts`). Superadmin: tela de Plans ganha o checkbox
  "Permitir Portal do Paciente" (campo novo no Plan).
- **Dependências futuras (superfícies preparadas, sem implementação)**: cards de
  "Documentos" têm tipos extensíveis (`receipt | form | signature | file`); v1 só
  emite `receipt` (fatura paga). Agendamento online, anexos, anamnese e TCLE plugam
  aqui depois.

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`; enums Prisma como
string literal; `vi.useFakeTimers()` para tempo.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/patient-portal/identifier.test.ts` | telefone BR com máscara → dígitos; internacional `+`; e-mail uppercase → lowercase; entrada inválida → null; string vazia → null |
| `src/lib/patient-portal/otp.test.ts` | gera 6 dígitos; hash determinístico por (clinic, identifier, code); verify rejeita código errado/clínica errada (isolamento entre tenants); timing-safe (mesmo comprimento); `isOtpUsable`: expirado, consumido, 5 tentativas, ok |
| `src/lib/patient-portal/session.test.ts` | token ≥ 32 bytes url-safe; hash estável; expiração inicial 30d/teto 90d; `slideSession` não toca se `lastUsedAt` < 1h; desliza e respeita teto absoluto; `isSessionValid` para expirada/revogada; `portalCookieName` por slug |
| `src/lib/patient-portal/deep-link.test.ts` | sign/verify roundtrip; rejeita assinatura adulterada, slug trocado, patientId trocado, expirado; `buildPortalDeepLink` expira 24h após `scheduledAt` |
| `src/lib/patient-portal/policy.test.ts` | confirm só de AGENDADO; cancel: dentro/fora da janela (limite exato), status cancelado/finalizado → `reason: "status"`; `resolvePortalAccess`: plano off → disabled; clinic off → disabled; clinic inativa → disabled; trial expirado → read_only; past_due → full; active → full |
| `src/lib/patient-portal/serialize.test.ts` | `toPortalAppointment` nunca inclui `notes`/`price` (asserção de chaves); `toPortalInvoice` calcula `hasNfse` (emissão EMITIDA com xml); `toPortalPatient` omite CPF/notes/therapeuticProject |
| `src/lib/patient-portal/guardian.test.ts` | `isMinor` nos limites (aniversário de 18 hoje/ontem/amanhã, birthDate null → false); `portalDisplayName` "Responsável por X" para menor, nome puro para adulto |
| `src/lib/patient-portal/requests.test.ts` | diff ignora campos iguais; rejeita campo não permitido (ex.: `sessionFee`); payload estruturado; `summarizePortalRequest` por tipo; `rescheduleTodoTitle` com DD/MM HH:mm |
| `src/lib/notifications/templates.test.ts` (estender) | template default PATIENT_PORTAL_OTP existe para os 2 canais; `renderTemplate` substitui `{{otpCode}}`/`{{portalLink}}` |
| `src/lib/jobs/send-reminders.test.ts` (estender, se houver) | variáveis incluem `portalLink` quando portal habilitado; ausente quando desabilitado |
| `src/lib/subscription/limits.test.ts` (estender) | sem mudança de comportamento existente (regressão) |

Gates antes de cada commit: `npx prisma generate` && `npm run test` && `npm run build`.

---

## 5. Etapas de Implementação

Branch isolada: `bash scripts/new-feature.sh portal-do-paciente` (worktree + DB próprios).

1. **Schema + migração** — editar `prisma/schema.prisma` (seção 3.1); escrever
   `prisma/migrations/20260611120000_patient_portal/migration.sql` à mão; rodar
   `npx prisma validate` e `npx prisma generate`; aplicar no DB da worktree apenas
   via `psql -f` (nunca `db push`/`migrate dev`). ✔ Verifica: `npm run build` verde.
2. **Módulo de domínio** — criar `src/lib/patient-portal/` (identifier, otp, session,
   deep-link, policy, serialize, guardian, requests, index) com todos os testes da
   seção 4. ✔ Verifica: `npx vitest run src/lib/patient-portal`.
3. **Adapter de sessão** — `with-portal-session.ts` (cookie → sessão → perfis →
   access) + helpers de cookie. ✔ Verifica: teste de unidade das partes puras
   (resolução de perfis mockando Prisma é dispensável; cobrir via funções puras).
4. **Auth do portal (rotas)** — `config`, `otp/request`, `otp/verify`, `session/link`,
   `session` (logout), `me`, `manifest`; template OTP em `templates.ts` +
   `ALWAYS_ENABLED_EMAIL_TYPES`. ✔ Verifica: login OTP por e-mail funciona no dev
   (Resend sandbox), cookie setado, `me` retorna perfis; OTP por telefone cria
   notificação mock SENT.
5. **Sessões (views + ações)** — rotas `appointments` GET/confirm/cancel/
   reschedule-request + páginas `page.tsx`, `historico`, componentes SessionCard/
   RescheduleDialog/PortalNav/PortalSessionProvider; `app-shell.tsx` ganha
   `"/paciente"`. ✔ Verifica: fluxo C e D ponta a ponta no dev; AuditLog gravado;
   janela de cancelamento respeitada.
6. **Financeiro + Documentos** — rotas `invoices`, `pdf`, `danfse`, páginas
   `financeiro` e `documentos` (cards de recibo). ✔ Verifica: PDF baixa idêntico ao
   staff; DANFSE só quando emissão EMITIDA; fatura de outro paciente → 404.
7. **Meus dados + LGPD** — rotas `profile/update-request`, `consents`, `lgpd-export`,
   página `dados` (ConsentToggles, UpdateDataDialog). ✔ Verifica: consentimento
   atualiza booleans+timestamps; solicitação cria PortalRequest.
8. **Fila do staff** — rotas `portal-requests` (GET/pending-count/PATCH), aba em
   `/patients` + `PortalRequestsTable`, "apply" de UPDATE_DATA com validação de
   clinicId. ✔ Verifica: ADMIN aplica diff e Patient muda + audit; PROFESSIONAL vê
   apenas os próprios.
9. **Settings + gating + superadmin** — `/api/admin/settings` aceita os campos novos;
   seção na UI de settings; checkbox `allowPatientPortal` na UI de Plans do
   superadmin; banner read-only no portal. ✔ Verifica: portal 404 com toggle off;
   read-only quando assinatura expirada.
10. **Deep link nos lembretes + cron** — `buildPortalDeepLink` no send-reminders
    (gated por `patientPortalEnabled`), variável `{{portalLink}}` nos templates;
    job `cleanup-portal-sessions` + entrada no `vercel.json`. ✔ Verifica: teste do
    job; link do lembrete abre sessão AGENDA.
11. **PWA + polimento** — manifest dinâmico, theme-color, ícones, estados vazios,
    toasts Sonner, revalidação on-focus. ✔ Verifica: Lighthouse "installable" em
    `/paciente/{slug}`; PWA staff intacto em `/`.
12. **Gates finais + commit** — `npx prisma generate` && `npm run test` &&
    `npm run build`; commits convencionais por etapa, ex.:
    `feat(portal): add patient portal domain module and OTP auth` …
    terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
    **Não fazer push** sem pedido explícito.

---

## 6. Riscos e Questões em Aberto

### Riscos

1. **WhatsApp é mock** — OTP por telefone não entrega nada hoje (provider
   `whatsapp-mock` marca SENT sem enviar). Mitigação v1: na UI, se o identificador é
   telefone e o paciente tem e-mail cadastrado, enviar o OTP pelo e-mail e avisar
   "Código enviado para o e-mail cadastrado"; sem e-mail → orientação para contatar a
   clínica. O portal só fica plenamente "phone-first" quando o provider real de
   WhatsApp existir. **Decisão de produto necessária antes do lançamento.**
2. **Rate limit em memória** — `src/lib/rate-limit.ts` é por instância; em Vercel
   serverless o limite é por lambda, enfraquecendo a proteção do OTP. Mitigações já
   no design: máx. 5 tentativas por código persistidas no banco (`attempts`) e máx. 3
   OTPs/15min por identificador checado via contagem no banco (não só memória).
3. **Enumeração de cadastro** — respostas idênticas no `otp/request` e timing
   semelhante (sempre executar o hash mesmo sem match) reduzem o vetor.
4. **Vazamento entre perfis do mesmo responsável** — `patientIds` recalculado a cada
   request; toda rota valida o `patientId` recebido. Teste manual obrigatório:
   sessão de A não acessa fatura de B (outro responsável).
5. **Crescimento de AuditLog** — logamos mutações+downloads+logins, não cada GET de
   listagem (interpretação pragmática de "portal reads are access-logged"; o acesso
   está coberto por `PORTAL_LOGIN` + downloads). Se o jurídico exigir granularidade
   por visualização, adicionar depois com amostragem/dedupe diário.
6. **Migração com `ALTER TYPE`** — `ADD VALUE` em enum precisa de cuidado com
   transações; seguir o padrão das migrações existentes e testar no DB da worktree.
7. **Cookie por slug** — slugs muito longos/caracteres especiais: sanitizar nome do
   cookie (slug já é url-safe por construção no signup).

### Questões em aberto

1. **Pagamento**: botão "Pagar" fica oculto até `cobranca-automatica` existir; o
   `InvoiceCard` já reserva o slot. Confirmar prioridade com o roadmap.
2. **Agendamento online**: quando o slot engine público existir, o
   `reschedule-request` ganha modo "escolher horário" (flag por clínica). A API atual
   foi desenhada para aceitar `preferences[]` vazio + futuro `newSlot`.
3. **`motherPhone`/`fatherPhone` como identificador de login?** v1 usa apenas
   `Patient.phone`, `PatientPhone(notify=true)` e `Patient.email` (normalizados).
   Incluir os campos de pais exige normalização retroativa — avaliar com dados reais.
4. **Preço do add-on**: portal entra em qual plano? (campo `allowPatientPortal` dá a
   alavanca; precificação fora do escopo técnico).
5. **Marca da clínica**: v1 usa nome + logo (`logoData`) na tela de login e no
   manifest. Cores customizadas por clínica ficam para depois.
6. **Retenção de `PortalRequest` LGPD_EXPORT**: SLA de resposta e formato do export
   (quem gera? staff manualmente no v1) — alinhar com o DPO/owner.

### Referências internas (padrões a seguir)

- HMAC de links: `src/lib/appointments/appointment-links.ts` (+ testes)
- Rota pública slug-scoped: `src/app/api/public/intake/[slug]/route.ts`
- Cancel público + audit de paciente: `src/app/api/public/appointments/cancel/route.ts`
- Pipeline PDF: `src/app/api/financeiro/faturas/[id]/pdf/route.ts`,
  `src/lib/financeiro/build-invoice-pdf-data.ts`, `src/lib/nfse/danfse-pdf.tsx`
- Auth wrappers: `src/lib/api/with-auth.ts` (`withFeatureAuth`)
- Assinatura/read-only: `src/lib/subscription/status.ts`
- Badge/contagem pendente: `docs/plans/2026-05-05-001-feat-pending-intake-alert-plan.md`
- Shell público: `src/shared/components/ui/app-shell.tsx:8` (`PUBLIC_PATHS`)
- Notificações/templates: `src/lib/notifications/notification-service.ts:31`,
  `src/lib/notifications/templates.ts`
- Normalização de telefone: `src/lib/phone` (`normalizePhone`, barrel `@/lib/phone`)
