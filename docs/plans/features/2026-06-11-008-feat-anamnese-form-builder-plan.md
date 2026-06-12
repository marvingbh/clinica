---
title: "feat: Construtor de anamneses e questionários (preenchidos pelo paciente)"
type: feat
status: planned
date: 2026-06-11
slug: anamnese-form-builder
priority: 8
complexity: XL
---

# feat: Construtor de anamneses e questionários (anamnese-form-builder)

## 1. Contexto de Negócio

### Problema

Hoje a Clinica tem **um único formulário público fixo** (a ficha de cadastro
infantil/adolescente em `/intake/[slug]`, modelo `IntakeSubmission`). Não existe:

- Construtor de formulários (no-code) para a clínica montar **anamneses por
  abordagem** (TCC, psicanálise, ABA, infantil, adulto);
- Questionários clínicos enviados ao paciente **antes da sessão**
  (check-in pré-sessão, escalas 0–10, termos LGPD adicionais);
- Registro das respostas no prontuário/ficha do paciente.

O profissional acaba enviando PDFs/Google Forms por fora do sistema — as
respostas não chegam ao registro do paciente, não têm trilha de auditoria e
não respeitam o escopo multi-tenant/LGPD do produto.

### Evidência de mercado

Formulários configuráveis são recurso pago/diferenciador em **Corpora,
Allminds, Clínica Ágil, Amplimed, Ninsaúde Apolo, Clínica nas Nuvens, Jane
App, Cliniko, SimplePractice e Power Diary/Zanda**. É o item Tier 2 #6 do
roadmap, escopado para a parte faltante: builder + questionários clínicos +
anamnese por abordagem. O fluxo fixo de `IntakeSubmission` **permanece
intocado** (poderá ser replataformado sobre este motor no futuro).

### Usuários-alvo

| Persona | Uso |
|---|---|
| ADMIN da clínica | Cria/edita modelos, publica versões, configura envio automático na aprovação da ficha de cadastro, acompanha status |
| PROFESSIONAL | Cria seus próprios modelos, envia formulário ao paciente, lê respostas dos seus pacientes, recebe Todo quando respondido |
| Paciente / responsável | Recebe link por WhatsApp/e-mail, preenche no celular com autosave, retoma depois, assina ciência LGPD |

### Métricas de sucesso

- ≥ 50% das clínicas ativas com ao menos 1 modelo publicado em 60 dias;
- ≥ 70% de taxa de conclusão dos formulários enviados (CONCLUIDO / enviados);
- Tempo mediano entre envio e conclusão < 48h;
- Zero vazamento cross-tenant (testes de escopo por `clinicId` em todas as rotas).

---

## 2. Especificação Funcional

### 2.1 User stories

1. **Como ADMIN**, quero criar um modelo de formulário com campos arrastáveis
   e pré-visualização mobile, para padronizar a anamnese da clínica.
2. **Como ADMIN/PROFESSIONAL**, quero publicar uma versão imutável do modelo,
   para que edições futuras nunca corrompam respostas antigas.
3. **Como PROFESSIONAL**, quero enviar um formulário ao paciente por
   WhatsApp/e-mail com link expirante, para receber a anamnese antes da sessão.
4. **Como paciente**, quero preencher no celular com salvamento automático e
   retomar depois, para não perder o que já respondi.
5. **Como PROFESSIONAL**, quero receber uma tarefa (Todo) e uma notificação
   quando o paciente concluir, para revisar antes da sessão.
6. **Como ADMIN**, quero que a aprovação de uma ficha de cadastro dispare
   automaticamente a anamnese configurada, para eliminar passos manuais.
7. **Como ADMIN/PROFESSIONAL**, quero exportar a resposta em PDF, para
   arquivar/imprimir.

### 2.2 Fluxos por papel

**ADMIN / PROFESSIONAL — Builder (`/formularios`)**
1. Lista de modelos (nome, status Ativo/Inativo, nº de versões, última
   publicação, respostas enviadas/concluídas). Botões: **"Novo formulário"**,
   **"Adicionar modelos prontos"** (semeia a biblioteca pt-BR na clínica).
2. Editor (`/formularios/[id]`): coluna esquerda = lista de campos com
   drag-to-order (dnd-kit, já no projeto); coluna direita = **preview mobile
   ao vivo**. Ações: **"Salvar rascunho"** (atualiza `draftFields`),
   **"Publicar"** (cria `FormVersion` imutável). Badge **"Alterações não
   publicadas"** quando rascunho difere da última versão.
3. Excluir modelo = **desativar** (`isActive=false`); respostas existentes
   permanecem intactas e renderizáveis.

**ADMIN / PROFESSIONAL — Envio**
1. Na ficha do paciente (`PatientDetailsView`), seção **"Formulários"**:
   lista de respostas com chips de status + botão **"Enviar formulário"**.
2. Dialog de envio: seleção do modelo (apenas ativos com versão publicada),
   canal (WhatsApp/E-mail/Copiar link), validade (7/14/30 dias, padrão 14).
3. Reenviar: regenera o token e estende a validade (link antigo morre).
4. Envio duplicado do mesmo modelo: a resposta pendente anterior é marcada
   `EXPIRADO` (supersede) e um novo envio é criado.
5. Cancelar envio pendente: marca `EXPIRADO`.

**Paciente — Preenchimento público (`/f/[token]`)**
1. Abre o link → tela mobile-first no estilo da ficha de cadastro existente
   (`/intake/[slug]`): logo da clínica, barra de progresso, um cartão por campo.
2. Aviso LGPD fixo no topo: *"Suas respostas contêm dados sensíveis de saúde
   e serão visíveis ao profissional responsável pelo seu atendimento."*
3. **Autosave a cada resposta** (PATCH parcial) → status vira
   `EM_PREENCHIMENTO`; ao reabrir o link válido, retoma de onde parou.
4. Validação por campo em pt-BR; campos condicionais aparecem/somem conforme
   respostas; bloco informativo (texto LGPD/consentimento) exige marcar
   **"Li e aceito"** quando obrigatório.
5. Enviar → valida tudo → status `CONCLUIDO` → tela de sucesso
   *"Respostas enviadas. Obrigado!"*.
6. Link expirado → tela educada: *"Este link expirou. Peça um novo link à
   clínica."* (sem vazar dados).

**Pós-conclusão (sistema)**
- Cria `Todo` *"Formulário respondido — {{patientName}}"* para o profissional
  responsável (referência do paciente, senão o profissional do envio);
- Notificação e-mail `FORM_COMPLETED` para o profissional (fallback: admins);
- AuditLog `FORM_RESPONSE_COMPLETED` (userId null — ação pública).

**Automação intake**
- Modelos com `autoSendOnIntakeApproval=true` são enviados automaticamente
  quando uma `IntakeSubmission` é aprovada (após criação do `Patient`), via
  canal e-mail (e WhatsApp quando provider real existir), validade padrão.

### 2.3 Tipos de campo

| Tipo | Valor da resposta | Observações |
|---|---|---|
| `section` | — | Cabeçalho de seção, não conta no progresso |
| `short_text` | `string` | máx. 200 chars |
| `long_text` | `string` | textarea, máx. 5000 chars |
| `single_choice` | `string` | radio, `options[]` obrigatório |
| `multiple_choice` | `string[]` | checkboxes, `options[]` obrigatório |
| `dropdown` | `string` | select, `options[]` obrigatório |
| `scale_0_10` | `number` 0–10 | escala deslizante/botões |
| `date` | `string` `DD/MM/YYYY` | input texto com máscara (NUNCA `type="date"`) |
| `yes_no` | `boolean` | Sim/Não |
| `info_consent` | `boolean` | texto informativo somente leitura (LGPD) + checkbox "Li e aceito" |

Cada campo: `required?: boolean` e visibilidade condicional
`visibleWhen?: { fieldId, equals }` (mostrar quando a resposta de um campo
anterior for X).

### 2.4 Regras de negócio

1. **Versionamento imutável**: publicar cria `FormVersion` com snapshot dos
   campos; respostas referenciam a versão — render histórico sempre fiel.
2. **Só versões publicadas podem ser enviadas**; modelo sem versão publicada
   não aparece no dialog de envio.
3. **Token**: aleatório de 32 bytes; só o hash SHA-256 é persistido
   (`tokenHash`). Reenvio/supersede invalida o anterior (revogação real,
   coisa que HMAC stateless não permite — ver Design Técnico).
4. **Expiração derivada**: `expiresAt < now` com status pendente é exibido
   como `EXPIRADO` (função pura `effectiveStatus`) — **sem cron job**.
   O status persistido `EXPIRADO` é usado apenas para supersede/cancelamento.
5. **Visibilidade do conteúdo**: lista (metadados: modelo, status, datas) é
   visível a quem tem feature `forms` ≥ READ e acesso ao paciente; o
   **conteúdo** da resposta é visível ao ADMIN e ao PROFESSIONAL que seja o
   profissional de referência do paciente ou o autor do envio.
6. **Tenant**: toda query escopada por `clinicId`; `templateId`/`patientId`
   recebidos no body são validados contra a clínica do usuário.
7. **Responsável por menores**: o título da página pública usa o nome do
   paciente; o texto de abertura cobre o caso responsável
   ("Preencha sobre o paciente {{patientName}}").

### 2.5 Edge cases

| Caso | Comportamento |
|---|---|
| Paciente abandona no meio | `EM_PREENCHIMENTO` com respostas parciais retidas; retoma enquanto token válido |
| Link expirado | Tela educada de re-solicitação; GET público retorna 410 |
| Token inválido/revogado | 404 genérico ("Link inválido") — sem distinguir de inexistente |
| Envio duplicado do mesmo modelo | Pendente anterior → `EXPIRADO`; novo envio criado |
| Modelo desativado com envios pendentes | Links continuam válidos (a versão é imutável); apenas novos envios são bloqueados |
| Versão publicada depois de um envio | Resposta segue renderizando contra a versão respondida |
| Resposta concluída | PATCH/POST públicos retornam 409 ("Formulário já enviado") |
| Campo condicional escondido com resposta antiga | `validateSubmission` ignora campos invisíveis; `sanitizeAnswers` descarta respostas de campos não visíveis no submit |
| Paciente sem profissional de referência e envio feito por ADMIN sem perfil | Todo não é criado; notificação e-mail vai para admins |
| WhatsApp (provider mock) | Registro criado como SENT-mock; UI sempre oferece **"Copiar link"** como canal garantido |

### 2.6 Copy pt-BR (chaves principais)

- Página/menu: **"Formulários"**
- Botões: "Novo formulário", "Adicionar modelos prontos", "Salvar rascunho",
  "Publicar", "Enviar formulário", "Reenviar link", "Copiar link",
  "Cancelar envio", "Baixar PDF", "Desativar modelo"
- Status (chips): `ENVIADO` → "Enviado", `EM_PREENCHIMENTO` → "Em preenchimento",
  `CONCLUIDO` → "Concluído", `EXPIRADO` → "Expirado"
- Validações públicas: "Campo obrigatório", "Data inválida (use DD/MM/AAAA)",
  "Selecione uma opção", "É necessário aceitar para continuar"
- Toasts: "Formulário enviado para {nome}", "Link copiado",
  "Versão {n} publicada", "Rascunho salvo", "Modelo desativado"
- Todo: "Formulário respondido — {{patientName}}"
- Mensagem FORM_REQUEST (WhatsApp/e-mail): `Olá, {{patientName}}! A
  {{clinicName}} pede que você preencha o formulário "{{formName}}".
  Acesse: {{formLink}} (válido até {{expiryDate}}).`

### 2.7 Biblioteca seed (cópias editáveis, pt-BR)

1. **Anamnese adulto** — identificação, queixa principal, histórico de saúde,
   medicações, histórico familiar, sono, escala 0–10 de sofrimento atual;
2. **Anamnese infantil** — gestação/parto, desenvolvimento, escola, rotina,
   comportamento, histórico médico (preenchida pelo responsável);
3. **Termo LGPD** — bloco `info_consent` com o texto de consentimento +
   aceite, campos de confirmação de nome/data;
4. **Check-in pré-sessão** — escala 0–10 de humor, "algo importante desde a
   última sessão?" (long_text), yes_no sobre medicação.

"Adicionar modelos prontos" cria cópias na clínica como **rascunhos**
(a clínica revisa e publica).

---

## 3. Design Técnico

### 3.1 Schema Prisma (mudanças exatas)

Novos enums:

```prisma
enum FormResponseStatus {
  ENVIADO
  EM_PREENCHIMENTO
  CONCLUIDO
  EXPIRADO
}

enum FormSentVia {
  WHATSAPP
  EMAIL
  LINK
}
```

Adicionar valores ao enum existente `NotificationType`:

```prisma
enum NotificationType {
  // ... valores existentes ...
  FORM_REQUEST
  FORM_COMPLETED
}
```

Novos modelos (todos com `clinicId` + índices de tenant):

```prisma
/// Modelo de formulário (anamnese/questionário). Excluir = desativar.
model FormTemplate {
  id                       String  @id @default(cuid())
  clinicId                 String
  name                     String
  description              String?
  isActive                 Boolean @default(true)
  /// Envia automaticamente ao aprovar uma IntakeSubmission
  autoSendOnIntakeApproval Boolean @default(false)
  /// Rascunho de trabalho (FormField[] validado por zod em src/lib/forms/schema.ts)
  draftFields              Json    @default("[]")
  createdByUserId          String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic    Clinic        @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  createdBy User?         @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)
  versions  FormVersion[]

  @@index([clinicId, isActive])
  @@index([clinicId])
}

/// Snapshot imutável publicado de um FormTemplate. Nunca é editado nem deletado.
model FormVersion {
  id          String   @id @default(cuid())
  clinicId    String
  templateId  String
  version     Int
  /// FormField[] congelado no momento da publicação
  fields      Json
  publishedAt DateTime @default(now())
  createdAt   DateTime @default(now())

  clinic    Clinic         @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  template  FormTemplate   @relation(fields: [templateId], references: [id], onDelete: Cascade)
  responses FormResponse[]

  @@unique([templateId, version])
  @@index([clinicId])
  @@index([templateId])
}

/// Envio de formulário a um paciente + respostas. Imutável após CONCLUIDO.
model FormResponse {
  id                    String             @id @default(cuid())
  clinicId              String
  patientId             String
  formVersionId         String
  /// Profissional responsável (recebe o Todo na conclusão)
  professionalProfileId String?
  sentByUserId          String?
  status                FormResponseStatus @default(ENVIADO)
  /// Record<fieldId, string | string[] | number | boolean>
  answers               Json               @default("{}")
  sentVia               FormSentVia
  sentAt                DateTime           @default(now())
  expiresAt             DateTime
  startedAt             DateTime?
  completedAt           DateTime?
  /// SHA-256 hex do token público — o token em si nunca é persistido
  tokenHash             String             @unique

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic              Clinic               @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  patient             Patient              @relation(fields: [patientId], references: [id], onDelete: Cascade)
  formVersion         FormVersion          @relation(fields: [formVersionId], references: [id], onDelete: Restrict)
  professionalProfile ProfessionalProfile? @relation(fields: [professionalProfileId], references: [id], onDelete: SetNull)
  sentBy              User?                @relation(fields: [sentByUserId], references: [id], onDelete: SetNull)

  @@index([clinicId, patientId])
  @@index([clinicId, status])
  @@index([patientId])
  @@index([formVersionId])
  @@index([professionalProfileId])
}
```

Relações a acrescentar em modelos existentes:

- `Clinic`: `formTemplates FormTemplate[]`, `formVersions FormVersion[]`,
  `formResponses FormResponse[]`
- `User`: `formTemplatesCreated FormTemplate[]`, `formResponsesSent FormResponse[]`
- `Patient`: `formResponses FormResponse[]`
- `ProfessionalProfile`: `formResponses FormResponse[]`

**Decisões de modelagem**
- `clinicId` denormalizado em `FormVersion`/`FormResponse` (padrão do projeto,
  cf. `PatientPhone`) para escopo de tenant direto em qualquer query.
- `FormResponse.formVersionId` com `onDelete: Restrict`: respostas tornam a
  versão indeletável — imutabilidade garantida no banco.
- Rascunho mora em `FormTemplate.draftFields` (mutável); `FormVersion` é
  sempre publicado e congelado. Evita versões "meio-publicadas".
- `EXPIRADO` persistido = revogação explícita (supersede/cancelar); expiração
  por tempo é **derivada** via `effectiveStatus()` — sem cron.

### 3.2 Migração (NUNCA `db push` / `migrate dev`)

Criar `prisma/migrations/20260611000000_add_form_builder/migration.sql`
manualmente com:

```sql
-- Enums
CREATE TYPE "FormResponseStatus" AS ENUM ('ENVIADO', 'EM_PREENCHIMENTO', 'CONCLUIDO', 'EXPIRADO');
CREATE TYPE "FormSentVia" AS ENUM ('WHATSAPP', 'EMAIL', 'LINK');
ALTER TYPE "NotificationType" ADD VALUE 'FORM_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'FORM_COMPLETED';

-- Tabelas
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoSendOnIntakeApproval" BOOLEAN NOT NULL DEFAULT false,
    "draftFields" JSONB NOT NULL DEFAULT '[]',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormVersion" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "formVersionId" TEXT NOT NULL,
    "professionalProfileId" TEXT,
    "sentByUserId" TEXT,
    "status" "FormResponseStatus" NOT NULL DEFAULT 'ENVIADO',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "sentVia" "FormSentVia" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX "FormTemplate_clinicId_isActive_idx" ON "FormTemplate"("clinicId", "isActive");
CREATE INDEX "FormTemplate_clinicId_idx" ON "FormTemplate"("clinicId");
CREATE UNIQUE INDEX "FormVersion_templateId_version_key" ON "FormVersion"("templateId", "version");
CREATE INDEX "FormVersion_clinicId_idx" ON "FormVersion"("clinicId");
CREATE INDEX "FormVersion_templateId_idx" ON "FormVersion"("templateId");
CREATE UNIQUE INDEX "FormResponse_tokenHash_key" ON "FormResponse"("tokenHash");
CREATE INDEX "FormResponse_clinicId_patientId_idx" ON "FormResponse"("clinicId", "patientId");
CREATE INDEX "FormResponse_clinicId_status_idx" ON "FormResponse"("clinicId", "status");
CREATE INDEX "FormResponse_patientId_idx" ON "FormResponse"("patientId");
CREATE INDEX "FormResponse_formVersionId_idx" ON "FormResponse"("formVersionId");
CREATE INDEX "FormResponse_professionalProfileId_idx" ON "FormResponse"("professionalProfileId");

-- FKs
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "FormVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Aplicar localmente com `npx prisma migrate deploy` (na branch/worktree da
feature, com o banco isolado da feature). Em produção a Vercel roda
`prisma migrate deploy` no build.

> Nota PG: `ALTER TYPE ... ADD VALUE` só não pode ser **usado** na mesma
> transação; como a migração apenas adiciona os valores, é segura.

### 3.3 Módulo de domínio `src/lib/forms/`

Funções **puras** (sem framework), barrel `index.ts`, testes colocados.
Cada arquivo < 200 linhas.

```
src/lib/forms/
├── index.ts            # barrel
├── types.ts            # tipos + labels pt-BR
├── schema.ts           # zod do FormField[] (estrutura do formulário)
├── visibility.ts       # lógica condicional
├── validation.ts       # validação de respostas (pt-BR)
├── progress.ts         # progresso do preenchimento
├── status.ts           # status efetivo + labels
├── versioning.ts       # publicação/numeração de versões
├── tokens.ts           # geração/hash de token público
├── todo-assignee.ts    # resolução do responsável pelo Todo
├── seed-library.ts     # biblioteca seed pt-BR (dados, sem I/O)
└── send-form.ts        # serviço de envio (usa prisma + notificações; padrão notification-service)
```

Assinaturas:

```ts
// types.ts
export type FormFieldType =
  | "section" | "short_text" | "long_text" | "single_choice"
  | "multiple_choice" | "dropdown" | "scale_0_10" | "date"
  | "yes_no" | "info_consent"

export interface FormField {
  id: string                 // estável dentro do template (nanoid)
  type: FormFieldType
  label: string
  description?: string
  required?: boolean
  options?: string[]         // single_choice | multiple_choice | dropdown
  infoText?: string          // info_consent (texto somente leitura)
  visibleWhen?: { fieldId: string; equals: string | number | boolean }
}

export type AnswerValue = string | string[] | number | boolean
export type FormAnswers = Record<string, AnswerValue>
export const FIELD_TYPE_LABELS: Record<FormFieldType, string> // pt-BR

// schema.ts (zod)
export const formFieldSchema: z.ZodType<FormField>
export function validateFields(input: unknown):
  | { ok: true; fields: FormField[] }
  | { ok: false; error: string }
// regras: ids únicos; options não-vazio para tipos de escolha;
// visibleWhen.fieldId referencia campo ANTERIOR existente; labels não-vazios.

// visibility.ts
export function isFieldVisible(field: FormField, answers: FormAnswers): boolean
export function getVisibleFields(fields: FormField[], answers: FormAnswers): FormField[]

// validation.ts
export function validateAnswer(field: FormField, value: AnswerValue | undefined): string | null
export function validateSubmission(fields: FormField[], answers: FormAnswers):
  { valid: boolean; errors: Record<string, string> }   // só campos visíveis
export function sanitizeAnswers(fields: FormField[], answers: FormAnswers): FormAnswers
// descarta ids desconhecidos, respostas de campos invisíveis e tipos errados

// progress.ts
export function computeProgress(fields: FormField[], answers: FormAnswers):
  { answered: number; total: number; percent: number }  // ignora "section"

// status.ts
export function effectiveStatus(
  r: { status: FormResponseStatus; expiresAt: Date }, now: Date
): FormResponseStatus      // pendente + expirado por data → "EXPIRADO"
export const FORM_STATUS_LABELS: Record<FormResponseStatus, string> // pt-BR

// versioning.ts
export function canPublish(fields: FormField[]): { ok: boolean; error?: string }
// exige ≥ 1 campo respondível (não-section)
export function nextVersion(versions: Array<{ version: number }>): number
export function hasUnpublishedChanges(draft: FormField[], latest: FormField[] | null): boolean

// tokens.ts
export function generateFormToken(): { token: string; tokenHash: string }
// token = 32 bytes randomBytes base64url; tokenHash = sha256 hex
export function hashFormToken(token: string): string
export function buildFormUrl(baseUrl: string, token: string): string  // `${baseUrl}/f/${token}`

// todo-assignee.ts
export function resolveTodoAssignee(input: {
  patientReferenceProfessionalId: string | null
  responseProfessionalProfileId: string | null
}): string | null

// send-form.ts (serviço com prisma — análogo a notifications/notification-service.ts)
export async function sendFormToPatient(params: {
  clinicId: string
  templateId: string
  patientId: string
  sentByUserId: string | null
  professionalProfileId: string | null
  sentVia: FormSentVia
  expiresInDays?: number      // default 14
  baseUrl: string
}): Promise<{ response: FormResponse; formUrl: string }>
// 1) valida template ativo + última FormVersion publicada (escopo clinicId)
// 2) valida patient pertence à clínica
// 3) supersede: updateMany respostas pendentes do mesmo template+patient → EXPIRADO
// 4) generateFormToken(); cria FormResponse
// 5) se sentVia WHATSAPP/EMAIL: createAndSendNotification(FORM_REQUEST) com {{formLink}}
// 6) retorna URL (para "Copiar link")
```

**Decisão — token armazenado vs HMAC stateless**: os links de consulta usam
HMAC puro (`appointments/appointment-links.ts`) porque não precisam de
revogação. Formulários exigem **retomar preenchimento, supersede e reenvio
com invalidação do link anterior** — isso requer estado no servidor. Mantemos
a mesma postura de segurança (link não-adivinhável, expiração) trocando HMAC
por token aleatório de 256 bits com somente o hash persistido (igual a
reset-password tokens). URL não carrega IDs internos (anti-enumeração).

### 3.4 RBAC

`src/lib/rbac/types.ts`:
- `FEATURES`: adicionar `"forms"`;
- `FEATURE_LABELS`: `forms: "Formulários"`.

`src/lib/rbac/permissions.ts` (`ROLE_DEFAULTS`):
- `ADMIN.forms = "WRITE"`;
- `PROFESSIONAL.forms = "WRITE"` (profissionais criam suas próprias anamneses;
  clínicas restritivas usam override por usuário via `UserPermission`).

`src/lib/rbac/audit.ts` (`AuditAction`): adicionar
`FORM_TEMPLATE_CREATED`, `FORM_TEMPLATE_UPDATED`, `FORM_TEMPLATE_PUBLISHED`,
`FORM_TEMPLATE_DEACTIVATED`, `FORM_SENT`, `FORM_RESEND`,
`FORM_CANCELLED`, `FORM_RESPONSE_COMPLETED`.

### 3.5 Rotas API

Todas as rotas autenticadas usam `withFeatureAuth` e **se auto-escopam por
`user.clinicId`**; FKs vindos do body (`templateId`, `patientId`,
`professionalProfileId`) são validados via helpers de
`src/lib/clinic/ownership.ts` antes de qualquer escrita (convenção de
isolamento de tenant do projeto). Esse helper é introduzido pelo plano
`2026-06-11-001-feat-prontuario-eletronico` (`assertPatientInClinic`,
`assertProfessionalInClinic`, `OwnershipError` → rotas respondem **404**,
nunca 403, para não vazar existência entre tenants). **Se ainda não existir
no repo quando esta feature for implementada, criá-lo aqui com a mesma API**
e acrescentar `assertFormTemplateInClinic(clinicId, templateId)` — todos
implementados como `findFirst({ where: { id, clinicId } })`.
Handlers finos (< 50 linhas de lógica inline) — orquestração em `src/lib/forms/`.

**Autenticadas — templates**

| Rota | Método | Auth | Request → Response |
|---|---|---|---|
| `/api/forms/templates` | GET | `forms` READ | → `{ templates: [{ id, name, description, isActive, autoSendOnIntakeApproval, latestVersion, hasUnpublishedChanges, responseCounts: { total, concluidos } }] }` (where `clinicId`) |
| `/api/forms/templates` | POST | `forms` WRITE | `{ name, description? }` → 201 `{ template }` (cria com `draftFields: []`, `createdByUserId: user.id`; audit `FORM_TEMPLATE_CREATED`) |
| `/api/forms/templates/seed` | POST | `forms` WRITE | → 201 `{ created: number }` (copia `SEED_TEMPLATES` como rascunhos; pula nomes já existentes na clínica) |
| `/api/forms/templates/[id]` | GET | `forms` READ | → `{ template, draftFields, versions: [{ id, version, publishedAt }] }` (`findFirst({ id, clinicId })`, 404 se de outra clínica) |
| `/api/forms/templates/[id]` | PATCH | `forms` WRITE | `{ name?, description?, draftFields?, autoSendOnIntakeApproval?, isActive? }` → `{ template }`; `draftFields` passa por `validateFields` (400 com mensagem pt-BR); audit `FORM_TEMPLATE_UPDATED`/`_DEACTIVATED` |
| `/api/forms/templates/[id]` | DELETE | `forms` WRITE | → soft delete `isActive=false` (audit `FORM_TEMPLATE_DEACTIVATED`) |
| `/api/forms/templates/[id]/publish` | POST | `forms` WRITE | → 201 `{ version }`; valida `canPublish(draftFields)`; `nextVersion`; cria `FormVersion`; audit `FORM_TEMPLATE_PUBLISHED` |

**Autenticadas — respostas**

| Rota | Método | Auth | Request → Response |
|---|---|---|---|
| `/api/forms/responses?patientId=` | GET | `forms` READ | → `{ responses: [{ id, templateName, version, status (efetivo), sentVia, sentAt, expiresAt, completedAt, professionalName }] }` — metadados apenas; where `{ clinicId, patientId }` com `patientId` validado na clínica |
| `/api/forms/responses` | POST | `forms` WRITE | `{ templateId, patientId, sentVia, expiresInDays? }` → 201 `{ response, formUrl }` via `sendFormToPatient`; audit `FORM_SENT` |
| `/api/forms/responses/[id]` | GET | `forms` READ | → `{ response, fields, answers, patient: { id, name } }`. **Regra de conteúdo**: ADMIN → ok; PROFESSIONAL → ok se `user.professionalProfileId` ∈ {referência do paciente, `response.professionalProfileId`}, senão 403 |
| `/api/forms/responses/[id]/resend` | POST | `forms` WRITE | `{ sentVia?, expiresInDays? }` → `{ formUrl }`; regenera token, estende `expiresAt`, status volta a `ENVIADO` se pendente/expirado; 409 se `CONCLUIDO`; audit `FORM_RESEND` |
| `/api/forms/responses/[id]/cancel` | POST | `forms` WRITE | → `{ response }` status `EXPIRADO`; 409 se `CONCLUIDO`; audit `FORM_CANCELLED` |
| `/api/forms/responses/[id]/pdf` | GET | `forms` READ | → `application/pdf` (mesma regra de visibilidade do GET; `renderToBuffer` de `@react-pdf/renderer`, padrão das rotas NFS-e em `src/app/api/financeiro/faturas/.../pdf/route.ts`) |

**Públicas** (`src/app/api/public/forms/[token]/route.ts` — sem auth, com
`checkRateLimit` + `RATE_LIMIT_CONFIGS.publicApi`, padrão de
`src/app/api/public/intake/[slug]/route.ts`):

| Método | Comportamento |
|---|---|
| GET | `hashFormToken(token)` → `findUnique({ tokenHash })` incluindo `formVersion` + `patient.name` + `clinic { name, logoUrl }`. 404 token inexistente; 410 + `{ expired: true }` se `effectiveStatus` = EXPIRADO; 409 + `{ completed: true }` se CONCLUIDO. → `{ clinicName, hasLogo, patientFirstName, formName, fields, answers, progress }` |
| PATCH (autosave) | body `{ answers }` → `sanitizeAnswers` + `validateAnswer` por campo enviado (parcial); merge em `answers`; status → `EM_PREENCHIMENTO`, `startedAt ??= now`. Mesmos 404/410/409. → `{ progress }` |
| POST (submit) | `validateSubmission` completo (400 com `errors` pt-BR); `sanitizeAnswers`; status `CONCLUIDO`, `completedAt=now`; cria Todo (`resolveTodoAssignee` → `prisma.todo.create({ clinicId, professionalProfileId, title, day: hoje })`, pulado se null); notificação `FORM_COMPLETED` (e-mail ao profissional responsável; fallback admins, padrão `notifyClinicAdmins` do intake); `createAuditLog` com `FORM_RESPONSE_COMPLETED` (userId null). → `{ message: "Respostas enviadas com sucesso" }` |

A página pública nunca recebe IDs internos (`patientId`, `clinicId`) — só
dados de exibição.

### 3.6 Notificações

`prisma/schema.prisma` enum + `src/lib/notifications/templates.ts`:
- `TemplateVariables`: adicionar `formName?`, `formLink?`, `expiryDate?`;
- `TEMPLATE_VARIABLES`: entradas pt-BR para os três;
- `DEFAULT_TEMPLATES`: `FORM_REQUEST` (WHATSAPP + EMAIL) e `FORM_COMPLETED`
  (EMAIL) com a copy da seção 2.6.

`src/lib/notifications/notification-service.ts`:
- `ALWAYS_ENABLED_EMAIL_TYPES`: adicionar `FORM_REQUEST` e `FORM_COMPLETED`
  (envios explícitos iniciados pelo usuário + notificação interna de staff —
  não dependem do flag `appointmentNotificationsEnabled`).

WhatsApp continua mock: o registro fica SENT-mock; por isso o dialog de envio
sempre exibe o link para **copiar** após o envio.

### 3.7 Integração com aprovação de intake

`src/app/api/intake-submissions/[id]/route.ts` (branch `approve`, após criar
o `Patient`): buscar
`formTemplate.findMany({ where: { clinicId, isActive: true, autoSendOnIntakeApproval: true } })`
e, para cada um com versão publicada, chamar `sendFormToPatient` com
`sentVia: "EMAIL"` (e-mail da submission), `sentByUserId: user.id`,
`professionalProfileId: patient.referenceProfessionalId`. Falha de envio não
pode falhar a aprovação (try/catch + `console.error`, padrão do
`notifyClinicAdmins` do intake). Extrair para helper se a rota passar do
limite de linhas.

### 3.8 UI

**Novas páginas/componentes**

```
src/app/formularios/
├── page.tsx                         # lista de modelos (gate usePermission("forms"))
├── [id]/page.tsx                    # editor (builder)
├── respostas/[id]/page.tsx          # visualização read-only da resposta + Baixar PDF
└── components/
    ├── TemplateList.tsx             # tabela: nome, versão, status, contagens, ações
    ├── NewTemplateDialog.tsx        # react-hook-form + zod
    ├── FieldList.tsx                # dnd-kit sortable (drag-to-order; requer instalar @dnd-kit/sortable — ver nota abaixo)
    ├── FieldEditor.tsx              # painel de edição do campo selecionado
    ├── FieldTypePicker.tsx          # "Adicionar campo" com FIELD_TYPE_LABELS
    ├── ConditionEditor.tsx          # visibleWhen (campo anterior + valor)
    ├── MobilePreview.tsx            # preview ao vivo (reusa FieldInput público)
    ├── PublishBar.tsx               # Salvar rascunho / Publicar / badge alterações
    ├── SendFormDialog.tsx           # modelo + canal + validade (reusado na ficha do paciente)
    ├── ResponseStatusChip.tsx       # chips com FORM_STATUS_LABELS
    └── ResponseView.tsx             # render read-only pergunta→resposta
src/app/f/[token]/
├── page.tsx                         # página pública mobile-first
└── components/
    ├── FillForm.tsx                 # orquestra GET inicial + autosave PATCH + submit POST
    ├── FieldInput.tsx               # render por tipo (date mascarado DD/MM/AAAA, escala, etc.)
    ├── ProgressHeader.tsx           # logo + barra de progresso + aviso LGPD
    ├── ExpiredScreen.tsx            # tela de link expirado
    └── DoneScreen.tsx               # tela de sucesso
src/lib/forms/pdf/ResponsePdf.tsx    # documento @react-pdf/renderer (servidor)
```

**Arquivos existentes alterados**

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | seção 3.1 |
| `src/lib/rbac/types.ts` / `permissions.ts` / `audit.ts` | seção 3.4 |
| `src/lib/notifications/templates.ts` / `notification-service.ts` | seção 3.6 |
| `src/app/api/intake-submissions/[id]/route.ts` | seção 3.7 |
| `src/app/patients/components/PatientDetailsView.tsx` | nova seção "Formulários" (lista via `GET /api/forms/responses?patientId=` + `SendFormDialog`); se o arquivo estourar tamanho, extrair `PatientFormsSection.tsx` |
| `src/shared/components/ui/sidebar-nav.tsx`, `desktop-header.tsx`, `bottom-navigation.tsx` | item de navegação "Formulários" (ícone `ClipboardList` do lucide), visível com `usePermission("forms").canRead`; em `sidebar-nav.tsx` adicionar também `"/f"` ao array `publicPaths` (~linha 291) |
| `src/shared/components/ui/app-shell.tsx` | adicionar `"/f"` a `PUBLIC_PATHS` (o comentário do arquivo exige espelhar `sidebar-nav.tsx`) |

**Dependência nova**: o projeto tem `@dnd-kit/core`, `@dnd-kit/modifiers` e
`@dnd-kit/utilities` (agenda), mas **não** `@dnd-kit/sortable`. Rodar
`npm install @dnd-kit/sortable` na etapa do builder (mesma família/versão dos
pacotes já instalados).

**Regras de frontend** (obrigatórias): zero `useEffect` cru — fetch inicial
da página pública via server component ou `useMountEffect`; autosave por
**event handler** (onBlur/onChange com debounce em handler, não effect);
reset do editor por `key={templateId}`; datas com input texto mascarado;
react-hook-form + zod nos dialogs; toasts Sonner; tudo pt-BR.

### 3.9 Cron / vercel.json

**Nenhuma mudança.** Expiração é derivada em leitura (`effectiveStatus`),
eliminando o job de expiração que o spec sugeria — menos infraestrutura e
nenhuma janela de inconsistência entre cron e leitura.

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`; enums
Prisma como string literais.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/forms/schema.test.ts` | aceita formulário válido; rejeita ids duplicados; rejeita choice sem `options`; rejeita `visibleWhen` apontando para campo inexistente ou posterior; rejeita label vazio; aceita `info_consent` com `infoText` |
| `src/lib/forms/visibility.test.ts` | campo sem `visibleWhen` sempre visível; visível quando resposta `equals` casa (string/number/boolean); invisível quando não casa ou sem resposta; cadeia: campo condicionado a campo ele próprio invisível fica invisível |
| `src/lib/forms/validation.test.ts` | required vazio → "Campo obrigatório"; data inválida/`31/02/2026` → mensagem pt-BR; data válida `DD/MM/YYYY` passa; scale fora de 0–10 falha; `multiple_choice` com opção desconhecida falha; `info_consent` required exige `true`; `validateSubmission` ignora campos invisíveis; `sanitizeAnswers` descarta ids desconhecidos e respostas de campos invisíveis |
| `src/lib/forms/progress.test.ts` | ignora `section`; conta apenas visíveis; 0% sem respostas; 100% completo; percent arredondado |
| `src/lib/forms/status.test.ts` | `ENVIADO` não expirado → `ENVIADO`; `ENVIADO`/`EM_PREENCHIMENTO` com `expiresAt` passado → `EXPIRADO`; `CONCLUIDO` nunca vira expirado; `EXPIRADO` persiste; labels pt-BR completos |
| `src/lib/forms/versioning.test.ts` | `canPublish` falha com lista vazia ou só sections; `nextVersion([])` = 1; `nextVersion` usa max+1; `hasUnpublishedChanges` true/false/sem versão publicada |
| `src/lib/forms/tokens.test.ts` | token ≥ 43 chars url-safe; `hashFormToken(token) === tokenHash`; dois tokens nunca iguais; `buildFormUrl` monta `/f/{token}` |
| `src/lib/forms/todo-assignee.test.ts` | preferência: referência do paciente > profissional do envio > null |
| `src/lib/forms/seed-library.test.ts` | os 4 modelos seed passam `validateFields` e `canPublish`; nomes únicos; copy pt-BR (sanity: contém "Anamnese", "LGPD") |
| `src/lib/rbac/permissions.test.ts` (estender) | `forms` presente em FEATURES; defaults ADMIN=WRITE, PROFESSIONAL=WRITE; override NONE respeitado |
| `src/lib/notifications/templates.test.ts` (estender) | `DEFAULT_TEMPLATES` contém FORM_REQUEST (2 canais) e FORM_COMPLETED; `renderTemplate` substitui `{{formLink}}`, `{{formName}}`, `{{expiryDate}}` |

Antes de cada commit: `npx prisma generate && npm run test && npm run build`.

---

## 5. Etapas de Implementação

Cada etapa termina com build + testes verdes; commits convencionais locais
(ex.: `feat(forms): ...`), terminando com
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. **Nunca `git push`.**

1. **Worktree + banco isolado** — `bash scripts/new-feature.sh anamnese-form-builder`;
   trabalhar em `../clinica-anamnese-form-builder`. Confirmar `.env` local.
2. **Schema + migração** — editar `prisma/schema.prisma` (seção 3.1), criar
   `prisma/migrations/20260611000000_add_form_builder/migration.sql` (seção 3.2),
   `npx prisma migrate deploy` no banco da feature, `npx prisma generate`.
   Verificar: `npm run build` passa.
3. **Domínio puro** — `src/lib/forms/{types,schema,visibility,validation,progress,status,versioning,tokens,todo-assignee,seed-library,index}.ts`
   + todos os testes da seção 4. Verificar: `npm run test`.
4. **RBAC** — feature `forms` em `types.ts`/`permissions.ts`, novas
   `AuditAction`. Estender testes de permissions. Verificar: tela de
   permissões de usuário exibe "Formulários" automaticamente (deriva de
   FEATURES/FEATURE_LABELS).
5. **Notificações** — enum `NotificationType` (já criado na etapa 2),
   variáveis + `DEFAULT_TEMPLATES` em `templates.ts`,
   `ALWAYS_ENABLED_EMAIL_TYPES` no service. Estender testes de templates.
6. **Serviço de envio** — `src/lib/forms/send-form.ts` (supersede + token +
   notificação). Verificar com teste manual via Prisma Studio depois da etapa 7.
7. **Rotas de templates** — `/api/forms/templates*` (GET/POST/PATCH/DELETE,
   `seed`, `publish`) com `withFeatureAuth` + escopo `clinicId` + audit.
   Verificar com curl autenticado: criar, salvar rascunho inválido (400
   pt-BR), publicar, listar.
8. **Rotas de respostas** — `/api/forms/responses*` (list, send, detail com
   regra de visibilidade, resend, cancel). Verificar: enviar para paciente de
   outra clínica → 404; profissional sem vínculo lendo conteúdo → 403.
9. **Rotas públicas + página `/f/[token]`** — GET/PATCH/POST públicos com
   rate limit; página mobile-first com autosave, progresso, condicionais,
   telas de expirado/concluído; `/f/` nas rotas públicas do `app-shell`.
   Verificar manualmente: fluxo completo enviar → preencher parcial → fechar
   → reabrir (retomou) → submeter → Todo criado + notificação registrada.
10. **Builder UI** — `npm install @dnd-kit/sortable` (core/modifiers/utilities
    já instalados); `/formularios` (lista + seed) e `/formularios/[id]`
    (FieldList dnd-kit, FieldEditor, ConditionEditor, MobilePreview,
    PublishBar). Item de navegação nos 3 navs. Verificar: criar modelo do
    zero, arrastar ordem, publicar v1, editar e ver badge de não publicado.
11. **Ficha do paciente + viewer + PDF** — seção "Formulários" no
    `PatientDetailsView`, `SendFormDialog`, página
    `/formularios/respostas/[id]`, rota PDF com `ResponsePdf`. Verificar:
    resposta concluída renderiza contra a versão respondida mesmo após nova
    publicação; PDF baixa com pergunta→resposta.
12. **Integração intake** — auto-envio na aprovação (seção 3.7) + toggle
    "Enviar automaticamente ao aprovar ficha de cadastro" no editor do
    modelo. Verificar: aprovar uma submission cria `FormResponse` e
    notificação; falha de envio não bloqueia aprovação.
13. **Gates finais** — `npx prisma generate && npm run test && npm run build`;
    revisão de tamanho de arquivos (< 200 linhas); smoke test completo dos
    fluxos; commits locais organizados por etapa.

---

## 6. Riscos e Questões em Aberto

### Riscos

| Risco | Mitigação |
|---|---|
| **JSON `fields`/`answers` sem validação no banco** | toda escrita passa por `validateFields`/`sanitizeAnswers`; leituras no render usam `validateFields` defensivo (template corrompido → erro amigável, nunca crash) |
| **Dados sensíveis de saúde em `answers` (LGPD)** | acesso ao conteúdo restrito (seção 3.5); aviso explícito ao paciente; auditoria de conclusão; tokens não-enumeráveis com hash; rate limit nas rotas públicas |
| **WhatsApp ainda é mock** | canal "Copiar link" sempre disponível e exibido após envio; e-mail funcional via Resend |
| **Autosave público = endpoint de escrita sem auth** | token de 256 bits + rate limit por IP + payload limitado (zod com tamanhos máximos) + escrita restrita à própria response do token |
| **`PatientDetailsView.tsx` (16K) e `patients/page.tsx` (604 linhas) já são grandes** | nova UI entra como componente extraído (`PatientFormsSection`), nunca inline |
| **`ALTER TYPE ADD VALUE` em migração** | migração só adiciona valores, não os usa na mesma transação — seguro no PG ≥ 12 (Neon) |
| **Builder XL pode estourar escopo** | domínio puro + APIs (etapas 2–9) entregam valor mesmo se a UI do builder atrasar (modelos seed prontos cobrem o caso básico) |

### Questões em aberto

1. **Visibilidade para ADMIN**: o spec sugere "admins veem só metadados
   (configurável)" alinhado ao futuro prontuário. Hoje ADMIN tem acesso
   clínico total no produto (paridade com `patients`), então o v1 permite
   conteúdo para ADMIN. Quando `prontuario-eletronico` existir, adicionar
   flag de clínica (ex.: `formsAdminContentAccess`) e alinhar a regra.
2. **Arquivamento via anexos-paciente**: o módulo `anexos-paciente` ainda não
   existe no código. O v1 entrega visualização + download de PDF sob demanda;
   o arquivamento automático do PDF fica para quando o módulo de anexos for
   construído (a rota `/pdf` já isola a geração, facilitando o acoplamento futuro).
3. **Envio em massa** ("bulk"): fora do v1. O `sendFormToPatient` já aceita
   chamadas em loop; uma UI de seleção múltipla de pacientes pode vir depois.
4. **Limite por plano SaaS**: formulários deveriam ser gated por plano
   (ex.: nº de modelos no plano básico)? Há infraestrutura em
   `src/lib/subscription/limits` — decidir com produto antes do lançamento.
5. **Replatform do intake fixo**: manter `IntakeSubmission` intocado agora;
   avaliar migração para o motor de formulários num ciclo futuro.
6. **Rich text no `info_consent`**: v1 usa texto puro com quebras de linha
   (sem markdown/HTML) para evitar sanitização de HTML em página pública.

### Referências internas (para o desenvolvedor)

- Fluxo público existente: `src/app/api/public/intake/[slug]/route.ts`, `src/app/intake/[slug]/`
- HMAC links (referência de postura): `src/lib/appointments/appointment-links.ts`
- Notificações: `src/lib/notifications/notification-service.ts`, `templates.ts`
- Auth de rotas: `src/lib/api/with-auth.ts` (`withFeatureAuth`)
- RBAC: `src/lib/rbac/{types,permissions,audit}.ts`
- Todos: modelo `Todo` (assignee = `professionalProfileId`, `day @db.Date`)
- PDF servidor: `src/app/api/financeiro/faturas/[id]/nfse/pdf/route.ts` (`renderToBuffer`)
- Rate limit: `src/lib/rate-limit.ts` (`RATE_LIMIT_CONFIGS.publicApi`)
- Drag-and-drop: `@dnd-kit/core`/`modifiers`/`utilities` já em uso na agenda; `@dnd-kit/sortable` precisa ser instalado para o builder
- Plano de estilo/checklist: `docs/plans/2026-05-05-001-feat-pending-intake-alert-plan.md`
