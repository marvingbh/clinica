---
title: "feat: AI-assisted evolução drafting (geração de rascunho de evolução com IA)"
type: feat
slug: ai-evolucao
status: planned
date: 2026-06-11
priority: 8
complexity: L
depends_on:
  - prontuario-eletronico (ClinicalNote / NoteTemplate — plano irmão, ver "Contrato com o prontuário" abaixo)
  - subscription limits module (src/lib/subscription)
  - superadmin Plan model
  - AuditLog
---

# feat: AI-assisted evolução drafting (ai-evolucao)

Gerar rascunhos de evolução clínica no padrão CFP a partir de anotações brutas do
profissional, dentro do editor de prontuário — **review-first, nunca assinado
automaticamente**. Provider de LLM server-side (Anthropic, já dependência do
projeto), pseudonimização LGPD antes de qualquer chamada externa, créditos
mensais por plano SaaS, medição via novo modelo `AiUsage`.

---

## 1. Contexto de Negócio

### Problema

Documentação clínica (evolução de sessão) é a tarefa administrativa mais
demorada do psicólogo: 5–15 minutos por sessão para transformar anotações
soltas em um registro estruturado aceitável pelo CFP. Em uma agenda de 6–8
sessões/dia, isso soma ~1h diária de digitação. O profissional já tem o
conteúdo na cabeça (ou em bullets rabiscados) — falta apenas a redação no
formato correto (SOAP/DAP).

### Evidência de mercado

É a feature de destaque na homepage de praticamente todos os concorrentes
brasileiros em 2025–2026 e a principal justificativa de preço premium:

| Concorrente | Oferta |
|---|---|
| PsicoManager, Corpora, Sintropia | Geração de evolução com IA como headline |
| PsicoPlanner (PsiAssist) | Pacotes de **10 créditos/mês** por plano |
| Amplimed (Amélia) | Assistente de IA integrado ao prontuário |
| Jane App (AI Scribe) | Add-on **US$ 15/mês** |
| SimplePractice (Note Taker) | Add-on **US$ 35/mês** |
| TherapyNotes (TherapyFuel) | Add-on de IA |

A mecânica de créditos mensais por plano (espelhando o PsicoPlanner) cria um
degrau natural de upgrade entre planos no nosso modelo Stripe existente.

### Público-alvo

- **PROFESSIONAL**: usuário primário — gera o rascunho dentro do editor de nota.
- **ADMIN**: habilita a feature para a clínica (opt-in com disclosure LGPD),
  configura "contexto histórico".
- **Superadmin**: configura créditos mensais por `Plan` e acompanha consumo por clínica.
- Paciente: **não interage** com a feature (nenhuma superfície pública).

### Métricas de sucesso

1. **Adoção**: % de clínicas ativas com `aiEnabled = true` após 60 dias (meta: 30%).
2. **Uso**: gerações/profissional ativo/semana (meta: ≥ 5).
3. **Qualidade**: razão 👍/👎 no feedback por geração (meta: ≥ 80% positivo).
4. **Retenção do rascunho**: % de notas assinadas que partiram de um rascunho IA.
5. **Receita**: upgrades de plano atribuíveis ao esgotamento de créditos
   (visível no dashboard superadmin de consumo).

### Escopo v1 (e o que fica fora)

- ✅ Entrada por texto: bullets/keywords digitados **ou** transcrição colada.
- ✅ Formatos SOAP / DAP / LIVRE; hint de abordagem (TCC, psicanálise, ABA…).
- ✅ Pseudonimização, auditoria sem conteúdo, créditos por plano, feedback 👍/👎.
- ✅ Notas de sessão em grupo: geração por membro a partir de resumo compartilhado.
- ❌ Upload de áudio + transcrição → **fase 2**, atrás da mesma abstração de provider.
- ❌ Streaming token-a-token da resposta → v1 usa estado de progresso
  (resposta JSON estruturada completa; ver Decisões Técnicas).
- ❌ Gravação ambiente da sessão → evitado deliberadamente (consentimento de
  gravação é complexidade jurídica que a v1 não precisa: processamos apenas
  texto digitado pelo profissional).

---

## 2. Especificação Funcional

### 2.1 Contrato com o prontuário eletrônico (dependência)

Este plano assume que o plano irmão **prontuario-eletronico** entrega:

- Modelo `ClinicalNote` com: `id`, `clinicId`, `patientId`,
  `professionalProfileId`, `sections Json` (mapa `{ [sectionKey]: string }`),
  status `RASCUNHO | ASSINADA`, fluxo de assinatura.
- Modelo `NoteTemplate` com `format` (`SOAP | DAP | LIVRE`), lista de seções
  (`key`, `label`, ordem) e campo de metadata onde guardamos `abordagem`.
- Feature RBAC `prontuario` e um editor de nota em
  `src/app/patients/[id]/prontuario/` (ou caminho equivalente).

> **Ação do implementador:** antes de começar, confira os nomes reais no
> código do prontuário já mergeado e ajuste este plano onde divergir. O módulo
> `src/lib/ai/` foi desenhado para **não importar nada do prontuário** (opera
> sobre `format` + `sectionKeys` + texto e devolve um `SectionMap`), então
> apenas a etapa de integração de UI (Etapa 9) depende do editor existir.
> O schema usa `AiUsage.noteId String?` **sem FK Prisma** justamente para não
> acoplar a ordem das migrations dos dois planos.

### 2.2 User stories

1. Como **profissional**, digito bullets do que aconteceu na sessão, escolho o
   formato (vem do template da nota) e clico **"Gerar com IA"**; o rascunho
   preenche as seções da nota para eu revisar e editar antes de assinar.
2. Como **profissional**, colo a transcrição de um ditado e recebo o mesmo
   resultado.
3. Como **profissional**, vejo **"X gerações restantes neste mês"** e recebo um
   convite de upgrade amigável quando acabar.
4. Como **profissional**, posso marcar 👍/👎 em cada geração.
5. Como **profissional**, posso me **excluir** da feature (opt-out pessoal) —
   o painel some para mim.
6. Como **profissional** conduzindo sessão de grupo, escrevo um resumo
   compartilhado + observação individual por membro e gero um rascunho por
   paciente.
7. Como **admin**, habilito a IA para a clínica após aceitar um texto de
   disclosure (estilo DPA) e, opcionalmente, ligo o "contexto histórico"
   (incluir resumos das últimas notas assinadas no prompt — **desligado por
   padrão**).
8. Como **superadmin**, defino créditos mensais de IA por plano e vejo o
   consumo mensal por clínica.

### 2.3 Fluxos por papel

#### PROFESSIONAL — gerar rascunho (fluxo principal)

1. Abre o editor de nota (RASCUNHO) de um paciente.
2. Painel colapsável **"Gerar com IA"** visível somente se: clínica com
   `aiEnabled`, usuário sem `aiOptOut`, permissão `ai_assist ≥ WRITE` e plano
   com créditos (> 0 ou ilimitado).
3. Digita/cola o texto bruto (mín. 10 caracteres). Formato (SOAP/DAP/LIVRE) é
   lido do template da nota; campo opcional **"Abordagem"** (select com texto
   livre: TCC, Psicanálise, ABA, Sistêmica, Humanista, Outra…). Checkbox
   **"Incluir contexto das últimas notas"** aparece apenas se a clínica ligou
   `aiHistoryContext`.
4. Clica **"Gerar rascunho"** → botão entra em estado de progresso
   ("Gerando rascunho…", spinner, botão desabilitado). Requisição única
   (sem streaming na v1).
5. Sucesso: as seções retornadas preenchem o editor. Cada seção preenchida
   recebe selo **"Gerado por IA — revise antes de assinar"** (estado local do
   editor; some quando o profissional edita a seção ou assina a nota). Banner
   fixo no topo do editor enquanto houver conteúdo IA não revisado. Aparecem
   os botões 👍/👎 ligados ao `AiUsage.id` retornado.
6. A nota continua um RASCUNHO normal — **o fluxo de assinatura (e a
   responsabilidade legal) não muda em nada**.

#### PROFESSIONAL — falha / timeout

- O texto digitado **permanece intacto** no painel (nunca é limpo antes do
  sucesso). Toast de erro + botão **"Tentar novamente"**.
- Gerações com falha **não consomem crédito** (só `status = SUCCESS` conta).
- Se o provider estiver indisponível/sem chave, o editor permanece 100%
  utilizável manualmente; o painel mostra estado de indisponibilidade.

#### PROFESSIONAL — sessão de grupo (v1 simplificada)

- No fluxo de notas em lote da sessão de grupo, o painel aceita **um resumo
  compartilhado** + **uma observação por membro**.
- O cliente dispara **uma chamada por membro** (sequencial, com progresso
  "Gerando 2 de 5…"), enviando `roughInput = observação do membro` e
  `sharedContext = resumo compartilhado`. **Cada membro consome 1 crédito.**
- Se os créditos acabarem no meio, os membros restantes ficam sem rascunho e o
  aviso de limite aparece (os já gerados são mantidos).

#### ADMIN — habilitar a feature

1. `Configurações da clínica` → nova seção **"Inteligência Artificial"**.
2. Toggle **"Habilitar assistente de IA para evoluções"** abre o
   `AiDisclosureDialog` com o texto de disclosure (ver cópias em 2.6).
   Confirmar grava `aiEnabled = true`, `aiTermsAcceptedAt = now()`,
   `aiTermsAcceptedByUserId = user.id` e gera AuditLog `clinic_ai_enabled`.
3. Toggle secundário **"Incluir contexto histórico nas gerações"**
   (`aiHistoryContext`, default off), com explicação de que resumos das
   últimas 3 notas assinadas serão enviados (pseudonimizados) ao provedor.
4. Desabilitar a IA (`aiEnabled = false`) esconde o painel para todos
   imediatamente e gera AuditLog `clinic_ai_disabled`.

#### PROFESSIONAL — opt-out pessoal

- Página `Perfil` → toggle **"Não usar recursos de IA"** (`User.aiOptOut`).
- Server-side: a rota de geração recusa (403) se `aiOptOut = true` — não é só
  esconder UI.

#### Superadmin

1. `superadmin/plans`: campo novo **"Créditos de IA / mês"** por plano
   (`0` = sem IA; `-1` = ilimitado) no create e no edit.
2. `superadmin/clinics` (ou dashboard): coluna/tabela **"Gerações IA (mês)"**
   por clínica, com tokens agregados — fonte: novo endpoint
   `GET /api/superadmin/ai-usage`.

### 2.4 Regras de negócio

| # | Regra |
|---|---|
| RN1 | 1 geração bem-sucedida = 1 crédito, independentemente de tokens. Tokens são gravados apenas para analytics/custo. |
| RN2 | Janela de créditos = mês-calendário **UTC** (`createdAt` do `AiUsage`). Sem rollover. (Ver Questão em Aberto Q3 sobre timezone.) |
| RN3 | `Plan.aiMonthlyCredits`: `0` = feature indisponível no plano; `-1` = ilimitado; `N > 0` = N gerações/mês por **clínica** (não por usuário). |
| RN4 | Gerações com `status = FAILED` não contam crédito. |
| RN5 | Pré-condições server-side da geração (todas): `clinic.aiEnabled`, `!user.aiOptOut`, `ai_assist ≥ WRITE`, créditos disponíveis, `patientId` pertence à clínica. |
| RN6 | Pseudonimização obrigatória antes de qualquer chamada externa: nome do paciente, nome da mãe/pai, CPF, telefone(s), e-mail → tokens (`[PACIENTE]`, `[CPF_1]`…); re-substituição local na resposta. Scrub genérico por regex de CPFs/telefones/e-mails de terceiros citados no texto livre. |
| RN7 | Nenhum payload (entrada ou saída) é persistido por nós além do ciclo da request. `AiUsage` e `AuditLog` guardam **apenas metadata** (ids, modelo, contagem de tokens) — nunca conteúdo clínico. |
| RN8 | Toda geração gera AuditLog (`ai_draft_generated`) com quem/quando/noteId — sem conteúdo. |
| RN9 | O rascunho gerado entra como RASCUNHO comum; assinatura permanece manual e inalterada (orientação CFP — o profissional é responsável pelo conteúdo). |
| RN10 | Contexto histórico só é incluído se `clinic.aiHistoryContext = true` **e** o profissional marcar o checkbox na geração; limitado às últimas 3 notas ASSINADAS do paciente, truncadas, pseudonimizadas. |
| RN11 | Entrada muito longa é truncada em ~24.000 caracteres com aviso visual ("Texto longo — apenas os primeiros X caracteres foram considerados") e flag `truncated` no `AiUsage`. |
| RN12 | Entrada em idioma misto → saída sempre em pt-BR (instrução fixa no prompt). |
| RN13 | Assinatura SaaS em estado read-only bloqueia a geração automaticamente (o `withFeatureAuth` já bloqueia mutações — a rota é POST). |
| RN14 | Feedback 👍/👎 só pode ser dado pelo próprio autor da geração (`userId`), escopado por `clinicId`. |

### 2.5 Casos extremos

- **Provider retorna JSON inválido/incompleto** → `parseDraftSections` preenche
  seções faltantes com `""` e descarta chaves extras; se nada utilizável,
  trata como FAILED (sem crédito, retry oferecido).
- **Resposta atinge `max_tokens`** → tratada como sucesso parcial: seções
  presentes entram, aviso "rascunho pode estar incompleto".
- **Duplo clique / requisições concorrentes** → botão desabilitado durante a
  request; servidor não precisa de lock (pior caso: 2 créditos — aceitável v1).
- **Paciente sem nome de mãe/CPF/etc.** → entidades ausentes simplesmente não
  geram tokens de pseudonimização (campos opcionais, ver gotcha de paciente
  anulável do projeto — aqui o paciente sempre existe pois nota clínica exige
  paciente, mas os campos internos são `String?`).
- **Clínica desabilita IA no meio de uma sessão de uso** → próxima chamada
  recebe 403 com mensagem amigável; UI esconde painel no próximo fetch.
- **Limite atingido no meio da geração em grupo** → membros restantes recebem
  o erro de limite; os já gerados permanecem.

### 2.6 Telas e cópias pt-BR

#### Painel "Gerar com IA" (dentro do editor de nota)

```
┌─ ✦ Gerar com IA ────────────────────────────── [3 gerações restantes] ─┐
│ Anote os pontos principais da sessão (tópicos soltos ou transcrição):  │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ paciente relatou melhora no sono; discutimos exposição gradual...  │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ Formato: SOAP (do modelo da nota)      Abordagem: [TCC ▾] (opcional)   │
│ ☐ Incluir contexto das últimas notas assinadas                         │
│                                              [ Gerar rascunho ]        │
└─────────────────────────────────────────────────────────────────────────┘
```

| Chave | Texto pt-BR |
|---|---|
| Título do painel | `Gerar com IA` |
| Placeholder textarea | `Anote os pontos principais da sessão — tópicos soltos ou transcrição colada` |
| Botão | `Gerar rascunho` |
| Estado de progresso | `Gerando rascunho…` |
| Badge de créditos | `{n} gerações restantes neste mês` / `Gerações ilimitadas` |
| Limite atingido | `Você atingiu o limite de {n} gerações deste mês. Faça upgrade do plano para continuar gerando rascunhos com IA.` |
| Banner de revisão | `Conteúdo gerado por IA — revise antes de assinar. O profissional é responsável pelo conteúdo do registro (Res. CFP nº 11/2018).` |
| Selo por seção | `Gerado por IA — revise` |
| Erro de geração | `Não foi possível gerar o rascunho. Seu texto foi preservado.` + botão `Tentar novamente` |
| IA indisponível | `O assistente de IA está temporariamente indisponível. Você pode continuar escrevendo normalmente.` |
| Truncamento | `Texto longo — apenas os primeiros {n} caracteres foram considerados.` |
| Feedback | tooltip `Este rascunho foi útil?` (👍 `Útil` / 👎 `Não útil`) — toast `Obrigado pelo feedback!` |
| Opt-out (perfil) | `Não usar recursos de IA` + descrição `O painel "Gerar com IA" não será exibido para você e nenhum texto seu será enviado ao provedor de IA.` |

#### Seção "Inteligência Artificial" (Configurações da clínica — ADMIN)

| Chave | Texto pt-BR |
|---|---|
| Título | `Inteligência Artificial` |
| Toggle principal | `Habilitar assistente de IA para evoluções` |
| Toggle histórico | `Incluir contexto histórico nas gerações` + descrição `Envia resumos pseudonimizados das últimas 3 notas assinadas do paciente para melhorar o rascunho. Desligado por padrão.` |
| Diálogo de disclosure (resumo) | Título: `Termos de uso do assistente de IA`. Corpo: `Ao habilitar, trechos digitados pelos profissionais serão enviados de forma pseudonimizada (sem nome, CPF, telefone ou e-mail do paciente) a um provedor de IA (Anthropic) exclusivamente para gerar o rascunho, em conformidade com a LGPD (art. 7º, V — execução de contrato; operador sob instrução do controlador). O conteúdo não é armazenado por nós nem utilizado para treinar modelos. Cada uso é registrado em log de auditoria, sem conteúdo clínico. O profissional permanece integralmente responsável pelo registro (CFP). Cada profissional pode se excluir individualmente nas configurações de perfil.` Botões: `Aceitar e habilitar` / `Cancelar` |
| Registro do aceite | `Habilitado por {nome} em {DD/MM/YYYY HH:mm}` |

#### Superadmin

| Chave | Texto pt-BR |
|---|---|
| Campo do plano | `Créditos de IA / mês` + hint `0 = sem IA · -1 = ilimitado` |
| Tabela de consumo | colunas `Clínica`, `Gerações (mês)`, `Tokens entrada`, `Tokens saída`, `👍 / 👎` |

---

## 3. Design Técnico

### 3.1 Decisões técnicas (resumo)

1. **Provider Anthropic reutilizando o padrão existente** — o projeto já
   depende de `@anthropic-ai/sdk` (^0.80.0) e tem um precedente em
   `src/lib/expense-matcher/ai-classifier.ts`. Modelo default
   **`claude-opus-4-8`** (configurável via env `AI_MODEL`; `claude-sonnet-4-6`
   como alternativa de custo). Custo estimado por geração (~2K tokens in / ~1K
   out a US$ 5/US$ 25 por MTok): **~US$ 0,035** — margem confortável até em
   pacotes de 10 créditos.
2. **Saída estruturada garantida** — usar `output_config.format` com
   `json_schema` (schema construído a partir das `sectionKeys` da nota), em vez
   de `JSON.parse` "na fé" como no classifier antigo. Elimina a classe de bug
   de JSON malformado. (`additionalProperties: false`, todas as seções
   `type: "string"`.)
3. **Sem streaming na v1** — a resposta é um JSON estruturado curto
   (`max_tokens: 4096`); UI usa estado de progresso. Streaming de JSON parcial
   em seções não compensa a complexidade. Rota com `export const maxDuration = 60`.
4. **`AiUsage.noteId` sem FK** — desacopla a ordem de migrations do plano de
   prontuário (string indexada; integridade garantida em código).
5. **Padrão notification-provider** — interface `AiDraftProvider` com
   `anthropic` (real) e `mock` (determinístico, usado em dev sem
   `ANTHROPIC_API_KEY` e nos testes), selecionados em `get-provider.ts`.
6. **Crédito por clínica (não por usuário)** — espelha `maxProfessionals` do
   `Plan`; mais simples de explicar e de fazer upsell.
7. **Nova feature RBAC `ai_assist`** — separada de `prontuario` para permitir
   que o admin desligue IA para um usuário específico via override sem mexer
   no acesso ao prontuário; o opt-out pessoal (`User.aiOptOut`) é um controle
   distinto, de privacidade, do próprio profissional.

### 3.2 Mudanças no Prisma schema (`prisma/schema.prisma`)

```prisma
// ── enums novos ─────────────────────────────────────────────
enum AiUsageStatus {
  SUCCESS
  FAILED
}

enum AiFeedback {
  POSITIVE
  NEGATIVE
}

// ── modelo novo ─────────────────────────────────────────────
/// Metering de gerações de IA. NUNCA armazena conteúdo clínico —
/// apenas metadata (ids, modelo, tokens, status, feedback).
model AiUsage {
  id        String        @id @default(cuid())
  clinicId  String
  userId    String?
  /// Referência fraca à ClinicalNote (sem FK — desacopla migrations do prontuário)
  noteId    String?
  patientId String?
  model     String        // ex.: "claude-opus-4-8" / "mock"
  tokensIn  Int           @default(0)
  tokensOut Int           @default(0)
  status    AiUsageStatus
  truncated Boolean       @default(false)
  feedback  AiFeedback?
  createdAt DateTime      @default(now())

  clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  user   User?  @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([clinicId, createdAt])
  @@index([clinicId, userId, createdAt])
  @@index([noteId])
}

// ── campos novos em modelos existentes ──────────────────────
model Plan {
  // ...campos existentes...
  aiMonthlyCredits Int @default(0) // 0 = sem IA; -1 = ilimitado; N = créditos/mês por clínica
}

model Clinic {
  // ...campos existentes...
  aiEnabled              Boolean   @default(false)
  aiHistoryContext       Boolean   @default(false)
  aiTermsAcceptedAt      DateTime?
  aiTermsAcceptedByUserId String?
  aiUsages               AiUsage[]
}

model User {
  // ...campos existentes...
  aiOptOut Boolean @default(false)
  aiUsages AiUsage[]
}
```

#### Migration SQL (autorada offline — NUNCA `db push`/`migrate dev`)

Criar `prisma/migrations/<timestamp>_add_ai_evolucao/migration.sql`:

```sql
-- enums
CREATE TYPE "AiUsageStatus" AS ENUM ('SUCCESS', 'FAILED');
CREATE TYPE "AiFeedback" AS ENUM ('POSITIVE', 'NEGATIVE');

-- AiUsage
CREATE TABLE "AiUsage" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "userId" TEXT,
  "noteId" TEXT,
  "patientId" TEXT,
  "model" TEXT NOT NULL,
  "tokensIn" INTEGER NOT NULL DEFAULT 0,
  "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "status" "AiUsageStatus" NOT NULL,
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "feedback" "AiFeedback",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiUsage_clinicId_createdAt_idx" ON "AiUsage"("clinicId", "createdAt");
CREATE INDEX "AiUsage_clinicId_userId_createdAt_idx" ON "AiUsage"("clinicId", "userId", "createdAt");
CREATE INDEX "AiUsage_noteId_idx" ON "AiUsage"("noteId");
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Plan / Clinic / User
ALTER TABLE "Plan"   ADD COLUMN "aiMonthlyCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Clinic" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
                     ADD COLUMN "aiHistoryContext" BOOLEAN NOT NULL DEFAULT false,
                     ADD COLUMN "aiTermsAcceptedAt" TIMESTAMP(3),
                     ADD COLUMN "aiTermsAcceptedByUserId" TEXT;
ALTER TABLE "User"   ADD COLUMN "aiOptOut" BOOLEAN NOT NULL DEFAULT false;
```

Validar com `npx prisma migrate diff` (schema vs. SQL) e `npx prisma generate`.
Não conectar à produção; a migration roda no deploy via `prisma migrate deploy`
(script `vercel-build`).

### 3.3 RBAC — feature nova `ai_assist`

Em `src/lib/rbac/types.ts`:

```typescript
export const FEATURES = [
  // ...existentes...
  "ai_assist",
] as const

FEATURE_LABELS: { ...; ai_assist: "Assistente de IA" }
```

Em `src/lib/rbac/permissions.ts` (`ROLE_DEFAULTS`):

```typescript
ADMIN:        { ...; ai_assist: "WRITE" },
PROFESSIONAL: { ...; ai_assist: "WRITE" },
```

Overrides por usuário já funcionam via `UserPermission` (string `feature`) —
nenhuma mudança extra. Atualizar `src/lib/rbac/permissions.test.ts` e a tela
de permissões do admin (a grade renderiza a partir de `FEATURES`/`FEATURE_LABELS`,
então deve aparecer automaticamente — verificar).

### 3.4 Módulo de domínio `src/lib/ai/`

Todos os arquivos < 200 linhas, funções puras (exceto providers), testes
colocados. Barrel `index.ts`.

```
src/lib/ai/
├── index.ts                 # barrel
├── types.ts                 # tipos e interface de provider
├── pseudonymize.ts          # pseudonimização / re-identificação (puro)
├── pseudonymize.test.ts
├── prompt.ts                # montagem de prompt + json schema (puro)
├── prompt.test.ts
├── chunking.ts              # truncamento de entrada (puro)
├── chunking.test.ts
├── parse.ts                 # validação/normalização do SectionMap (puro)
├── parse.test.ts
├── credits.ts               # regras de crédito mensal (puro)
├── credits.test.ts
├── generate-draft.ts        # orquestração testável (deps injetadas)
├── generate-draft.test.ts
├── get-provider.ts          # seleção de provider por env
└── providers/
    ├── anthropic.ts         # provider real (@anthropic-ai/sdk)
    ├── mock.ts              # provider determinístico (dev/testes)
    └── mock.test.ts
```

#### `types.ts`

```typescript
export type NoteFormat = "SOAP" | "DAP" | "LIVRE"

export type SectionMap = Record<string, string>

export interface SectionDef { key: string; label: string }

export interface DraftRequest {
  format: NoteFormat
  sections: SectionDef[]          // vindas do template da nota
  abordagem?: string              // hint: TCC, psicanálise, ABA…
  roughInput: string              // texto bruto JÁ pseudonimizado
  sharedContext?: string          // sessão de grupo (pseudonimizado)
  historyContext?: string[]       // resumos de notas assinadas (pseudonimizados)
}

export interface AssembledPrompt {
  system: string
  user: string
  schema: Record<string, unknown> // json_schema p/ output_config.format
}

export interface ProviderResult {
  ok: boolean
  sections?: SectionMap           // bruto do provider (ainda pseudonimizado)
  tokensIn: number
  tokensOut: number
  error?: string                  // mensagem técnica (log), nunca exibida crua
}

export interface AiDraftProvider {
  name: string                    // "anthropic" | "mock"
  model: string
  generateNoteDraft(prompt: AssembledPrompt): Promise<ProviderResult>
}
```

#### `pseudonymize.ts` (puro)

```typescript
export interface PseudonymEntity { token: string; value: string }
export interface PseudonymResult { text: string; tokenMap: PseudonymEntity[] }

/** Monta entidades a partir do paciente (campos opcionais ignorados). */
export function buildEntityMap(patient: {
  name: string
  motherName?: string | null
  fatherName?: string | null
  cpf?: string | null
  billingCpf?: string | null
  phone?: string | null
  email?: string | null
}): PseudonymEntity[]

/** Substitui entidades (case/acento-insensível p/ nomes; formatos múltiplos
 *  p/ CPF e telefone) + scrub genérico de CPF/telefone/e-mail de terceiros. */
export function pseudonymizeText(text: string, entities: PseudonymEntity[]): PseudonymResult

/** Re-substitui tokens pelo valor original (resposta do provider). */
export function reidentifyText(text: string, tokenMap: PseudonymEntity[]): string

export function pseudonymizeSections(sections: SectionMap, tokenMap: PseudonymEntity[]): SectionMap // reidentify em lote
```

Tokens: `[PACIENTE]`, `[MAE]`, `[PAI]`, `[CPF_1]`, `[TEL_1]`, `[EMAIL_1]`,
`[CPF_X1]`/`[TEL_X1]` para terceiros detectados por regex
(CPF: `\d{3}\.?\d{3}\.?\d{3}-?\d{2}`; telefone BR com/sem +55/DDD; e-mail padrão).
Nome: match por palavra inteira, case-insensitive, normalizando acentos (NFD),
incluindo primeiro nome isolado quando tiver ≥ 4 caracteres (evita falso
positivo com nomes curtos tipo "Ana" — ver teste).

#### `prompt.ts` (puro)

```typescript
export const FORMAT_DEFINITIONS: Record<NoteFormat, string> // semântica de cada seção SOAP/DAP/LIVRE em pt-BR

export function buildNoteDraftPrompt(req: DraftRequest): AssembledPrompt
```

Regras embutidas no system prompt (testadas): redigir em pt-BR formal de
registro clínico; usar exclusivamente as informações fornecidas (não inventar
fatos clínicos); preservar tokens `[...]` exatamente como recebidos; estilo
conforme `abordagem` quando presente; preencher todas as seções do schema
(string vazia quando não houver material); nunca incluir recomendação
diagnóstica não mencionada pelo profissional. `schema` gerado de
`req.sections` com `additionalProperties: false`.

#### `chunking.ts` (puro)

```typescript
export const MAX_INPUT_CHARS = 24_000
export function truncateInput(text: string, max = MAX_INPUT_CHARS): { text: string; truncated: boolean }
// corta em fronteira de palavra; nunca corta no meio de um token [
```

#### `parse.ts` (puro)

```typescript
export function parseDraftSections(raw: unknown, expectedKeys: string[]): SectionMap | null
// aceita objeto ou string JSON; preenche faltantes com ""; descarta extras;
// retorna null se nada utilizável (=> FAILED)
```

#### `credits.ts` (puro)

```typescript
export interface AiCreditCheck { planCredits: number; usedThisMonth: number }
export interface AiCreditResult { allowed: boolean; remaining: number | null; message?: string }
// remaining null = ilimitado

export function checkAiCredits(check: AiCreditCheck): AiCreditResult
// planCredits 0 → bloqueado ("Seu plano não inclui o assistente de IA. Faça upgrade...")
// planCredits -1 → permitido, remaining null
// usedThisMonth >= planCredits → bloqueado ("Você atingiu o limite de {n} gerações deste mês...")

export function getUtcMonthRange(now: Date): { start: Date; end: Date }
```

#### `generate-draft.ts` (orquestração testável — deps injetadas, sem Prisma)

```typescript
export interface GenerateDraftInput {
  clinic: { aiEnabled: boolean; aiHistoryContext: boolean }
  user: { aiOptOut: boolean }
  credit: AiCreditResult
  patientEntities: PseudonymEntity[]
  format: NoteFormat
  sections: SectionDef[]
  abordagem?: string
  roughInput: string
  sharedContext?: string
  historyContext?: string[]
}

export type GenerateDraftOutcome =
  | { kind: "blocked"; reason: "disabled" | "opt_out" | "no_credits"; message: string }
  | { kind: "failed"; message: string; tokensIn: number; tokensOut: number }
  | { kind: "success"; sections: SectionMap; tokensIn: number; tokensOut: number; truncated: boolean }

export async function generateDraft(
  input: GenerateDraftInput,
  provider: AiDraftProvider
): Promise<GenerateDraftOutcome>
```

Pipeline interno: checagens → `truncateInput` → `pseudonymizeText` (input,
sharedContext, historyContext) → `buildNoteDraftPrompt` → `provider.generateNoteDraft`
→ `parseDraftSections` → `reidentify` em cada seção. Totalmente testável com o
provider mock.

#### `providers/anthropic.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk"
// model: process.env.AI_MODEL ?? "claude-opus-4-8"
// max_tokens: 4096; sem prefill; sem temperature (removido nos modelos atuais)
// output_config: { format: { type: "json_schema", schema: prompt.schema } }
// erros: usar classes tipadas do SDK (Anthropic.RateLimitError, APIError…)
//        → ProviderResult { ok: false, error } (nunca lançar para a rota)
// tokens: response.usage.input_tokens / output_tokens
```

Envs novos (documentar em `.env.example`): `ANTHROPIC_API_KEY` (já existe para
o expense-matcher), `AI_PROVIDER` (`anthropic` | `mock`; default: `anthropic`
se houver chave, senão `mock`), `AI_MODEL` (default `claude-opus-4-8`).

#### `providers/mock.ts`

Determinístico: para cada `sectionKey`, retorna
`"[RASCUNHO MOCK] {label}: " + primeiras N palavras do roughInput`. `tokensIn`/
`tokensOut` calculados por `Math.ceil(chars / 4)`. Sempre `ok: true`. Usado em
dev sem chave e como base dos testes de orquestração.

### 3.5 Rotas de API

Todas em `src/app/api/ai/` (autenticadas — não públicas). **Lembrete de
multi-tenancy**: `withFeatureAuth` NÃO escopa por clínica — todo `where` abaixo
inclui `clinicId: user.clinicId` e o `patientId` do body é validado contra a
clínica antes de qualquer uso.

#### `POST /api/ai/note-draft` — gerar rascunho

```typescript
// src/app/api/ai/note-draft/route.ts
export const maxDuration = 60

export const POST = withFeatureAuth(
  { feature: "ai_assist", minAccess: "WRITE" },
  async (req, { user }) => { ... }
)
```

Request (zod):

```typescript
{
  patientId: string,            // obrigatório — validado contra a clínica
  noteId?: string,              // opcional (nota pode ainda não estar salva)
  format: "SOAP" | "DAP" | "LIVRE",
  sections: { key: string, label: string }[],  // min 1, max 12
  abordagem?: string,           // max 60 chars
  roughInput: string,           // min 10 chars
  sharedContext?: string,       // sessões de grupo
  includeHistory?: boolean
}
```

Fluxo do handler (fino — toda lógica nas funções de domínio):

1. Parse zod do body.
2. `prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId }, select: { name, motherName, fatherName, cpf, billingCpf, phone, email } })`
   → 404 se não pertencer à clínica (validação de FK do body — convenção
   `ownership` do projeto; usar o helper `src/lib/clinic/ownership.ts`
   entregue pelo plano irmão 001 quando já mergeado, senão o `findFirst`
   escopado acima).
3. `prisma.clinic.findUnique` → `aiEnabled`, `aiHistoryContext`, `plan.aiMonthlyCredits`;
   `prisma.user.findUnique` → `aiOptOut`.
4. `usedThisMonth = prisma.aiUsage.count({ where: { clinicId: user.clinicId, status: "SUCCESS", createdAt: { gte: start, lt: end } } })`
   com `getUtcMonthRange(new Date())`.
5. Se `includeHistory && clinic.aiHistoryContext`: buscar últimas 3 notas
   ASSINADAS do paciente (escopadas por `clinicId` + `patientId`), concatenar
   seções, truncar a 2.000 chars cada (nomes de modelo/campos conforme o
   prontuário implementado).
6. `generateDraft(input, getAiProvider())`.
7. `kind === "blocked"` → 403 `{ error, message }` (mensagens da seção 2.6) —
   sem gravar `AiUsage`.
   `kind === "failed"` → grava `AiUsage { status: FAILED, ... }` + retorna 502
   `{ error: "generation_failed", message: "Não foi possível gerar o rascunho..." }`.
   `kind === "success"` → grava `AiUsage { status: SUCCESS, truncated, tokensIn, tokensOut, noteId, patientId, model }`,
   `createAuditLog({ user, action: "ai_draft_generated", entityType: "ClinicalNote", entityId: noteId ?? "unsaved", newValues: { model, tokensIn, tokensOut, truncated } })`
   (metadata apenas — RN7/RN8) e responde:

```typescript
// 200
{
  usageId: string,
  sections: SectionMap,
  truncated: boolean,
  credits: { used: number, limit: number | null, remaining: number | null }
}
```

Nota de escopo PROFESSIONAL: o acesso do profissional ao paciente segue a
mesma regra do prontuário (paciente atendido/referenciado). Reutilizar o
helper de acesso a paciente do plano de prontuário aqui; na ausência dele,
v1 valida apenas `clinicId` (mesmo nível do restante das rotas de paciente
existentes) e registra TODO.

#### `GET /api/ai/usage` — créditos do mês (para o badge)

```typescript
export const GET = withFeatureAuth(
  { feature: "ai_assist", minAccess: "READ" },
  async (_req, { user }) => { ... }
)
// → { enabled: boolean, optedOut: boolean, used: number,
//     limit: number | null, remaining: number | null }
// limit null = ilimitado; enabled=false quando clinic.aiEnabled=false ou plano sem créditos
// Cache-Control: private, max-age=30
```

Único count escopado por `clinicId` + mês UTC. A UI usa essa resposta para
decidir se mostra o painel (e o servidor revalida tudo de novo no POST — RN5).

#### `POST /api/ai/usage/[id]/feedback`

```typescript
export const POST = withFeatureAuth(
  { feature: "ai_assist", minAccess: "WRITE" },
  async (req, { user }, params) => {
    // body zod: { feedback: "POSITIVE" | "NEGATIVE" }
    // prisma.aiUsage.updateMany({
    //   where: { id: params.id, clinicId: user.clinicId, userId: user.id },
    //   data: { feedback },
    // }) → count 0 ⇒ 404 (RN14)
  }
)
```

#### Extensões em rotas existentes

| Rota | Mudança |
|---|---|
| `PATCH /api/admin/settings` (`clinic_settings` WRITE) | aceitar `aiEnabled: boolean`, `aiHistoryContext: boolean`. Ao transicionar `aiEnabled` false→true: gravar `aiTermsAcceptedAt = new Date()`, `aiTermsAcceptedByUserId = user.id`, AuditLog `clinic_ai_enabled`. true→false: AuditLog `clinic_ai_disabled`. `GET` passa a retornar os 4 campos. |
| `PATCH /api/profile` | aceitar `aiOptOut: boolean` (próprio usuário apenas — a rota já opera sobre o user da sessão). |
| `POST /api/superadmin/plans` e `PATCH /api/superadmin/plans/[id]` | aceitar `aiMonthlyCredits: number` (int ≥ -1; default 0). |

#### `GET /api/superadmin/ai-usage` (novo, `withSuperAdmin`)

```typescript
// query: ?month=YYYY-MM (default: mês corrente)
// prisma.aiUsage.groupBy({ by: ["clinicId"], where: { createdAt: range, status: "SUCCESS" },
//   _count: true, _sum: { tokensIn: true, tokensOut: true } })
// + groupBy feedback para 👍/👎
// → { rows: [{ clinicId, clinicName, generations, tokensIn, tokensOut, positive, negative }] }
```

#### Integrações que NÃO mudam

- **Notificações**: nenhuma (feature não notifica ninguém).
- **Cron / vercel.json**: nenhuma alteração — não há job novo.
- **Stripe/webhooks**: nenhum — créditos derivam do `Plan` já associado à clínica.

### 3.6 UI — componentes e páginas

#### Novos componentes (feature prontuário)

Local: pasta de componentes do editor de prontuário (conforme plano irmão —
ex.: `src/app/patients/[id]/prontuario/components/ai/`). Cada um < 150 linhas.

| Componente | Responsabilidade |
|---|---|
| `AiDraftPanel.tsx` | Painel colapsável: textarea (react-hook-form + zod), select de abordagem, checkbox de histórico, botão com progresso, erros com retry preservando input. Recebe `format`, `sections`, `patientId`, `noteId` e `onDraft(sections, usageId)` por props. Busca `/api/ai/usage` no mount via hook do projeto (sem `useEffect` cru — usar o padrão `useMountEffect`/data-fetching existente). |
| `AiCreditsBadge.tsx` | `"{n} gerações restantes neste mês"` / `"Gerações ilimitadas"`. |
| `AiReviewBanner.tsx` | Banner fixo de revisão (cópia CFP — seção 2.6). |
| `AiSectionTag.tsx` | Selo `Gerado por IA — revise` por seção; some quando a seção é editada ou a nota assinada (estado derivado no editor: `aiSectionKeys` setado no `onDraft`, removido no `onChange` da seção — **derivar, não sincronizar**). |
| `AiFeedbackButtons.tsx` | 👍/👎 → `POST /api/ai/usage/[id]/feedback`, toast Sonner. |

Ícones: `Sparkles`, `ThumbsUp`, `ThumbsDown`, `AlertTriangle` (lucide-react).

#### Arquivos existentes alterados

| Arquivo | Mudança |
|---|---|
| Editor de nota do prontuário (plano irmão) | Renderiza `AiDraftPanel` + `AiReviewBanner` + tags por seção; aplica `onDraft` preenchendo o form das seções. |
| Fluxo de notas em lote de sessão de grupo (plano irmão) | Campo de resumo compartilhado + observação por membro; loop de chamadas com progresso. |
| `src/app/admin/settings/page.tsx` (ou componente da página) | Nova seção "Inteligência Artificial" + `AiDisclosureDialog.tsx` (novo, na pasta de componentes da página de settings). |
| `src/app/profile/` | Toggle `Não usar recursos de IA`. |
| `src/app/superadmin/plans/page.tsx` | Campo `Créditos de IA / mês` (create + edit). Atenção: arquivo com 12,5K — se a mudança o levar além de ~300 linhas, extrair o form de plano para componente próprio. |
| `src/app/superadmin/` (dashboard ou clinics) | Tabela de consumo consumindo `GET /api/superadmin/ai-usage`. |
| `.env.example` | `AI_PROVIDER`, `AI_MODEL` (e `ANTHROPIC_API_KEY` se ainda não documentada). |

Conformidade com as regras do projeto: nenhum `useEffect` cru (estado derivado
para tags de IA; fetch via hooks/padrões existentes); formulários com
react-hook-form + zod; toasts Sonner; datas exibidas em `DD/MM/YYYY HH:mm`
(`pt-BR`); painel responsivo (colapsado por padrão no mobile).

### 3.7 Auditoria

| Ação | `action` | `entityType` / `entityId` | Conteúdo |
|---|---|---|---|
| Geração de rascunho | `ai_draft_generated` | `ClinicalNote` / `noteId ?? "unsaved"` | `newValues`: `{ model, tokensIn, tokensOut, truncated }` — **nunca** texto clínico |
| Habilitar IA | `clinic_ai_enabled` | `Clinic` / `clinicId` | `newValues`: `{ aiEnabled: true }` |
| Desabilitar IA | `clinic_ai_disabled` | `Clinic` / `clinicId` | `newValues`: `{ aiEnabled: false }` |

Usar `createAuditLog` de `src/lib/rbac/audit.ts`. Adicionar labels novos em
`src/lib/audit/` (field-labels) se a tela de audit-logs exibir actions
traduzidas — verificar `src/lib/audit/field-labels`.

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`. Enums
Prisma como string literal (`"SUCCESS"`, `"POSITIVE"`). `vi.useFakeTimers()`
onde houver data.

| Arquivo | Comportamentos cobertos |
|---|---|
| `src/lib/ai/pseudonymize.test.ts` | substitui nome completo e primeiro nome (≥ 4 chars) case/acento-insensível; NÃO substitui primeiro nome curto (< 4 chars) isolado; CPF com e sem máscara; telefone com/sem +55/DDD/máscara; e-mail; nome de mãe/pai; campos null/undefined ignorados; scrub de CPF/telefone/e-mail de terceiros não cadastrados; `reidentifyText` faz roundtrip exato; texto sem PII permanece idêntico; tokens não colidem quando paciente tem 2 CPFs (cpf + billingCpf). |
| `src/lib/ai/prompt.test.ts` | system prompt contém definição do formato correto (SOAP vs DAP vs LIVRE); abordagem incluída quando presente e ausente quando omitida; historyContext só entra quando fornecido; sharedContext idem; instrução pt-BR sempre presente; instrução de preservar tokens `[...]` sempre presente; schema contém exatamente as `sections` pedidas com `additionalProperties: false`. |
| `src/lib/ai/chunking.test.ts` | abaixo do limite → intacto + `truncated: false`; acima → cortado em fronteira de palavra + `truncated: true`; nunca corta um token `[CPF_1]` ao meio; limite custom respeitado. |
| `src/lib/ai/parse.test.ts` | objeto válido → SectionMap; string JSON válida → parseada; chaves faltantes preenchidas com `""`; chaves extras descartadas; valores não-string convertidos com `String()` quando primitivos / descartados quando objetos; entrada lixo → `null`. |
| `src/lib/ai/credits.test.ts` | `planCredits: 0` → bloqueado com mensagem de upgrade; `-1` → permitido, `remaining: null`; `usedThisMonth < N` → permitido com `remaining` correto; `=== N` e `> N` → bloqueado; `getUtcMonthRange` nas viradas de mês/ano (fake timers em 31/12 23:59 UTC e 01/01 00:00 UTC). |
| `src/lib/ai/providers/mock.test.ts` | retorna todas as seções pedidas; saída determinística para mesma entrada; `ok: true`; tokens > 0. |
| `src/lib/ai/generate-draft.test.ts` | clínica desabilitada → `blocked/disabled`; opt-out → `blocked/opt_out`; sem créditos → `blocked/no_credits` (provider NÃO é chamado — espionar mock); provider `ok: false` → `failed` com tokens; provider ok → `success` com seções **re-identificadas** (nome real volta ao texto); flag `truncated` propagada; historyContext pseudonimizado antes do prompt (nome real nunca aparece no `AssembledPrompt` — assert no spy). |
| `src/lib/rbac/permissions.test.ts` (atualizar) | `ai_assist` default WRITE para ADMIN e PROFESSIONAL; override por usuário para NONE respeitado via `resolvePermissions`. |

O provider Anthropic real **não** é testado contra a API: seu contrato é coberto
mockando `@anthropic-ai/sdk` (mesmo padrão de
`src/lib/expense-matcher/ai-classifier.test.ts` — `vi.mock("@anthropic-ai/sdk")`)
para: resposta feliz, `RateLimitError`, erro genérico, resposta sem bloco de
texto.

Gates antes de cada commit: `npx prisma generate` && `npm run test` &&
`npm run build`.

---

## 5. Etapas de Implementação

Branch via worktree isolado (padrão do projeto):
`bash scripts/new-feature.sh ai-evolucao` → trabalhar em `../clinica-ai-evolucao`.
Commits convencionais (`feat(ai): ...`) terminando com
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. **Nunca** `git push`.

Cada etapa é independentemente verificável:

1. **Schema + migration** — editar `prisma/schema.prisma` (seção 3.2), criar a
   migration SQL offline, `npx prisma generate`.
   ✅ Verificar: `npx prisma migrate diff --from-schema-datasource --to-schema-datamodel`
   limpo contra o banco do worktree; build ok.
2. **RBAC `ai_assist`** — `types.ts`, `permissions.ts`, atualizar testes.
   ✅ `npm run test` verde; grade de permissões do admin exibe "Assistente de IA".
3. **Domínio puro** — `types.ts`, `pseudonymize.ts`, `prompt.ts`, `chunking.ts`,
   `parse.ts`, `credits.ts` + todos os testes.
   ✅ `npx vitest run src/lib/ai/` verde.
4. **Providers + orquestração** — `providers/mock.ts`, `providers/anthropic.ts`,
   `get-provider.ts`, `generate-draft.ts` + testes (SDK mockado).
   ✅ testes verdes; sem chave no env, `getAiProvider()` retorna mock.
5. **Rotas de IA** — `POST /api/ai/note-draft`, `GET /api/ai/usage`,
   `POST /api/ai/usage/[id]/feedback`.
   ✅ Smoke manual via curl autenticado no dev server do worktree: geração com
   provider mock retorna seções; usage conta; feedback de outro usuário → 404;
   `patientId` de outra clínica → 404.
6. **Extensões de settings/profile/superadmin** — PATCH settings (+aceite),
   PATCH profile, plans create/update, `GET /api/superadmin/ai-usage`.
   ✅ Smoke manual; AuditLog `clinic_ai_enabled` criado ao habilitar.
7. **UI admin/superadmin/perfil** — seção IA nas configurações +
   `AiDisclosureDialog`; toggle de perfil; campo de créditos nos planos;
   tabela de consumo superadmin.
   ✅ Visual no dev server; build ok.
8. **Componentes do painel** — `AiDraftPanel`, `AiCreditsBadge`,
   `AiReviewBanner`, `AiSectionTag`, `AiFeedbackButtons`.
   ✅ Renderização isolada no editor; estados: progresso, erro+retry com input
   preservado, limite atingido, indisponível.
9. **Integração no editor de prontuário** (bloqueada pela entrega do plano
   irmão) — plugar painel/banner/tags no editor; fluxo de grupo.
   ✅ E2E manual: gerar rascunho mock → seções preenchem → editar remove selo →
   assinar funciona inalterado.
10. **Passo final** — `.env.example`, conferir labels de auditoria,
    `npx prisma generate && npm run test && npm run build`, commit final.
    Teste real opcional com `ANTHROPIC_API_KEY` + `AI_PROVIDER=anthropic`
    em dev (1 geração, conferir custo/latência).

Pós-merge: `bash scripts/cleanup-feature.sh ai-evolucao`.

---

## 6. Riscos e Questões em Aberto

### Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | **Dependência do prontuário**: nomes de modelos/rotas do plano irmão podem divergir do assumido em 2.1. | Módulo `src/lib/ai` desacoplado (Etapas 1–8 não dependem do prontuário); só a Etapa 9 bloqueia. Validar contrato antes da Etapa 9. |
| R2 | **LGPD / transferência internacional**: dados (pseudonimizados) vão a provedor nos EUA. | Pseudonimização obrigatória (RN6) + zero persistência (RN7) + opt-in da clínica com disclosure + opt-out individual. Pendência jurídica: cláusula de operador/suboperador no contrato e configuração de retenção/no-training na conta Anthropic. Texto do diálogo deve passar por revisão jurídica antes do launch. |
| R3 | **Pseudonimização é heurística** — apelidos, diminutivos ou grafias erradas do nome podem vazar no texto livre. | Scrub por regex de PII genérica + revisão humana obrigatória (review-first) + nunca persistimos payload. Documentar limitação no disclosure. Fase 2: NER. |
| R4 | **Conformidade CFP** — wording do banner e a não-automação da assinatura são o cerne. | Banner fixo citando Res. CFP nº 11/2018; assinatura intocada; revisar texto com conselho/jurídico. |
| R5 | **Custo de inferência** — `claude-opus-4-8` a ~US$ 0,035/geração; plano ilimitado pode ser abusado. | Tokens gravados em `AiUsage`; dashboard superadmin monitora; `AI_MODEL` permite degradar para `claude-sonnet-4-6` (US$ 3/US$ 15 por MTok — ~40% mais barato); evitar `-1` em planos baratos. |
| R6 | **Timeout Vercel** — geração pode levar >10s. | `maxDuration = 60` na rota; `max_tokens: 4096` mantém p95 baixo; UI com progresso e retry. Confirmar limite do plano Vercel da conta. |
| R7 | **Qualidade do rascunho por abordagem** — prompts genéricos podem soar artificiais para psicanálise vs TCC. | `FORMAT_DEFINITIONS` + hint de abordagem testáveis isoladamente; feedback 👍/👎 em `AiUsage` orienta iteração de prompt sem migração. |
| R8 | **Race de créditos** (duas gerações simultâneas no limite). | Aceito na v1 (pior caso: 1 crédito extra). Se virar problema: `SELECT ... FOR UPDATE`/transação na contagem. |

### Questões em aberto

1. **Q1 — Créditos por clínica ou por profissional?** v1: por clínica (RN3),
   espelhando `maxProfessionals`. Se clínicas grandes esgotarem rápido,
   considerar multiplicar por profissional ativo (decisão de pricing, não de
   código — a contagem já permite ambos).
2. **Q2 — Add-on pago de créditos extras (Stripe)?** Fora da v1. O modelo
   `AiUsage` + `Plan.aiMonthlyCredits` comporta um campo futuro
   `Clinic.aiExtraCredits` sem migração disruptiva.
3. **Q3 — Janela mensal em UTC ou America/Sao_Paulo?** v1 usa UTC (RN2) pela
   simplicidade e consistência com `createdAt`. Diferença prática: virada de
   mês às 21h de Brasília. Se houver reclamação, trocar `getUtcMonthRange` por
   versão com timezone da clínica (função pura já isolada).
4. **Q4 — Resumo de histórico**: v1 envia seções brutas truncadas das últimas
   3 notas assinadas. Alternativa (fase 2): manter um campo `aiSummary` por
   nota, gerado na assinatura — exige decisão de produto sobre persistir
   derivados de conteúdo clínico.
5. **Q5 — Telemetria de prompt**: hoje nada do prompt é persistido (RN7).
   Para depurar qualidade, considerar flag interna de amostragem com
   consentimento explícito da clínica — exige revisão LGPD antes.
6. **Q6 — Fase 2 (áudio)**: upload + transcrição (provider de STT atrás da
   mesma interface) reabre a questão de consentimento de gravação do paciente —
   tratar em plano próprio.
