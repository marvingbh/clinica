---
title: Prontuário Eletrônico (registros clínicos CFP)
type: feat
status: planned
date: 2026-06-11
slug: prontuario-eletronico
priority: 10
complexity: XL
---

# feat: Prontuário Eletrônico — registros clínicos de sessão em conformidade com o CFP

## 1. Contexto de Negócio

### Problema

A Clinica hoje cobre todo o lado **administrativo** da clínica (agenda, faturamento, repasses,
fluxo de caixa), mas não possui o lado **clínico**: o registro documental obrigatório das sessões.
Os campos `Appointment.title` e `Appointment.notes` são administrativos e **permanecem intocados**
por esta feature — o prontuário é um domínio paralelo, com regras de sigilo, imutabilidade e
retenção próprias.

Manter prontuário é **obrigação legal** do psicólogo:

- **Res. CFP 01/2009** — obriga registro documental de atendimentos e guarda por **no mínimo 5 anos**.
- **Res. CFP 06/2019** — regras para elaboração de documentos psicológicos.
- **Lei 13.787/2018** — disciplina prontuário eletrônico e permite descarte após prazo de guarda
  (mínimo legal de 20 anos para prontuários médicos; para psicologia vale o mínimo CFP de 5 anos —
  por isso a retenção é configurável de 5 a 20 anos por clínica).
- **Código de Ética do Psicólogo (sigilo profissional)** — o conteúdo clínico não pode ser lido
  por pessoal administrativo. Isso inverte o padrão de RBAC do sistema: aqui o **ADMIN tem acesso
  NONE por padrão** e o PROFESSIONAL tem WRITE.

Sem prontuário, todo cliente é forçado a manter um segundo sistema (PsicoManager, papel, Google
Docs) — é o critério de compra nº 1 em todos os 8 ERPs brasileiros de clínica analisados
(PsicoManager, Corpora, Sintropia, iClinic, Amplimed, Clínica Ágil, Feegow) e em todas as
ferramentas internacionais específicas de psicologia (TherapyNotes, SimplePractice, Jane App).
É também o pré-requisito do upsell mais quente do mercado: **notas assistidas por IA**
(`ai-evolucao`) e o gerador de documentos CFP (`gerador-documentos-cfp`) — ambos consumirão o
JSON estruturado de seções definido aqui.

### Usuários-alvo

| Persona | Uso |
|---|---|
| **PROFESSIONAL (psicólogo)** | Registra evolução após cada sessão, assina notas, consulta histórico dos próprios pacientes |
| **Diretor clínico** (PROFESSIONAL com override `prontuario=READ` extra ou WRITE) | Lê prontuários de outros profissionais quando designado (toda leitura auditada) |
| **ADMIN (secretaria/gestor)** | **Não lê conteúdo clínico** (default NONE). Configura retenção e o profissional responsável por prontuários de profissionais desligados |
| Paciente | Sem acesso direto nesta fase (portal do paciente é roadmap futuro) |

### Métricas de sucesso

- ≥ 70% das CONSULTAs FINALIZADAS com nota registrada em até 48h (medível via job de pendências).
- Redução do churn citando "falta de prontuário" a zero nos cancelamentos.
- 0 incidentes de acesso indevido a conteúdo clínico (toda leitura de nota alheia auditada).
- Base pronta para `ai-evolucao` (seções JSON estruturadas) sem retrabalho de schema.

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **psicóloga**, ao finalizar uma CONSULTA quero clicar em "Registrar evolução" e abrir o
   editor já vinculado àquele atendimento, para registrar a sessão em menos de 2 minutos.
2. Como **psicóloga**, quero escolher um modelo (SOAP, DAP ou Livre) e preencher seções, com
   rascunho salvo automaticamente, para não perder texto.
3. Como **psicóloga**, quero **assinar** a nota tornando-a imutável, e corrigir erros apenas via
   **adendo**, para cumprir a exigência de retificação do CFP.
4. Como **psicóloga**, quero ver na aba "Prontuário" do paciente a linha do tempo de todas as
   notas (minhas e, se eu tiver permissão, de colegas), filtrando por profissional e período.
5. Como **psicóloga de grupo**, quero gerar um rascunho por participante de uma sessão de grupo
   com a data preenchida, para não criar 8 notas manualmente.
6. Como **psicóloga**, quero ver um aviso na agenda com a contagem de sessões finalizadas sem
   evolução registrada, e receber uma tarefa (Todo) diária por sessão pendente.
7. Como **diretora clínica**, quero ler notas de outros profissionais quando a clínica me
   designar, sabendo que cada leitura é auditada.
8. Como **ADMIN**, quero configurar o prazo de retenção (5–20 anos) e o profissional responsável
   por prontuários de profissionais desligados — **sem nunca ver conteúdo clínico**.
9. Como **ADMIN**, quero encerrar o prontuário de um paciente que recebeu alta (inicia a contagem
   de retenção) e, após o prazo, realizar o descarte formal com geração do termo de descarte.

### 2.2 Fluxos por papel

#### PROFESSIONAL — registrar evolução a partir da agenda
1. Abre uma CONSULTA (tipicamente FINALIZADO) no sheet de detalhe da agenda.
2. Clica **"Registrar evolução"** → `POST /api/prontuario/notes` cria rascunho vinculado
   (`appointmentId`) → redireciona para `/prontuario/{id}`.
3. Se já existir nota daquele profissional para aquele appointment, o botão vira
   **"Ver evolução"** e abre a nota existente (unicidade por profissional+appointment).
4. No editor: escolhe modelo (apenas enquanto todas as seções estão vazias), preenche seções,
   autosave com debounce de 1,5s. Conflito de edição em outra aba → 409 + toast.
5. Clica **"Assinar"** → modal de confirmação → nota vira ASSINADA (imutável).
6. Correção posterior: **"Adicionar adendo"** (texto livre, anexado e auditado; nunca altera o
   original).

#### PROFESSIONAL — nota avulsa (fora de sessão)
1. Na aba Prontuário do paciente, clica **"Nova anotação"** → rascunho com `appointmentId = null`,
   `sessionDate` editável (input mascarado DD/MM/YYYY) — para contatos extra-sessão, avaliações,
   encerramento.

#### PROFESSIONAL — sessão de grupo
1. No sheet da sessão de grupo, ação **"Registrar evoluções do grupo"** →
   `POST /api/prontuario/notes/bulk` cria um rascunho por participante (um por Appointment
   materializado do grupo), pulando participantes que já têm nota.
2. Lista de links para cada rascunho criado é exibida; o profissional edita um a um.

#### ADMIN — configuração e ciclo de vida do prontuário
1. Em `/admin/settings`, seção "Prontuário": retenção em anos (5–20) e
   "Profissional responsável por prontuários de profissionais desligados" (select).
2. Na aba Prontuário do paciente, o ADMIN **não vê notas** (default NONE) — vê apenas o painel de
   ciclo de vida: "Encerrar prontuário" (define `recordClosedAt`), banner com contagem regressiva
   de retenção e, após expirar, "Realizar descarte formal" → gera PDF do termo de descarte,
   remove as notas e grava auditoria + registro de descarte.

#### Diretor clínico (override READ)
1. Vê a aba Prontuário completa de qualquer paciente da clínica.
2. Ao abrir uma nota de outro profissional, o sistema grava `CLINICAL_NOTE_ACCESSED` no AuditLog.
3. Não edita nem assina notas alheias (escrita é sempre exclusiva do autor).

### 2.3 Telas

#### Tela 1 — Aba "Prontuário" na página de pacientes
Nova aba ao lado de "Dados | Histórico | Financeiro" em `PatientDetailsView`:
- **Cabeçalho**: botão "Nova anotação" (se `prontuario ≥ WRITE`), filtros: profissional
  (select), período (dois inputs mascarados DD/MM/YYYY).
- **Linha do tempo** (reverso-cronológica por `sessionDate`): cada item mostra autor, data/hora
  `DD/MM/YYYY HH:mm`, badge do tipo (`Evolução` azul, `Avaliação` roxo, `Encerramento` âmbar,
  `Outro` cinza), chip de status (`Assinada` verde / `Rascunho` cinza), formato (SOAP/DAP/Livre),
  vínculo com sessão ("Sessão de 14/05/2026 15:00 — Finalizado" ou "Sem vínculo com sessão"),
  contagem de adendos ("2 adendos"). Clique abre `/prontuario/{id}`.
- **Banner de retenção** (quando `recordClosedAt` definido): "Prontuário encerrado em
  DD/MM/YYYY. Guarda obrigatória até DD/MM/YYYY (X anos restantes)." Após expirado (somente
  ADMIN): botão "Realizar descarte formal".
- Estado vazio: "Nenhum registro clínico para este paciente."
- Usuário com `prontuario = NONE`: a aba não aparece (exceto o painel de ciclo de vida para
  ADMIN, que não expõe conteúdo).

#### Tela 2 — Editor de nota `/prontuario/[id]`
- **Cabeçalho**: nome do paciente, vínculo ("Sessão de DD/MM/YYYY HH:mm" + status atual do
  appointment, ou data da sessão editável quando avulsa), chip Rascunho/Assinada, indicador de
  autosave ("Salvando..." / "Salvo às HH:mm").
- **Seletor de modelo** (apenas em rascunho com seções vazias): cards SOAP / DAP / Livre +
  modelos da clínica.
- **Tipo de registro**: segmented `Evolução | Avaliação | Encerramento | Outro`.
- **Seções**: um textarea por seção do modelo (ex.: SOAP → Subjetivo, Objetivo, Avaliação,
  Plano), com helpText abaixo do label.
- **Rodapé (rascunho)**: "Excluir rascunho" (confirm), "Assinar" (primário).
- **Modal de assinatura**: "Ao assinar, esta nota se tornará **imutável**. Correções só poderão
  ser feitas por adendo. Deseja assinar?" — botões "Cancelar" / "Assinar nota".
- **Nota assinada**: seções somente leitura, faixa "Assinada por {nome} em DD/MM/YYYY HH:mm",
  lista de adendos (autor + data) e botão "Adicionar adendo" (textarea + confirmar; apenas
  autor ou leitor com WRITE? — **somente o autor**; ver regras).

#### Tela 3 — Pendências `/prontuario`
- Lista das CONSULTAs FINALIZADAS do próprio profissional sem nota (últimos 30 dias):
  paciente, data DD/MM/YYYY HH:mm, botão "Registrar evolução".
- Acessível pelo badge no cabeçalho da agenda.

#### Integrações de UI existentes
- **`CalendarEntrySheet`** (agenda): ação "Registrar evolução"/"Ver evolução" quando
  `type === CONSULTA && patient != null` e usuário tem `prontuario ≥ WRITE` (atenção ao gotcha
  do patient nulo — sempre `patient?.`).
- **Sheet de sessão de grupo**: ação "Registrar evoluções do grupo".
- **`AgendaHeader`**: badge de pendências (componente `nav-badge` existente) com contagem de
  `GET /api/prontuario/pending?countOnly=true`; oculto quando 0 ou sem permissão.
- **Sidebar/bottom-nav**: item "Prontuário" → `/prontuario` (apenas `prontuario ≥ WRITE`).

### 2.4 Regras de negócio

1. **Vínculo**: nota vincula-se somente a appointments `type = CONSULTA` (com paciente) ou fica
   avulsa (`appointmentId = null`). TAREFA/LEMBRETE/NOTA/REUNIAO **nunca** oferecem a ação.
2. **Unicidade**: no máximo **uma nota por (profissional, appointment)** — constraint única no
   banco (NULLs de `appointmentId` não são constrangidos pelo Postgres → várias notas avulsas OK).
3. **Imutabilidade**: `status = ASSINADA` ⇒ API rejeita UPDATE/DELETE (409/403). Única alteração
   permitida: criação de `NoteAddendum`. Rascunho pode ser editado/excluído pelo autor.
4. **Assinatura**: exige ao menos uma seção não vazia; persiste `signedAt`, `signedByUserId` e
   `contentHash` (SHA-256 do JSON canônico das seções + metadados clínicos). Operação atômica
   (guard `status = RASCUNHO` no UPDATE).
5. **Autoria**: escrita (editar, assinar, excluir rascunho, adendar) é exclusiva do
   **profissional autor** (`note.professionalProfileId === user.professionalProfileId`).
6. **Leitura**: autor sempre; outros usuários precisam de `prontuario ≥ READ` E
   (ser diretor designado via override OU ser o profissional responsável lendo notas de
   profissional inativo). Toda leitura de nota alheia gera `CLINICAL_NOTE_ACCESSED` no AuditLog.
7. **ADMIN default NONE**: clínicas podem conceder READ a um diretor clínico via override em
   `/admin/permissions` (UserPermission) — nunca por padrão.
8. **Retenção/descarte**: `Patient.recordClosedAt` inicia o relógio;
   prazo = `recordClosedAt + prontuarioRetentionYears` (clínica, 5–20, default 5).
   Descarte só após o prazo, só por ADMIN, gera termo de descarte (PDF), apaga as notas/adendos
   do paciente e grava `RecordDisposal` + AuditLog. Notas assinadas **nunca** são hard-deletadas
   fora do descarte formal.
9. **LGPD**: pedido de exclusão de paciente com notas assinadas → anonimização administrativa
   (fluxo existente de paciente) com retenção do prontuário sob base legal de obrigação legal;
   o FK `ClinicalNote.patientId` usa `onDelete: Restrict` para impedir cascade-delete acidental.
10. **Profissional desligado** (`User.isActive = false`): notas permanecem; o profissional
    configurado em `Clinic.prontuarioResponsibleProfessionalId` pode lê-las (auditado).
11. **Appointment remarcado/cancelado após rascunho**: vínculo é mantido; o editor exibe o
    status atual ("Sessão de DD/MM/YYYY HH:mm — Cancelado"). Appointment excluído → nota vira
    avulsa (`onDelete: SetNull`), preservando `sessionDate`.
12. **Pendências**: CONSULTA FINALIZADO há > 24h sem nota do profissional executante
    (`attendingProfessionalId ?? professionalProfileId`) gera Todo idempotente
    "Registrar evolução — {nome do paciente}".
13. **Conteúdo clínico nunca vai ao AuditLog** (`oldValues`/`newValues` só com metadados:
    ids, status, formato) — o AuditLog é legível por ADMIN (`audit_logs = READ`).

### 2.5 Textos pt-BR (copy)

| Chave | Texto |
|---|---|
| Aba | `Prontuário` |
| Ações | `Registrar evolução`, `Ver evolução`, `Nova anotação`, `Registrar evoluções do grupo`, `Assinar`, `Adicionar adendo`, `Excluir rascunho`, `Encerrar prontuário`, `Reabrir prontuário`, `Realizar descarte formal` |
| Tipos | `Evolução`, `Avaliação`, `Encerramento`, `Outro` |
| Formatos | `SOAP`, `DAP`, `Livre` |
| Seções SOAP | `Subjetivo`, `Objetivo`, `Avaliação`, `Plano` |
| Seções DAP | `Dados`, `Avaliação`, `Plano` |
| Seção Livre | `Registro` |
| Chips | `Rascunho`, `Assinada` |
| Modal assinar | `Ao assinar, esta nota se tornará imutável e não poderá mais ser editada ou excluída. Correções posteriores deverão ser feitas por adendo. Deseja assinar?` |
| Toast assinada | `Nota assinada com sucesso.` |
| Toast conflito (409) | `Esta nota foi alterada em outra aba ou dispositivo. Recarregue a página para continuar.` |
| Erro nota assinada | `Notas assinadas não podem ser alteradas. Adicione um adendo.` |
| Erro seções vazias | `Preencha ao menos uma seção antes de assinar.` |
| Todo pendência | `Registrar evolução — {{patientName}}` |
| Badge agenda (tooltip) | `{n} sessões sem evolução registrada` |
| Banner retenção | `Prontuário encerrado em {data}. Guarda obrigatória até {data} ({n} anos restantes).` |
| Banner expirado | `Prazo de guarda cumprido. O descarte formal está liberado.` |
| Confirm descarte | `O descarte é definitivo: todos os registros clínicos deste paciente serão eliminados e um termo de descarte será gerado. Esta ação não pode ser desfeita.` |
| Sem permissão | `Você não tem permissão para acessar o prontuário.` |
| Vazio | `Nenhum registro clínico para este paciente.` |
| Sem vínculo | `Sem vínculo com sessão` |

### 2.6 Casos de borda

- **Duas abas editando o mesmo rascunho** → lock otimista por `updatedAt` ⇒ 409 + toast.
- **Sign concorrente com autosave** → guard atômico `updateMany({ where: { status: "RASCUNHO", updatedAt } })`; perdedor recebe 409.
- **Botão em CONSULTA sem paciente** (dado legado inválido) → ação oculta (`patient?.` em tudo).
- **Recorrências/quinzenais** → naturais: notas apontam para linhas materializadas de `Appointment`.
- **Bulk de grupo com membro que já tem nota** → pulado (resposta informa `skipped`).
- **Profissional sem `professionalProfileId`** (ADMIN puro) com WRITE via override → criação de
  nota retorna 422 `Apenas profissionais podem criar registros clínicos.`
- **Clínica sem templates** → seed lazy dos 3 padrões no primeiro `GET /api/prontuario/templates`.
- **`recordClosedAt` removido (reabertura)** antes do descarte → permitido para ADMIN, auditado.
- **Descarte com prazo não cumprido** → 422 `O prazo legal de guarda ainda não foi cumprido.`
- **Job de pendências**: janela de lookback de 14 dias (não cria Todos para histórico antigo
  importado); reexecução não duplica (unique parcial em `Todo.sourceAppointmentId`).

---

## 3. Design Técnico

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

Novos enums:

```prisma
enum ClinicalNoteType {
  EVOLUCAO
  AVALIACAO
  ENCERRAMENTO
  OUTRO
}

enum ClinicalNoteFormat {
  SOAP
  DAP
  LIVRE
}

enum ClinicalNoteStatus {
  RASCUNHO
  ASSINADA
}
```

Novos modelos (todos clinic-scoped):

```prisma
/// Registro clínico de sessão (prontuário). Conteúdo sob sigilo profissional —
/// NUNCA logar `sections` em AuditLog nem expor a usuários sem acesso ao feature "prontuario".
model ClinicalNote {
  id                    String             @id @default(cuid())
  clinicId              String
  patientId             String
  professionalProfileId String             // autor (único que escreve)
  appointmentId         String?            // null = nota avulsa
  templateId            String?
  noteType              ClinicalNoteType   @default(EVOLUCAO)
  format                ClinicalNoteFormat @default(SOAP)
  /// JSON { [sectionId: string]: string } — chaves validadas contra sectionDefs do template
  sections              Json               @default("{}")
  /// Data clínica da sessão (espelha appointment.scheduledAt quando vinculada)
  sessionDate           DateTime
  status                ClinicalNoteStatus @default(RASCUNHO)
  signedAt              DateTime?
  signedByUserId        String?
  /// SHA-256 do JSON canônico (integridade pós-assinatura)
  contentHash           String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic              Clinic               @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  patient             Patient              @relation(fields: [patientId], references: [id], onDelete: Restrict)
  professionalProfile ProfessionalProfile  @relation(fields: [professionalProfileId], references: [id], onDelete: Restrict)
  appointment         Appointment?         @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  template            NoteTemplate?        @relation(fields: [templateId], references: [id], onDelete: SetNull)
  signedBy            User?                @relation("SignedClinicalNotes", fields: [signedByUserId], references: [id], onDelete: SetNull)
  addenda             NoteAddendum[]

  // 1 nota por profissional+appointment (NULLs não constrangem notas avulsas)
  @@unique([professionalProfileId, appointmentId], name: "ClinicalNote_prof_appointment_uniq")
  @@index([clinicId])
  @@index([clinicId, patientId, sessionDate])
  @@index([clinicId, professionalProfileId, status])
  @@index([patientId])
  @@index([appointmentId])
}

/// Adendo (retificação CFP) — única forma de alterar nota assinada. Imutável após criado.
model NoteAddendum {
  id           String   @id @default(cuid())
  clinicId     String
  noteId       String
  authorUserId String?
  content      String
  createdAt    DateTime @default(now())

  clinic Clinic       @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  note   ClinicalNote @relation(fields: [noteId], references: [id], onDelete: Cascade)
  author User?        @relation(fields: [authorUserId], references: [id], onDelete: SetNull)

  @@index([noteId])
  @@index([clinicId])
}

/// Modelo de nota por clínica. sectionDefs: [{ id, label, helpText? }]
model NoteTemplate {
  id          String             @id @default(cuid())
  clinicId    String
  name        String
  format      ClinicalNoteFormat
  sectionDefs Json
  isActive    Boolean            @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic Clinic         @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  notes  ClinicalNote[]

  @@unique([clinicId, name])
  @@index([clinicId, isActive])
}

/// Registro permanente do descarte formal (Lei 13.787/2018) — permite reimprimir o termo.
model RecordDisposal {
  id                 String   @id @default(cuid())
  clinicId           String
  patientId          String   // mantido como string mesmo se paciente for depois anonimizado
  patientName        String   // snapshot para o termo
  disposedByUserId   String?
  recordClosedAt     DateTime
  retentionYears     Int
  notesCount         Int
  addendaCount       Int
  oldestSessionDate  DateTime?
  newestSessionDate  DateTime?
  /// hashes das notas assinadas descartadas (evidência de integridade)
  contentHashes      Json     @default("[]")
  disposedAt         DateTime @default(now())

  clinic     Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  disposedBy User?  @relation(fields: [disposedByUserId], references: [id], onDelete: SetNull)

  @@index([clinicId, disposedAt])
}
```

Alterações em modelos existentes:

```prisma
model Clinic {
  // ... campos existentes ...
  prontuarioRetentionYears            Int     @default(5)  // 5–20 (validado na API)
  prontuarioResponsibleProfessionalId String? // lê notas de profissionais desligados
  prontuarioResponsibleProfessional   ProfessionalProfile? @relation("ProntuarioResponsible", fields: [prontuarioResponsibleProfessionalId], references: [id], onDelete: SetNull)

  clinicalNotes  ClinicalNote[]
  noteAddenda    NoteAddendum[]
  noteTemplates  NoteTemplate[]
  recordDisposals RecordDisposal[]
}

model Patient {
  // ... campos existentes ...
  recordClosedAt DateTime?          // início do relógio de retenção
  clinicalNotes  ClinicalNote[]
}

model ProfessionalProfile {
  // ... relações existentes ...
  clinicalNotes               ClinicalNote[]
  prontuarioResponsibleFor    Clinic[]       @relation("ProntuarioResponsible")
}

model User {
  // ... relações existentes ...
  signedClinicalNotes ClinicalNote[]   @relation("SignedClinicalNotes")
  noteAddenda         NoteAddendum[]
  recordDisposals     RecordDisposal[]
}

model Appointment {
  // ... relações existentes ...
  clinicalNotes ClinicalNote[]
}

model Todo {
  // ... campos existentes ...
  /// Appointment de origem quando o Todo foi gerado pelo job de pendências de prontuário.
  /// Unique parcial (WHERE NOT NULL) garante idempotência do cron — ver migration.
  sourceAppointmentId String?
  @@index([sourceAppointmentId])
}
```

> Nota sobre `Todo.sourceAppointmentId`: segue exatamente o padrão já usado pela migração
> `20260503100000_todo_recurrence_day_unique` (unique parcial não exprimível no DSL do Prisma,
> documentado em comentário + `skipDuplicates` no `createMany`). **Sem FK** para `Appointment`
> (igual a `sessionGroupId`) para não acoplar exclusão de appointments a Todos.

#### Migração (SQL autorado offline — NUNCA `prisma db push`/`migrate dev`)

`prisma/migrations/20260611000000_add_prontuario/migration.sql` contendo, na ordem:
1. `CREATE TYPE "ClinicalNoteType" / "ClinicalNoteFormat" / "ClinicalNoteStatus"`.
2. `CREATE TABLE "ClinicalNote" / "NoteAddendum" / "NoteTemplate" / "RecordDisposal"` + FKs
   (espelhar `onDelete` acima) + índices + unique
   `"ClinicalNote_professionalProfileId_appointmentId_key"`.
3. `ALTER TABLE "Clinic" ADD COLUMN "prontuarioRetentionYears" INTEGER NOT NULL DEFAULT 5,
   ADD COLUMN "prontuarioResponsibleProfessionalId" TEXT;` + FK `SET NULL`.
4. `ALTER TABLE "Patient" ADD COLUMN "recordClosedAt" TIMESTAMP(3);`
5. `ALTER TABLE "Todo" ADD COLUMN "sourceAppointmentId" TEXT;`
   `CREATE UNIQUE INDEX "Todo_sourceAppointmentId_uniq" ON "Todo"("sourceAppointmentId")
   WHERE "sourceAppointmentId" IS NOT NULL;`
   `CREATE INDEX "Todo_sourceAppointmentId_idx" ON "Todo"("sourceAppointmentId");`

Aplicação local segue o procedimento offline do projeto (worktree + banco isolado via
`scripts/new-feature.sh prontuario-eletronico`); em produção `prisma migrate deploy` roda no
`vercel-build`.

### 3.2 RBAC — novo feature `prontuario`

`src/lib/rbac/types.ts`:
- Adicionar `"prontuario"` ao array `FEATURES`.
- `FEATURE_LABELS`: `prontuario: "Prontuario"` (labels existentes não usam acento).

`src/lib/rbac/permissions.ts` (`ROLE_DEFAULTS`):
- `ADMIN: { ..., prontuario: "NONE" }` ← **inversão deliberada** (sigilo profissional).
- `PROFESSIONAL: { ..., prontuario: "WRITE" }`.

Overrides via `UserPermission` (UI existente `/admin/permissions`) permitem conceder READ a um
diretor clínico. `resolvePermissions` já trata feature ausente como NONE para sessões antigas.

### 3.3 Helper de ownership — `src/lib/clinic/ownership.ts` (novo)

O helper referenciado pela convenção de isolamento de tenant **ainda não existe no repo** — esta
feature o introduz (e ele passa a ser reutilizável pelos demais módulos):

```typescript
// src/lib/clinic/ownership.ts
/** Lança OwnershipError (→ 404) se o registro não pertencer à clínica. */
export async function assertPatientInClinic(clinicId: string, patientId: string): Promise<void>
export async function assertAppointmentInClinic(
  clinicId: string,
  appointmentId: string
): Promise<{ id: string; type: AppointmentType; patientId: string | null; scheduledAt: Date; status: AppointmentStatus; professionalProfileId: string; attendingProfessionalId: string | null }>
export async function assertProfessionalInClinic(clinicId: string, professionalProfileId: string): Promise<void>
export class OwnershipError extends Error {}
```

Implementação: `prisma.<model>.findFirst({ where: { id, clinicId }, select: {...} })`; retorno
nulo ⇒ `OwnershipError` (rotas respondem 404 — nunca 403, para não vazar existência entre
tenants). Arquivo < 100 linhas + `ownership.test.ts` (mock de prisma).

### 3.4 Módulo de domínio `src/lib/prontuario/` (funções puras + testes colocados)

```
src/lib/prontuario/
├── index.ts            # barrel
├── types.ts            # NoteSections, SectionDef, NoteAccessContext, PendingAppointment...
├── templates.ts        # modelos padrão pt-BR + validação de sectionDefs
├── sections.ts         # validação/merge de seções
├── content-hash.ts     # canonicalização + SHA-256 (node:crypto)
├── immutability.ts     # transições rascunho→assinada, edit/delete guards
├── access.ts           # decisão pura de acesso a notas (sigilo)
├── retention.ts        # prazo de guarda, countdown, liberação de descarte
├── pending-notes.ts    # cálculo de pendências (job + badge)
├── group-drafts.ts     # inputs de rascunhos em lote p/ grupos
└── descarte.ts         # dados do termo de descarte
```

Assinaturas principais:

```typescript
// types.ts
export type NoteSections = Record<string, string>
export interface SectionDef { id: string; label: string; helpText?: string }
export interface NoteAccessContext {
  viewerUserId: string
  viewerProfessionalProfileId: string | null
  viewerProntuarioAccess: FeatureAccess          // resolvido do RBAC
  noteAuthorProfessionalProfileId: string
  noteAuthorIsActive: boolean                    // User.isActive do autor
  clinicResponsibleProfessionalId: string | null // Clinic.prontuarioResponsibleProfessionalId
  noteStatus: "RASCUNHO" | "ASSINADA"
}

// templates.ts
export const DEFAULT_TEMPLATES: ReadonlyArray<{ name: string; format: ClinicalNoteFormat; sectionDefs: SectionDef[] }>
// → "SOAP" [subjetivo, objetivo, avaliacao, plano], "DAP" [dados, avaliacao, plano], "Livre" [registro]
export function validateSectionDefs(defs: unknown): SectionDef[]           // lança em shape inválido

// sections.ts
export function validateSections(sections: unknown, defs: SectionDef[]): NoteSections
// chaves ⊆ defs.map(d => d.id); valores string; tamanho máx. 20_000 chars por seção
export function hasAnyContent(sections: NoteSections): boolean
export function mergeSectionUpdate(current: NoteSections, patch: NoteSections, defs: SectionDef[]): NoteSections

// content-hash.ts
export function canonicalizeNoteContent(input: {
  patientId: string; professionalProfileId: string; appointmentId: string | null
  noteType: string; format: string; sessionDate: string /* ISO */; sections: NoteSections
}): string                                       // JSON com chaves ordenadas, determinístico
export function computeContentHash(canonical: string): string  // sha256 hex (node:crypto)

// immutability.ts
export function canEditNote(status: ClinicalNoteStatus): boolean      // só RASCUNHO
export function canDeleteNote(status: ClinicalNoteStatus): boolean    // só RASCUNHO
export function validateSign(status: ClinicalNoteStatus, sections: NoteSections):
  { ok: true } | { ok: false; reason: "ALREADY_SIGNED" | "EMPTY_SECTIONS" }
export function isStaleUpdate(clientUpdatedAt: string, dbUpdatedAt: Date): boolean // lock otimista

// access.ts
export type NoteAccessDecision =
  | { allowed: false }
  | { allowed: true; mode: "AUTHOR" | "DIRECTOR_READ" | "RESPONSIBLE_READ"; auditRead: boolean }
export function decideNoteAccess(ctx: NoteAccessContext): NoteAccessDecision
// AUTHOR: viewerProfessionalProfileId === autor (auditRead: false)
// DIRECTOR_READ: access ≥ READ e não-autor (auditRead: true)
// RESPONSIBLE_READ: autor inativo e viewer === clinicResponsible (auditRead: true)
// allowed=false: access NONE e não-autor (autor sempre pode ler a própria nota)
export function canWriteNote(ctx: NoteAccessContext): boolean
// exige AUTHOR + access ≥ WRITE + status RASCUNHO (adendo: AUTHOR + WRITE, status ASSINADA)

// retention.ts
export function clampRetentionYears(years: number): number   // 5..20
export function retentionDeadline(recordClosedAt: Date, retentionYears: number): Date
export function canDispose(recordClosedAt: Date | null, retentionYears: number, now: Date):
  { ok: true } | { ok: false; reason: "NOT_CLOSED" | "WITHIN_RETENTION" }
export function formatRetentionBanner(recordClosedAt: Date, retentionYears: number, now: Date): string // pt-BR DD/MM/YYYY

// pending-notes.ts
export interface PendingAppointment {
  id: string; patientId: string | null; patientName: string | null
  scheduledAt: Date; status: string; type: string
  professionalProfileId: string; attendingProfessionalId: string | null
}
export function resolveNoteOwnerProfessional(appt: PendingAppointment): string
// attendingProfessionalId ?? professionalProfileId
export function filterPendingAppointments(
  appts: PendingAppointment[], existingNoteApptIds: Set<string>, now: Date,
  opts?: { minHoursSinceSession?: number /* 24 */; lookbackDays?: number /* 14 */ }
): PendingAppointment[]
// CONSULTA + FINALIZADO + patientId != null + sem nota + >24h + dentro do lookback
export function buildPendingTodoInput(appt: PendingAppointment, todayIso: string):
  { clinicId?: never; professionalProfileId: string; title: string; day: string; sourceAppointmentId: string }
// title: `Registrar evolução — ${patientName}` (patientName com ?? "Paciente")

// group-drafts.ts
export interface GroupMemberAppointment { appointmentId: string; patientId: string; scheduledAt: Date }
export function buildGroupDraftInputs(
  members: GroupMemberAppointment[], existingNoteApptIds: Set<string>,
  base: { clinicId: string; professionalProfileId: string; format: ClinicalNoteFormat; templateId: string | null }
): { drafts: Array<{...note create input}> ; skipped: string[] /* appointmentIds */ }

// descarte.ts
export interface TermoDescarteData {
  clinicName: string; patientName: string; recordClosedAt: Date; retentionYears: number
  disposedAt: Date; disposedByName: string; notesCount: number; addendaCount: number
  oldestSessionDate: Date | null; newestSessionDate: Date | null; contentHashes: string[]
}
export function buildTermoDescarteData(input: {...}): TermoDescarteData
export function formatTermoDescarteLines(data: TermoDescarteData): string[]  // parágrafos pt-BR p/ o PDF
```

Todos os arquivos < 200 linhas, sem dependência de framework/Prisma (exceto tipos de enum como
string literals), cada um com `*.test.ts` colocado.

### 3.5 Rotas de API (adaptadores finos — `withFeatureAuth`, self-scoped por `clinicId`)

Todas em `src/app/api/prontuario/`; **toda query Prisma inclui `clinicId: user.clinicId`**;
todo id de FK vindo do body é validado via `src/lib/clinic/ownership.ts`. Zod em todos os bodies.

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/prontuario/notes` | GET | `{ feature: "prontuario", minAccess: "READ" }` | Lista notas. Query: `patientId` (obrigatório), `professionalProfileId?`, `from?`, `to?` (YYYY-MM-DD), `page?`. Self-scoping: sem override READ amplo, força `professionalProfileId = user.professionalProfileId` (mesma convenção `agenda_own`). Retorna metadados + `sections` somente das notas que `decideNoteAccess` permitir; nunca retorna notas de outros para quem não pode. |
| `/api/prontuario/notes` | POST | `{ feature: "prontuario", minAccess: "WRITE" }` | Cria rascunho. Body: `{ patientId, appointmentId?, noteType?, format?, templateId?, sessionDate? }`. Valida: user tem `professionalProfileId` (422 se não); `assertPatientInClinic`; se `appointmentId`: `assertAppointmentInClinic` + `type === "CONSULTA"` + `appointment.patientId === patientId` (422 caso contrário) + `sessionDate = appointment.scheduledAt`. Conflito de unicidade (P2002) ⇒ 409 com `existingNoteId`. Audita `CLINICAL_NOTE_CREATED` (sem conteúdo). Resposta 201 `{ note }`. |
| `/api/prontuario/notes/[id]` | GET | READ | Busca nota + adendos + dados do vínculo (`appointment.scheduledAt/status`) + nome do paciente/autor. `findFirst({ id, clinicId })` ⇒ 404 se não achar. `decideNoteAccess` ⇒ 403; se `auditRead` ⇒ `CLINICAL_NOTE_ACCESSED`. |
| `/api/prontuario/notes/[id]` | PATCH | WRITE | Autosave/edição de rascunho. Body: `{ sections?, noteType?, format?, templateId?, sessionDate?, updatedAt }` (`updatedAt` ISO obrigatório — lock otimista). Só autor (`canWriteNote`). Troca de `format/templateId` só com `!hasAnyContent`. `updateMany({ where: { id, clinicId, professionalProfileId: user.professionalProfileId, status: "RASCUNHO", updatedAt: client } })`; `count === 0` ⇒ relê a nota: assinada ⇒ 409 `SIGNED`, updatedAt diferente ⇒ 409 `STALE`. Audita `CLINICAL_NOTE_UPDATED` (metadados). |
| `/api/prontuario/notes/[id]` | DELETE | WRITE | Exclui **rascunho** do próprio autor (`deleteMany` com guard `status: "RASCUNHO"`). Assinada ⇒ 403. Audita `CLINICAL_NOTE_DELETED`. |
| `/api/prontuario/notes/[id]/sign` | POST | WRITE | Assina. Só autor; `validateSign`; computa `contentHash` via `canonicalizeNoteContent`/`computeContentHash`; `updateMany` com guard `status: "RASCUNHO"` setando `status, signedAt, signedByUserId: user.id, contentHash`. Audita `CLINICAL_NOTE_SIGNED` (`newValues: { contentHash }`). |
| `/api/prontuario/notes/[id]/addenda` | POST | WRITE | Cria adendo. Só autor, só em nota ASSINADA. Body `{ content }` (1–10_000 chars). Audita `CLINICAL_NOTE_ADDENDUM_CREATED`. |
| `/api/prontuario/notes/bulk` | POST | WRITE | Rascunhos de grupo. Body: `{ appointmentIds: string[] }` (máx. 30). Para cada id: `assertAppointmentInClinic` + CONSULTA + patient + mesmo `scheduledAt`/grupo; `buildGroupDraftInputs` + `createMany({ skipDuplicates: true })` (a unique prof+appointment garante idempotência). Resposta `{ created: [...ids], skipped: [...] }`. |
| `/api/prontuario/templates` | GET | READ | Lista templates ativos da clínica; se vazio, seed lazy de `DEFAULT_TEMPLATES` (`createMany` + `skipDuplicates`, unique `[clinicId, name]`). |
| `/api/prontuario/templates` | POST | WRITE | Cria template custom (`name`, `format`, `sectionDefs` validado por `validateSectionDefs`). |
| `/api/prontuario/templates/[id]` | PATCH/DELETE | WRITE | Renomeia/desativa (`isActive=false`; nunca hard-delete se houver notas). |
| `/api/prontuario/pending` | GET | WRITE | Pendências do próprio profissional: busca CONSULTAs FINALIZADAS (lookback 30d) sem nota → `filterPendingAppointments`. `?countOnly=true` ⇒ `{ count }` (badge da agenda). |
| `/api/prontuario/record/[patientId]` | PATCH | `withFeatureAuth({ feature: "patients", minAccess: "WRITE" })` | Ciclo de vida (não expõe conteúdo — por isso feature `patients`): body `{ action: "close" | "reopen" }` seta/limpa `Patient.recordClosedAt`. `assertPatientInClinic`. Audita `PATIENT_RECORD_CLOSED/REOPENED`. |
| `/api/prontuario/record/[patientId]/descarte` | POST | `patients` WRITE + `user.role === "ADMIN"` (check no handler) | `canDispose` ⇒ 422 se dentro do prazo. Em `prisma.$transaction`: snapshot (counts, hashes, datas) → cria `RecordDisposal` → `deleteMany` de `NoteAddendum`/`ClinicalNote` do paciente (escopado por `clinicId`). Audita `PATIENT_RECORD_DISPOSED`. Resposta: PDF do termo (`@react-pdf/renderer`, mesmo pipeline de `src/lib/financeiro/invoice-pdf.tsx`) — novo `src/lib/prontuario/termo-descarte-pdf.tsx`. |
| `/api/jobs/pending-clinical-notes` | GET/POST | Bearer `CRON_SECRET` (padrão dos jobs existentes) | Ver §3.7. |

Notas de tenant-scoping:
- `GET /notes` exige `patientId` e valida `assertPatientInClinic` antes de listar.
- 404 (não 403) para registros de outra clínica.
- Rotas de nota usam `findFirst({ where: { id: params.id, clinicId: user.clinicId } })` — nunca
  `findUnique` por id puro.
- Mutações condicionais usam `updateMany/deleteMany` com guards (`clinicId`, autor, `status`,
  `updatedAt`) para serem atômicas — sem janela TOCTOU.

### 3.6 Auditoria (`src/lib/rbac/audit.ts`)

Adicionar a `AuditAction`:

```typescript
// Prontuário (NUNCA incluir conteúdo de seções em oldValues/newValues)
CLINICAL_NOTE_CREATED: "CLINICAL_NOTE_CREATED",
CLINICAL_NOTE_UPDATED: "CLINICAL_NOTE_UPDATED",
CLINICAL_NOTE_SIGNED: "CLINICAL_NOTE_SIGNED",
CLINICAL_NOTE_DELETED: "CLINICAL_NOTE_DELETED",
CLINICAL_NOTE_ADDENDUM_CREATED: "CLINICAL_NOTE_ADDENDUM_CREATED",
CLINICAL_NOTE_ACCESSED: "CLINICAL_NOTE_ACCESSED",          // leitura de nota alheia
PATIENT_RECORD_CLOSED: "PATIENT_RECORD_CLOSED",
PATIENT_RECORD_REOPENED: "PATIENT_RECORD_REOPENED",
PATIENT_RECORD_DISPOSED: "PATIENT_RECORD_DISPOSED",
PENDING_NOTES_JOB_EXECUTED: "PENDING_NOTES_JOB_EXECUTED",
```

`entityType: "ClinicalNote" | "Patient"`. Payload permitido: ids, `status`, `format`, `noteType`,
`contentHash`, contagens. Adicionar labels pt-BR em `src/lib/audit/field-labels.ts` se aplicável.

### 3.7 Cron job de pendências

- **Lógica pura**: `src/lib/prontuario/pending-notes.ts` (§3.4) — testável sem Prisma, mesmo
  padrão de `src/lib/jobs/send-reminders.ts`.
- **Rota**: `src/app/api/jobs/pending-clinical-notes/route.ts` — verifica
  `authorization === Bearer ${CRON_SECRET}`; por clínica ativa: busca CONSULTAs
  `status: FINALIZADO`, `patientId != null`, `scheduledAt` entre `now-14d` e `now-24h`;
  busca notas existentes desses appointments (`select appointmentId, professionalProfileId`);
  `filterPendingAppointments` → `buildPendingTodoInput` →
  `prisma.todo.createMany({ data, skipDuplicates: true })` (idempotente via unique parcial em
  `sourceAppointmentId`). Grava `PENDING_NOTES_JOB_EXECUTED` por clínica com contagens.
- **vercel.json**: adicionar
  `{ "path": "/api/jobs/pending-clinical-notes", "schedule": "0 9 * * *" }` (09:00 UTC = 06:00 BRT,
  antes do dia clínico; não conflita com os 4 crons existentes).

### 3.8 UI — páginas e componentes

**Novos** (todos < 200 linhas; client components com react-hook-form + zod onde houver form;
datas via inputs mascarados DD/MM/YYYY reutilizando `DateInput`/`date-picker-input` existentes;
ícones lucide; toasts Sonner; **zero `useEffect` cru** — fetch via handlers/`useMountEffect`,
debounce do autosave via ref + `setTimeout` disparado no `onChange`):

```
src/app/prontuario/
├── page.tsx                         # pendências do profissional (Tela 3)
├── [id]/page.tsx                    # editor (Tela 2) — orquestra, gated por useRequireAuth({ feature: "prontuario" })
└── components/
    ├── NoteEditor.tsx               # estado do form + autosave + 409 handling
    ├── NoteSectionField.tsx         # label + textarea + helpText
    ├── TemplatePicker.tsx           # cards SOAP/DAP/Livre + templates da clínica
    ├── NoteTypeSegmented.tsx        # Evolução|Avaliação|Encerramento|Outro (usa ui/segmented)
    ├── SignConfirmDialog.tsx        # modal de assinatura
    ├── AddendumList.tsx             # lista + form de adendo
    ├── NoteStatusChip.tsx           # Rascunho/Assinada (reuso em timeline e editor)
    └── PendingNotesList.tsx         # lista da Tela 3

src/app/patients/components/prontuario/
├── ProntuarioTab.tsx                # aba na PatientDetailsView (timeline + filtros)
├── NoteTimelineItem.tsx             # item da linha do tempo
└── RetentionPanel.tsx               # encerrar/reabrir/banner/descarte (visível p/ ADMIN via feature "patients")

src/app/agenda/components/PendingNotesBadge.tsx   # badge no AgendaHeader (nav-badge + fetch countOnly)
src/lib/prontuario/termo-descarte-pdf.tsx          # PDF @react-pdf/renderer (padrão invoice-pdf.tsx)
```

**Arquivos existentes alterados** (mudanças mínimas — vários já excedem 300 linhas; não inchá-los):

| Arquivo | Mudança |
|---|---|
| `src/app/patients/components/PatientDetailsView.tsx` | `PatientTabKey` ganha `"prontuario"`; botão de aba (gated por permissão via `usePermission`); render delega 100% a `<ProntuarioTab patient={...} />`. (~15 linhas) |
| `src/app/agenda/components/CalendarEntrySheet.tsx` | Botão "Registrar evolução"/"Ver evolução" (CONSULTA + `patient?.id` + WRITE). Handler: `POST /notes`, em 409 navega para `existingNoteId`. (~25 linhas; se estourar, extrair `RegisterEvolutionButton.tsx`) |
| `src/app/agenda/components/GroupSessionSheet.tsx` | Ação "Registrar evoluções do grupo" → `POST /notes/bulk`. |
| `src/app/agenda/components/AgendaHeader.tsx` | Renderiza `<PendingNotesBadge />`. (1 linha) |
| `src/shared/components/ui/sidebar-nav.tsx` + `bottom-navigation.tsx` | Item "Prontuário" → `/prontuario` (gated `prontuario ≥ WRITE`). |
| `src/app/admin/settings/page.tsx` | Seção "Prontuário": retenção (5–20) + select do profissional responsável. |
| `src/app/api/clinic/...` (rota de settings existente) | Aceitar/validar `prontuarioRetentionYears` (clamp 5–20) e `prontuarioResponsibleProfessionalId` (`assertProfessionalInClinic`). |
| `src/lib/rbac/types.ts`, `permissions.ts`, `audit.ts` | §3.2 / §3.6. |
| `vercel.json` | Novo cron (§3.7). |
| `prisma/schema.prisma` + migration | §3.1. |

**Autosave sem useEffect** (padrão a seguir no `NoteEditor`):
- `onChange` do textarea grava no state do form e agenda `saveTimerRef.current = setTimeout(flush, 1500)` (limpando o anterior) — tudo dentro do event handler.
- `flush()` envia PATCH com o `updatedAt` conhecido; sucesso atualiza `updatedAt` local; 409 ⇒ toast + trava o form com CTA "Recarregar".
- `useMountEffect(() => () => clearTimeout(saveTimerRef.current))` apenas para cleanup no unmount.
- Troca de paciente/nota usa `key={noteId}` para resetar o editor.

### 3.9 Pontos de integração — resumo

- **RBAC**: novo feature `prontuario` (defaults invertidos) + UI de overrides existente sem mudança.
- **AuditLog**: 10 novas actions; leitura de nota alheia sempre auditada; conteúdo nunca logado.
- **Todos**: job cria Todos idempotentes (`sourceAppointmentId` + unique parcial); aparecem
  naturalmente na faixa de tarefas da agenda e em `/tarefas` sem mudança nesses fluxos.
- **Cron**: 5º cron em `vercel.json`.
- **Agenda**: ações no `CalendarEntrySheet`/`GroupSessionSheet` + badge no header.
- **Pacientes**: 4ª aba + painel de retenção; `recordClosedAt` no Patient.
- **PDF**: termo de descarte com `@react-pdf/renderer` (pipeline já usado por invoices).
- **Futuro**: `sections` JSON é o substrato de `ai-evolucao` e `gerador-documentos-cfp` — não
  achatar para texto puro.

---

## 4. Plano de Testes (vitest, colocados, `describe/it/expect` de "vitest")

Enums Prisma como string literals (`"RASCUNHO"`, `"CONSULTA"` etc.). `vi.useFakeTimers()` onde
houver `now`.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/prontuario/templates.test.ts` | DEFAULT_TEMPLATES tem SOAP(4 seções)/DAP(3)/Livre(1) com ids estáveis; `validateSectionDefs` rejeita id duplicado, label vazio, shape não-array; aceita helpText opcional |
| `src/lib/prontuario/sections.test.ts` | `validateSections` rejeita chave fora do template, valor não-string, seção > 20k chars; aceita subset; `hasAnyContent` falso p/ `{}`/só-espaços; `mergeSectionUpdate` preserva seções não enviadas |
| `src/lib/prontuario/content-hash.test.ts` | canonicalização é estável sob reordenação de chaves; hash determinístico (mesmo input ⇒ mesmo sha256 hex de 64 chars); 1 char diferente ⇒ hash diferente; `sessionDate` ISO incluída no hash |
| `src/lib/prontuario/immutability.test.ts` | RASCUNHO: editável/excluível; ASSINADA: nenhum dos dois; `validateSign` ⇒ `ALREADY_SIGNED` p/ assinada, `EMPTY_SECTIONS` p/ `{}` ou só-espaços, ok com 1 seção preenchida; `isStaleUpdate` true quando timestamps divergem (tolerância 0 ms) |
| `src/lib/prontuario/access.test.ts` | autor lê/escreve mesmo com access READ (leitura) — escreve exige WRITE; não-autor com READ ⇒ `DIRECTOR_READ` + `auditRead: true`; não-autor NONE ⇒ negado; responsável lê nota de autor **inativo** (`RESPONSIBLE_READ`), mas não de autor ativo sem READ; `canWriteNote` nega não-autor com WRITE; adendo permitido só ao autor em ASSINADA |
| `src/lib/prontuario/retention.test.ts` | `clampRetentionYears(3)=5`, `(25)=20`, `(10)=10`; `retentionDeadline` soma anos (29/02 → 28/02 em não-bissexto); `canDispose`: `NOT_CLOSED` sem recordClosedAt, `WITHIN_RETENTION` antes do prazo, ok depois; banner formata DD/MM/YYYY |
| `src/lib/prontuario/pending-notes.test.ts` | FINALIZADO >24h sem nota ⇒ pendente; com nota ⇒ não; <24h ⇒ não; AGENDADO/CANCELADO ⇒ não; tipo REUNIAO ⇒ não; `patientId null` ⇒ não (gotcha); fora do lookback 14d ⇒ não; `resolveNoteOwnerProfessional` prefere attending; título do Todo = `Registrar evolução — {nome}` e `day = todayIso` |
| `src/lib/prontuario/group-drafts.test.ts` | um draft por membro; membros com nota existente em `skipped`; `sessionDate` = scheduledAt do appointment; lista vazia ⇒ `{ drafts: [], skipped: [] }` |
| `src/lib/prontuario/descarte.test.ts` | `buildTermoDescarteData` agrega contagens/hashes/datas extremas; `formatTermoDescarteLines` cita Res. CFP 01/2009 + Lei 13.787/2018, datas DD/MM/YYYY |
| `src/lib/clinic/ownership.test.ts` | (mock prisma) retorna registro quando `clinicId` bate; lança `OwnershipError` quando não acha/cruza tenant |
| `src/app/api/prontuario/notes/route.test.ts` | (mock prisma, padrão de `api/patients/route.test.ts`) POST: 422 sem professionalProfileId; 422 appointment não-CONSULTA; 422 paciente do appointment ≠ body; 409/P2002 retorna existingNoteId; GET: força filtro ao próprio profissional sem acesso amplo |
| `src/lib/rbac/permissions.test.ts` (estender) | `ROLE_DEFAULTS.ADMIN.prontuario === "NONE"`; `PROFESSIONAL === "WRITE"`; override READ resolve para diretor |

Gates antes de cada commit: `npx prisma generate` → `npm run test` → `npm run build`.

---

## 5. Etapas de Implementação (cada uma verificável isoladamente)

> Trabalhar em worktree isolada: `bash scripts/new-feature.sh prontuario-eletronico`.
> Commits convencionais, terminados com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Nunca `git push`.

1. **Schema + migração** — editar `prisma/schema.prisma` (§3.1); autorar
   `prisma/migrations/20260611000000_add_prontuario/migration.sql` à mão; aplicar no banco da
   worktree conforme o procedimento offline do projeto; `npx prisma generate`.
   ✔ Verifica: `npx prisma validate` ok; build do client gera tipos `ClinicalNote*`.
2. **RBAC** — `FEATURES`/`FEATURE_LABELS`/`ROLE_DEFAULTS` (+ testes estendidos).
   ✔ `npm run test` verde; `/admin/permissions` exibe coluna "Prontuario" com defaults corretos.
3. **Ownership helper** — `src/lib/clinic/ownership.ts` + testes.
   ✔ Testes verdes.
4. **Domínio puro** — todos os arquivos de `src/lib/prontuario/` (§3.4) + barrel + testes.
   ✔ `npx vitest run src/lib/prontuario` verde; nenhum import de Prisma/Next no módulo.
5. **Auditoria** — novas `AuditAction` (§3.6).
   ✔ Build ok.
6. **Rotas de notas** — `notes` (GET/POST), `notes/[id]` (GET/PATCH/DELETE), `sign`, `addenda`,
   `bulk` + `route.test.ts`.
   ✔ Smoke via curl logado: criar rascunho, autosave, 409 com updatedAt velho, assinar,
   PATCH pós-assinatura ⇒ 409, adendo ok, nota de outra clínica ⇒ 404.
7. **Rotas de templates + pending** — seed lazy + contagem.
   ✔ Primeiro GET cria 3 templates; segundo GET não duplica.
8. **Aba Prontuário do paciente** — `ProntuarioTab` + `NoteTimelineItem` + `NoteStatusChip` +
   integração mínima na `PatientDetailsView`.
   ✔ PROFESSIONAL vê timeline; ADMIN sem override não vê a aba.
9. **Editor** — `/prontuario/[id]` + componentes (autosave, template picker, sign modal, adendos).
   ✔ Fluxo completo manual: criar → digitar → recarregar (rascunho persistiu) → assinar →
   campos read-only → adendo.
10. **Integração agenda** — botão no `CalendarEntrySheet`, bulk no `GroupSessionSheet`,
    `PendingNotesBadge` no header, item de navegação, página `/prontuario` (pendências).
    ✔ CONSULTA FINALIZADO mostra ação; LEMBRETE/NOTA/TAREFA/REUNIAO não; badge conta certo.
11. **Cron de pendências** — `src/app/api/jobs/pending-clinical-notes/route.ts` + entrada no
    `vercel.json`.
    ✔ `curl -H "Authorization: Bearer $CRON_SECRET"` cria Todos; segunda execução cria 0
    (idempotência); Todo aparece na faixa da agenda.
12. **Settings + ciclo de vida** — campos na rota/página de settings; `RetentionPanel`;
    rotas `record/[patientId]` + `descarte` + `termo-descarte-pdf.tsx`.
    ✔ Encerrar prontuário mostra banner; descarte antes do prazo ⇒ 422; com prazo vencido
    (ajustar dado de teste) ⇒ PDF baixa, notas somem, `RecordDisposal` + AuditLog criados.
13. **Gates finais** — `npx prisma generate && npm run test && npm run build`; revisão de
    tamanho de arquivos (>200 linhas ⇒ split); commit final.

---

## 6. Riscos e Questões em Aberto

1. **Governança do override (sigilo)** — um ADMIN com `users=WRITE` pode conceder a si mesmo
   `prontuario=READ` em `/admin/permissions`. Mitigação nesta fase: toda leitura de nota alheia é
   auditada (`CLINICAL_NOTE_ACCESSED`) e mudanças de permissão já são visíveis. Follow-up
   sugerido: auditar explicitamente alterações de override do feature `prontuario` e exibir aviso
   na UI de permissões. **Decisão de produto pendente**: exigir que o detentor de READ seja um
   PROFESSIONAL (CRP ativo)?
2. **"Assinatura" não é assinatura digital ICP-Brasil** — usamos hash SHA-256 + timestamp como
   evidência de integridade (suficiente para a maioria dos concorrentes BR; Lei 13.787/2018
   menciona certificação para *eliminação* do papel). Validar com assessoria jurídica se/quando
   oferecer assinatura qualificada (ex.: integração ICP) como upsell.
3. **Retenção para menores** — Res. CFP 01/2009 sugere contagem a partir da maioridade do
   paciente em alguns entendimentos. O modelo atual conta a partir de `recordClosedAt` com prazo
   configurável (5–20), o que cobre o caso conservadoramente, mas a UI poderia avisar quando o
   paciente for menor. Em aberto.
4. **Conteúdo em `sections` JSON sem criptografia em nível de aplicação** — o banco (Neon) é
   criptografado at-rest, mas dumps de prod para dev local (`sync-prod-to-local.sh`) passariam a
   conter conteúdo clínico real. **Ação recomendada**: adaptar o script de sync para truncar/
   mascarar `ClinicalNote.sections` e `NoteAddendum.content` no restore local. Deve entrar na
   etapa 1 ou em follow-up imediato.
5. **LGPD/anonimização** — o fluxo existente de exclusão de paciente precisa ser revisado: com
   `onDelete: Restrict`, deletar paciente com notas falhará com erro Prisma cru. A rota
   `DELETE /api/patients/[id]` deve capturar e responder em pt-BR oferecendo
   encerramento/anonimização. Verificar na etapa 12.
6. **Tamanho de arquivos existentes** — `CalendarEntrySheet.tsx` (763 linhas) e
   `PatientDetailsView.tsx` (438) já violam o limite; as integrações devem ser de poucas linhas
   delegando a componentes novos. Se a integração passar disso, extrair antes (conforme CLAUDE.md).
7. **Fuso horário** — `sessionDate` herda `scheduledAt` (UTC no banco); exibição usa
   `toLocaleString("pt-BR", { timeZone: clinic.timezone })` como o restante do app. Cuidado com o
   corte de "24h sem nota" no job (cálculo em UTC é aceitável pois a margem é grande).
8. **Volume do job** — clínicas grandes: a busca de FINALIZADOs em janela de 14 dias com índice
   `[clinicId, status]`/`[clinicId, scheduledAt]` existente é barata; monitorar duração no log do
   cron como nos jobs atuais.
9. **Questão em aberto — múltiplos profissionais por appointment** (`AppointmentProfessional`):
   hoje a pendência/unicidade considera apenas `attending ?? owner`. Co-terapeutas podem criar
   nota avulsa. Suportar pendência por participante adicional fica para follow-up.
10. **Questão em aberto — anexos** — a feature `anexos-paciente` (dependência opcional) não
    existe ainda; o editor não suporta anexos nesta fase. O modelo `ClinicalNote` não precisa de
    mudança quando ela chegar (relação nova na outra ponta).
