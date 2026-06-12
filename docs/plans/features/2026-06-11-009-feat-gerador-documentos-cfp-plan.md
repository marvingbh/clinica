---
title: "feat: Gerador de documentos CFP (declarações, atestados, laudos, recibos de reembolso)"
type: feat
status: planned
date: 2026-06-11
slug: gerador-documentos-cfp
priority: 7
complexity: L
---

# feat: Gerador de documentos CFP (declarações, atestados, laudos, recibos de reembolso)

## 1. Contexto de Negócio

### Problema

Psicólogos emitem documentos padronizados o tempo todo: a **declaração de
comparecimento** é pedida depois de praticamente toda sessão em horário
comercial (o paciente precisa justificar a ausência no trabalho/escola), e o
**recibo para reembolso** decide se o paciente recebe de volta o valor da
sessão do plano de saúde (livre escolha). Hoje cada profissional mantém
modelos soltos em Word/Google Docs, preenche nome, CPF, datas e valores à mão
e corre o risco de:

- esquecer um campo que o plano exige e ter o reembolso negado (CPF do
  paciente, CRP, CPF/CNPJ do profissional, datas e valores por sessão);
- violar a **Resolução CFP 06/2019**, que define a estrutura obrigatória de
  cada documento psicológico (declaração não pode conter diagnóstico nem
  conteúdo clínico; relatório/laudo tem seções obrigatórias: identificação,
  demanda, procedimento, análise, conclusão);
- perder o histórico do que foi emitido para quem e quando.

O Clinica já tem **todos os dados** (Appointment, Patient, InvoiceItem,
ProfessionalProfile, Clinic com logo) e **toda a infra de PDF**
(`@react-pdf/renderer` usada em `invoice-pdf.tsx` e `danfse-pdf.tsx`). Falta
só o empacotamento: templates corretos + merge + PDF + entrega + arquivo.

### Evidência de mercado

Concorrentes com feature equivalente ou parcial: **PsiNota AI**, **SisPsico**,
**Corpora**, **Cliniko** (letter templates), **Power Diary/Zanda**,
**PsicoManager**. A conformidade com a Resolução CFP 06/2019 é o diferencial:
ERPs genéricos não estruturam os documentos por tipo nem bloqueiam conteúdo
clínico em declarações.

### Usuários-alvo

- **PROFESSIONAL**: gera documentos para os próprios pacientes em 2 cliques a
  partir do agendamento ou da ficha do paciente.
- **ADMIN**: gera documentos para qualquer paciente da clínica (artefatos
  administrativos); gerencia os templates customizados da clínica; pode
  restringir Laudo/Relatório a profissionais via configuração.
- **Paciente**: recebe o PDF por e-mail (anexo) ou por WhatsApp (link seguro
  de download). Não interage com o sistema autenticado.

### Métricas de sucesso

- Tempo mediano do clique "Gerar documento" até o PDF baixado < 60 s.
- Nº de documentos gerados / clínica / mês (meta: ≥ 10 nas clínicas ativas).
- % de recibos de reembolso gerados sem retrabalho (sem reemissão no mesmo
  dia) > 90%.
- Redução de tickets "como faço declaração/recibo".

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **profissional**, quero clicar em "Gerar documento" num agendamento e
   ter uma **Declaração de comparecimento** pré-preenchida (data, faixa de
   horário, meu nome e CRP), para entregar ao paciente em 2 cliques.
2. Como **profissional**, quero gerar um **Recibo para reembolso** a partir
   das sessões pagas de um período, com CPF do paciente, lista de sessões com
   data/duração/valor unitário, total, meu nome, CRP e CPF/CNPJ, para o
   paciente apresentar ao plano.
3. Como **profissional**, quero ser bloqueado com um checklist claro quando
   faltar um dado obrigatório (ex.: paciente sem CPF, perfil sem CRP), com
   link direto para corrigir o cadastro.
4. Como **ADMIN**, quero customizar os textos dos templates da clínica sem
   alterar os modelos-padrão do sistema, para adequar a redação à clínica.
5. Como **ADMIN**, quero ver na aba "Documentos" do paciente tudo que já foi
   gerado (tipo, data, quem gerou, se foi enviado), para auditoria e reenvio.
6. Como **profissional**, quero enviar o PDF por e-mail (anexo) ou WhatsApp
   (link seguro) direto do sistema, com registro de auditoria.
7. Como **ADMIN**, quero opcionalmente restringir a geração de
   Relatório/Laudo/Parecer a usuários PROFESSIONAL (documento clínico é ato
   privativo do psicólogo), mantendo declarações e recibos liberados.

### 2.2 Tipos de documento (biblioteca seed, alinhada à Res. CFP 06/2019)

| Tipo (`DocumentType`) | Nome pt-BR | Estrutura / regra |
|---|---|---|
| `DECLARACAO_COMPARECIMENTO` | Declaração de comparecimento | Estritamente: nome do paciente, data, faixa de horário, nome + CRP do profissional. **Sem nenhum campo clínico** — o registry de placeholders não possui placeholder de diagnóstico/CID, tornando estruturalmente impossível mesclar conteúdo clínico. |
| `ATESTADO_PSICOLOGICO` | Atestado psicológico | Texto com finalidade e, quando aplicável, período de afastamento sugerido (campos manuais `{{finalidade}}`, `{{periodoAfastamento}}`). |
| `RELATORIO_PSICOLOGICO` | Relatório psicológico | Seções obrigatórias da resolução como campos manuais: `{{identificacao}}`, `{{demanda}}`, `{{procedimento}}`, `{{analise}}`, `{{conclusao}}`. |
| `LAUDO_PSICOLOGICO` | Laudo psicológico | Mesmas seções do relatório (a resolução estrutura ambos igualmente; seeds têm cabeçalhos distintos). |
| `PARECER_PSICOLOGICO` | Parecer psicológico | Seções: `{{identificacao}}`, `{{exposicaoMotivos}}`, `{{analise}}`, `{{conclusao}}`. |
| `ENCAMINHAMENTO` | Encaminhamento | Destinatário (`{{destinatario}}`), motivo (`{{motivoEncaminhamento}}`). |
| `CONTRATO_TERAPEUTICO` | Contrato terapêutico | Termos da clínica + dados do paciente/responsável. Para menor de idade, `{{guardianName}}` é obrigatório. Alimenta a futura feature assinatura-digital-tcle. |
| `RECIBO_REEMBOLSO` | Recibo para reembolso | Montado a partir de InvoiceItems pagos: nome completo + CPF do paciente, tabela de sessões (data, duração, valor unitário), total, nome do profissional, CRP, CPF/CNPJ, campo TUSS opcional (texto livre com código de psicoterapia sugerido). |

**Templates do sistema vs. da clínica.** Os 8 modelos-padrão são **constantes
de código** (`src/lib/documents/seed-templates.ts`) — somente leitura, sem
backfill por clínica. Quando o ADMIN customiza, cria-se uma linha
`ClinicDocumentTemplate` (cópia editável). O seletor de template mostra os
modelos do sistema + os da clínica (ativos). Editar um template **nunca** muda
documentos já gerados (snapshot imutável).

### 2.3 Fluxos

**Fluxo 1 — a partir do agendamento (agenda).**
No sheet de detalhe do agendamento (`CalendarEntrySheet`), entradas do tipo
CONSULTA com paciente ganham a ação **"Gerar documento"** (ícone `FileText`).
Abre o `DocumentWizardSheet` já com:
- tipo padrão = Declaração de comparecimento;
- paciente, data, horário de início/fim e profissional do agendamento.
Preview imediato → botão **"Gerar PDF"** → download. Dois cliques no caminho
feliz.

**Fluxo 2 — a partir da ficha do paciente.**
Nova aba **"Documentos"** no `PatientDetailsView` (ao lado de "Dados",
"Histórico", "Financeiro"):
- Lista dos documentos gerados (tipo, título, data de geração, gerado por,
  enviado para) com ações **Baixar** e **Enviar**.
- Botão **"Novo documento"** abre o wizard:
  1. **Escolher template** (sistema + clínica, agrupados por tipo).
  2. **Dados**: seleção de agendamento(s)/período quando o template usa
     sessões (`{{sessionList}}`, `{{appointmentDate}}`); campos manuais do
     template (finalidade, seções do laudo etc.). Para o recibo: período
     De/Até (inputs de texto mascarados DD/MM/AAAA) carregando os itens pagos
     elegíveis com checkbox por item.
  3. **Preview** ao vivo com os dados mesclados (mesma fonte do PDF). Se
     houver pendências, mostra o checklist bloqueante (ver 2.5).
  4. **"Gerar PDF"** → persiste, baixa e a lista atualiza.

**Fluxo 3 — entrega.**
Em qualquer documento gerado, ação **"Enviar"** abre diálogo com:
- **E-mail** (pré-preenchido com `patient.email`): envia com o PDF anexo.
- **WhatsApp** (pré-preenchido com `patient.phone`): envia mensagem com
  **link seguro HMAC** de download (validade 7 dias) — nunca o arquivo em si
  (abstração de provider; hoje mock).
Toda entrega grava `sentToEmail`/`sentAt` e AuditLog.

**Arquivo automático.** Todo PDF gerado fica persistido em
`GeneratedDocument.pdfData` (bytea — mesmo padrão de `Invoice.notaFiscalPdf`
e `Clinic.logoData`) e listado na aba Documentos do paciente. Quando a
feature anexos-paciente existir, há caminho de migração para object storage
(ver Riscos).

**Gestão de templates (ADMIN).**
Nova aba **"Documentos"** em `/admin/settings` (precedente: abas NFS-e /
Fiscal): lista dos 8 modelos do sistema (badge "Padrão do sistema", ação
"Duplicar e editar") + templates da clínica (editar, desativar). Editor:
nome, tipo, corpo em `textarea` com chips clicáveis dos placeholders
disponíveis (insere `{{...}}` na posição do cursor). Para
`DECLARACAO_COMPARECIMENTO` o editor exibe aviso fixo:
*"Por norma do CFP, declarações de comparecimento não podem conter diagnóstico
ou qualquer conteúdo clínico."*

### 2.4 Regras de negócio

1. **Imutabilidade**: documento gerado nunca é editado. "Reemitir" gera um
   novo `GeneratedDocument` (o anterior permanece listado).
2. **Escopo do profissional** (`agenda_own`-like): PROFESSIONAL só gera/lista
   documentos de pacientes com quem tem vínculo — é o
   `referenceProfessional` do paciente **ou** tem ≥ 1 agendamento com ele.
   ADMIN gera/lista para qualquer paciente da clínica. Enforçado no backend.
3. **Restrição de documentos clínicos**: se
   `Clinic.restrictClinicalDocsToProfessionals = true`, os tipos
   `RELATORIO_PSICOLOGICO`, `LAUDO_PSICOLOGICO`, `PARECER_PSICOLOGICO` e
   `ATESTADO_PSICOLOGICO` só podem ser gerados por usuários com
   `professionalProfileId` (ADMIN sem perfil profissional é bloqueado com
   mensagem clara).
4. **Recibo de reembolso**: só entram `InvoiceItem`s de faturas com status
   `PAGO`, dos tipos `SESSAO_REGULAR`, `SESSAO_EXTRA`, `SESSAO_GRUPO`; itens
   `CREDITO` nunca entram. Geração bloqueada sem `patient.cpf` (quick-fix) e
   sem CPF/CNPJ do profissional/clínica.
5. **Sessões em grupo**: a declaração/recibo de um membro usa apenas o nome
   daquele paciente e a janela de horário da sessão — **nunca** lista outros
   membros do grupo.
6. **Menores de idade** (idade < 18 por `birthDate`): `{{guardianName}}`
   resolve `billingResponsibleName ?? motherName ?? fatherName`; obrigatório
   para `CONTRATO_TERAPEUTICO` e usado nos demais quando presente no corpo.
7. **CRP**: reutiliza `ProfessionalProfile.registrationNumber` (mesma decisão
   do plano receita-saude-dmed; não criar campo novo).
8. **CPF/CNPJ do profissional**: `{{professionalCpfCnpj}}` resolve
   `ProfessionalProfile.cpf` (campo novo, compartilhado com o plano
   receita-saude-dmed) e, na ausência, `NfseConfig.cnpj` da clínica.
9. **Datas/horas**: tudo em pt-BR — DD/MM/YYYY, HH:mm 24h, R$ — calculado no
   fuso `Clinic.timezone` (default America/Sao_Paulo).
10. **Profissional assinante**: o documento registra
    `professionalProfileId` (do agendamento quando fluxo 1; do usuário logado
    quando PROFESSIONAL; selecionável pelo ADMIN no wizard quando fluxo 2).

### 2.5 Checklist de pendências (bloqueante)

Quando um placeholder **obrigatório** do template não resolve, a geração é
bloqueada e o preview mostra:

> **Faltam dados para gerar este documento:**
> - CPF do paciente — *Completar cadastro* (link `/patients?id=...&edit=1`)
> - CRP do profissional — *Editar perfil* (link `/professionals` ou `/profile`)
> - Nenhuma sessão paga no período — *Ver faturas* (link `/financeiro`)

Placeholders **opcionais** não resolvidos são removidos da saída (linha
omitida quando a linha inteira ficar vazia).

### 2.6 Telas (resumo de layout)

- **Aba "Documentos" do paciente**: tabela (Tipo | Título | Gerado em | Por |
  Enviado | ações Baixar/Enviar) + botão primário "Novo documento". Vazio:
  "Nenhum documento gerado para este paciente."
- **DocumentWizardSheet** (sheet lateral, padrão `Sheet.tsx` da agenda):
  stepper 3 passos (Template → Dados → Preview). Footer fixo com
  "Voltar"/"Continuar"/"Gerar PDF".
- **CalendarEntrySheet**: nova ação "Gerar documento" junto às ações
  existentes (apenas `type === "CONSULTA"` e `patient != null` — atenção ao
  gotcha de paciente nulo: sempre `patient?.`).
- **/admin/settings → aba Documentos**: duas seções ("Modelos do sistema",
  "Modelos da clínica") + editor em sheet/modal.

### 2.7 Copy pt-BR (chaves principais)

| Contexto | Texto |
|---|---|
| Ação na agenda/paciente | "Gerar documento" |
| Botão final do wizard | "Gerar PDF" |
| Toast sucesso | "Documento gerado com sucesso" |
| Toast envio e-mail | "Documento enviado por e-mail" |
| Toast envio WhatsApp | "Link de download enviado por WhatsApp" |
| Checklist título | "Faltam dados para gerar este documento" |
| CPF faltando | "CPF do paciente não cadastrado" / link "Completar cadastro" |
| CRP faltando | "CRP do profissional não cadastrado" / link "Editar perfil" |
| Sem itens pagos | "Nenhuma sessão paga encontrada no período selecionado" |
| Restrição clínica | "A geração de documentos clínicos está restrita a profissionais nesta clínica" |
| Link público expirado | "Este link expirou. Solicite um novo à clínica." |
| Link público inválido | "Link inválido" |
| Aviso editor declaração | "Por norma do CFP, declarações de comparecimento não podem conter diagnóstico ou qualquer conteúdo clínico." |
| Reemissão | "Gerar nova via" (tooltip: "Cria um novo documento; o anterior é mantido") |

### 2.8 Edge cases

- Agendamento sem paciente (TAREFA/REUNIAO/LEMBRETE/NOTA): ação "Gerar
  documento" não aparece.
- Agendamento cancelado: permitido gerar (declaração de comparecimento só
  faz sentido para FINALIZADO/CONFIRMADO; o wizard mostra aviso não
  bloqueante quando status é `CANCELADO_*` ou `AGENDADO` futuro).
- Recibo com sessões de profissionais diferentes (attendingProfessional):
  o recibo é emitido pelo profissional assinante selecionado; os itens
  listados são os escolhidos pelo usuário (sem trava por attending).
- Laudos longos: o corpo pagina automaticamente no react-pdf (`wrap`),
  timbre (logo da clínica) na primeira página, numeração "Página X de Y" em
  todas (rodapé `fixed`).
- Template desativado/excluído depois da geração: documento antigo continua
  íntegro (snapshot); `templateId` vira `SetNull`.
- Clínica sem logo: timbre cai para nome da clínica em texto (sem imagem
  default de outra clínica — **não** usar o fallback hardcoded do
  invoice-pdf).
- Dois cliques rápidos em "Gerar PDF": botão entra em loading/disabled no
  primeiro clique (toast de duplicidade não é necessário; reemissão é
  legítima por regra).

---

## 3. Design Técnico

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

**Novo enum**

```prisma
enum DocumentType {
  DECLARACAO_COMPARECIMENTO
  ATESTADO_PSICOLOGICO
  RELATORIO_PSICOLOGICO
  LAUDO_PSICOLOGICO
  PARECER_PSICOLOGICO
  ENCAMINHAMENTO
  CONTRATO_TERAPEUTICO
  RECIBO_REEMBOLSO
}
```

**Novo model `ClinicDocumentTemplate`** (somente customizações; seeds vivem
em código)

```prisma
/// Clinic-customized document template ({{placeholder}} body).
/// System defaults are code constants in src/lib/documents/seed-templates.ts.
model ClinicDocumentTemplate {
  id        String       @id @default(cuid())
  clinicId  String
  type      DocumentType
  name      String
  body      String       @db.Text // plain text with {{placeholders}}
  isActive  Boolean      @default(true)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  clinic             Clinic              @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  generatedDocuments GeneratedDocument[]

  @@unique([clinicId, type, name])
  @@index([clinicId, type])
  @@index([clinicId, isActive])
}
```

**Novo model `GeneratedDocument`** (imutável após criação)

```prisma
/// Immutable snapshot of a generated CFP document (content + rendered PDF).
model GeneratedDocument {
  id                    String       @id @default(cuid())
  clinicId              String
  patientId             String
  professionalProfileId String?      // signing professional
  appointmentId         String?      // source appointment (flow 1)
  templateId            String?      // null = generated from a system seed
  templateType          DocumentType
  templateName          String       // snapshot of template name at generation
  title                 String       // e.g. "Declaração de comparecimento — 11/06/2026"
  contentSnapshot       String       @db.Text // merged body (immutable)
  mergeData             Json         // resolved placeholder values + session rows + invoiceItemIds
  pdfData               Bytes        // rendered PDF (immutable; precedent: Invoice.notaFiscalPdf)
  generatedByUserId     String?
  sentToEmail           String?      // last delivery recipient (email or phone)
  sentAt                DateTime?
  createdAt             DateTime     @default(now())

  clinic              Clinic                  @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  patient             Patient                 @relation(fields: [patientId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile?    @relation(fields: [professionalProfileId], references: [id], onDelete: SetNull)
  appointment         Appointment?            @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  template            ClinicDocumentTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  generatedByUser     User?                   @relation(fields: [generatedByUserId], references: [id], onDelete: SetNull)

  @@index([clinicId, patientId, createdAt])
  @@index([clinicId, createdAt])
  @@index([clinicId, templateType])
  @@index([professionalProfileId])
  @@index([appointmentId])
}
```

**Campos em models existentes**

```prisma
model Clinic {
  // ...
  restrictClinicalDocsToProfessionals Boolean @default(false)
  clinicDocumentTemplates ClinicDocumentTemplate[]
  generatedDocuments      GeneratedDocument[]
}

model ProfessionalProfile {
  // ...
  cpf String? // 11 dígitos, somente números — COMPARTILHADO com o plano receita-saude-dmed
  generatedDocuments GeneratedDocument[]
}

model Patient {
  // ...
  generatedDocuments GeneratedDocument[]
}

model Appointment {
  // ...
  generatedDocuments GeneratedDocument[]
}

model User {
  // ...
  generatedDocuments GeneratedDocument[]
}
```

**Migração** (autorada offline — NUNCA `prisma db push` / `migrate dev`):
`prisma/migrations/20260611120000_add_document_generator/migration.sql`

```sql
CREATE TYPE "DocumentType" AS ENUM (
  'DECLARACAO_COMPARECIMENTO','ATESTADO_PSICOLOGICO','RELATORIO_PSICOLOGICO',
  'LAUDO_PSICOLOGICO','PARECER_PSICOLOGICO','ENCAMINHAMENTO',
  'CONTRATO_TERAPEUTICO','RECIBO_REEMBOLSO'
);

CREATE TABLE "ClinicDocumentTemplate" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "type" "DocumentType" NOT NULL,
  "name" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicDocumentTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClinicDocumentTemplate_clinicId_type_name_key"
  ON "ClinicDocumentTemplate"("clinicId","type","name");
CREATE INDEX "ClinicDocumentTemplate_clinicId_type_idx"
  ON "ClinicDocumentTemplate"("clinicId","type");
CREATE INDEX "ClinicDocumentTemplate_clinicId_isActive_idx"
  ON "ClinicDocumentTemplate"("clinicId","isActive");
ALTER TABLE "ClinicDocumentTemplate" ADD CONSTRAINT "ClinicDocumentTemplate_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GeneratedDocument" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "professionalProfileId" TEXT,
  "appointmentId" TEXT,
  "templateId" TEXT,
  "templateType" "DocumentType" NOT NULL,
  "templateName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contentSnapshot" TEXT NOT NULL,
  "mergeData" JSONB NOT NULL,
  "pdfData" BYTEA NOT NULL,
  "generatedByUserId" TEXT,
  "sentToEmail" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GeneratedDocument_clinicId_patientId_createdAt_idx"
  ON "GeneratedDocument"("clinicId","patientId","createdAt");
CREATE INDEX "GeneratedDocument_clinicId_createdAt_idx"
  ON "GeneratedDocument"("clinicId","createdAt");
CREATE INDEX "GeneratedDocument_clinicId_templateType_idx"
  ON "GeneratedDocument"("clinicId","templateType");
CREATE INDEX "GeneratedDocument_professionalProfileId_idx"
  ON "GeneratedDocument"("professionalProfileId");
CREATE INDEX "GeneratedDocument_appointmentId_idx"
  ON "GeneratedDocument"("appointmentId");
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_professionalProfileId_fkey"
  FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ClinicDocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_generatedByUserId_fkey"
  FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Clinic" ADD COLUMN "restrictClinicalDocsToProfessionals" BOOLEAN NOT NULL DEFAULT false;

-- Compartilhado com o plano receita-saude-dmed: idempotente para o caso de
-- aquele plano ser implementado antes/depois deste.
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "cpf" TEXT;
```

### 3.2 Módulo de domínio `src/lib/documents/` (funções puras)

Cada arquivo < 200 linhas; testes colocados; barrel `index.ts`.

**`types.ts`**

```typescript
export type DocumentType =
  | "DECLARACAO_COMPARECIMENTO" | "ATESTADO_PSICOLOGICO"
  | "RELATORIO_PSICOLOGICO" | "LAUDO_PSICOLOGICO" | "PARECER_PSICOLOGICO"
  | "ENCAMINHAMENTO" | "CONTRATO_TERAPEUTICO" | "RECIBO_REEMBOLSO"

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string>

export interface SessionRow {
  date: string        // DD/MM/YYYY
  durationMinutes: number
  unitPrice: string   // "R$ 200,00"
  invoiceItemId: string
}

export interface MergeContext {
  patient: { name: string; cpf: string | null; birthDate: Date | null
             billingResponsibleName: string | null
             motherName: string | null; fatherName: string | null
             email: string | null; phone: string | null }
  professional: { name: string; crp: string | null; cpf: string | null } | null
  clinic: { name: string; cnpj: string | null; timezone: string
            address: string | null; phone: string | null; email: string | null }
  appointment: { scheduledAt: Date; endAt: Date } | null
  sessionRows: SessionRow[]
  manualFields: Record<string, string>   // {{finalidade}}, {{analise}}, {{tussCode}}...
  generatedAt: Date
}

export interface MissingField {
  key: string          // placeholder key
  label: string        // "CPF do paciente"
  quickFixPath: string | null  // "/patients?id=...&edit=1"
}

export type PlaceholderKind = "auto" | "manual"

export interface PlaceholderDef {
  key: string
  label: string
  kind: PlaceholderKind
  /** Document types where this placeholder is REQUIRED when present in the body */
  requiredFor: DocumentType[]
  resolve: (ctx: MergeContext) => string | null   // null = unresolved
}
```

**`placeholders.ts`** — registry único:

```typescript
export const PLACEHOLDERS: PlaceholderDef[]
// {{patientName}} {{patientCpf}} {{guardianName}} {{appointmentDate}}
// {{appointmentStartTime}} {{appointmentEndTime}} {{professionalName}}
// {{crp}} {{professionalCpfCnpj}} {{clinicName}} {{clinicAddress}}
// {{sessionList}} {{totalValue}} {{currentDate}} {{patientBirthDate}}
// + manuais: {{finalidade}} {{periodoAfastamento}} {{identificacao}}
// {{demanda}} {{procedimento}} {{analise}} {{conclusao}}
// {{exposicaoMotivos}} {{destinatario}} {{motivoEncaminhamento}} {{tussCode}}

export function getPlaceholder(key: string): PlaceholderDef | undefined
export function resolveValues(
  keys: string[], ctx: MergeContext
): { values: Record<string, string>; unresolved: string[] }
```

Notas de resolução:
- `{{guardianName}}` → `billingResponsibleName ?? motherName ?? fatherName`.
- `{{professionalCpfCnpj}}` → `professional.cpf ?? clinic.cnpj` (formatado
  `000.000.000-00` / `00.000.000/0000-00`).
- `{{appointmentDate}}` / horas: formatadas no fuso `clinic.timezone` via
  `toLocaleDateString("pt-BR", { timeZone })` / `toLocaleTimeString("pt-BR",
  { hour: "2-digit", minute: "2-digit", timeZone })`.
- `{{sessionList}}` resolve para o token interno `__SESSION_TABLE__`
  (renderizado como tabela no PDF) e exige `sessionRows.length > 0`.
- `{{totalValue}}` → soma de `sessionRows` formatada com `formatCurrencyBRL`
  (reusar `src/lib/financeiro/format.ts`).
- **Não existe** placeholder de CID/diagnóstico — garantia estrutural da
  regra da declaração.

**`merge.ts`**

```typescript
export function extractPlaceholderKeys(body: string): string[]
export interface MergeResult { content: string; unresolved: string[] }
/** Substitui {{key}} por values[key]; opcionais não resolvidos viram "" e
 *  linhas que ficarem vazias são removidas. */
export function mergeTemplate(body: string, values: Record<string, string>,
  optionalKeys: string[]): MergeResult
export function splitContentBySessionTable(content: string):
  { before: string; hasTable: boolean; after: string }
```

**`validate.ts`**

```typescript
/** Regras por tipo + placeholders required presentes no corpo.
 *  Retorna [] quando a geração está liberada. */
export function validateGeneration(
  type: DocumentType, bodyKeys: string[], ctx: MergeContext
): MissingField[]
/** true quando birthDate indica < 18 anos na data de referência */
export function isMinor(birthDate: Date | null, reference: Date): boolean
/** Regra 3 (restrição de docs clínicos) — pura, recebe o flag e o perfil */
export function canGenerateClinicalDoc(
  type: DocumentType, restrictToProfessionals: boolean,
  professionalProfileId: string | null
): boolean
export const CLINICAL_DOCUMENT_TYPES: DocumentType[]
```

**`recibo.ts`**

```typescript
export interface PaidItemInput {
  id: string; description: string; total: string | number
  appointmentScheduledAt: Date | null; appointmentEndAt: Date | null
  invoiceStatus: string; type: string
}
/** Filtra elegíveis (fatura PAGO, tipos SESSAO_*) e monta SessionRow[]
 *  ordenado por data, com duração derivada de scheduledAt/endAt
 *  (fallback: defaultSessionDuration). */
export function buildReciboSessionRows(
  items: PaidItemInput[], timezone: string, defaultDuration: number
): SessionRow[]
export function sumSessionRows(rows: SessionRow[]): string // "R$ 1.200,00"
export const SUGGESTED_TUSS_LABEL =
  "Sessão de psicoterapia individual (verificar código TUSS vigente)"
```

**`seed-templates.ts`** — `SYSTEM_TEMPLATES: Record<DocumentType, { name:
string; body: string }>` com os 8 corpos pt-BR alinhados à Res. CFP 06/2019.
Exemplo (declaração):

```
DECLARAÇÃO DE COMPARECIMENTO

Declaro, para os devidos fins, que {{patientName}} compareceu a atendimento
psicológico no dia {{appointmentDate}}, no horário de
{{appointmentStartTime}} às {{appointmentEndTime}}.

{{clinicName}}, {{currentDate}}.

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}
```

**`document-links.ts`** — espelha `appointments/appointment-links.ts`:

```typescript
const EXPIRY_DAYS = 7
export function signDocumentLink(documentId: string):
  { expires: number; sig: string }            // HMAC-SHA256 com AUTH_SECRET
export function verifyDocumentLink(documentId: string, expires: number,
  sig: string): { valid: boolean; error?: string }
export function buildDocumentDownloadUrl(baseUrl: string,
  documentId: string): string
  // `${baseUrl}/api/public/documents/${id}/download?expires=...&sig=...`
```

**`build-merge-context.ts`** — adaptador puro (recebe objetos planos já
buscados pelo route, devolve `MergeContext`; sem Prisma).

**`document-pdf.tsx`** — componente react-pdf:

```typescript
export interface DocumentPDFData {
  clinicName: string; clinicAddress?: string; clinicPhone?: string
  logoSrc?: string            // data URI de Clinic.logoData; sem fallback de arquivo
  title: string               // ex. "Declaração de Comparecimento"
  paragraphsBefore: string[]  // contentSnapshot dividido em parágrafos
  sessionRows: SessionRow[] | null   // tabela quando {{sessionList}}
  totalValue: string | null
  paragraphsAfter: string[]
  generatedAtLabel: string    // "Gerado em 11/06/2026 às 14:30"
}
export function createGeneratedDocument(data: DocumentPDFData): any
```

Página A4, timbre no topo (logo ou nome), numeração
`<Text fixed render={({pageNumber, totalPages}) => ...}>` no rodapé,
`wrap` default para laudos longos.

**`index.ts`** — barrel exportando tudo acima.

### 3.3 RBAC

`src/lib/rbac/types.ts`:
- adicionar `"documents"` a `FEATURES`;
- `FEATURE_LABELS.documents = "Documentos"`.

`src/lib/rbac/permissions.ts` (`ROLE_DEFAULTS`):
- `ADMIN.documents = "WRITE"`;
- `PROFESSIONAL.documents = "WRITE"` (escopo "próprios pacientes" é regra de
  handler, não de feature).

`src/lib/rbac/audit.ts` (`AuditAction`):
```typescript
DOCUMENT_GENERATED: "DOCUMENT_GENERATED",
DOCUMENT_SENT: "DOCUMENT_SENT",
DOCUMENT_TEMPLATE_CREATED: "DOCUMENT_TEMPLATE_CREATED",
DOCUMENT_TEMPLATE_UPDATED: "DOCUMENT_TEMPLATE_UPDATED",
DOCUMENT_TEMPLATE_DEACTIVATED: "DOCUMENT_TEMPLATE_DEACTIVATED",
```
`newValues` do `DOCUMENT_GENERATED`/`DOCUMENT_SENT` inclui `templateType`,
`patientId` e destinatário (canal + e-mail/telefone) — exigência da spec.

`src/lib/audit/field-labels.ts`: labels pt-BR para os novos campos/ações.

### 3.4 Rotas de API

Todas com `withFeatureAuth` de `@/lib/api`; **todas** as queries
self-scoped por `user.clinicId`; FKs de body validados contra a clínica
(padrão `findFirst({ where: { id, clinicId: user.clinicId } })` — não existe
helper central `ownership.ts` hoje; este plano cria
`src/lib/clinic/ownership.ts` com `assertPatientInClinic`,
`assertAppointmentInClinic`, `assertInvoiceItemsInClinic`, todos retornando o
registro ou `null`, para reutilização futura).

**Helper de escopo do profissional** (`src/app/api/documents/_lib/scope.ts`
ou função no module): para PROFESSIONAL, a checagem de vínculo é

```typescript
prisma.patient.findFirst({
  where: {
    id: patientId, clinicId: user.clinicId,
    OR: [
      { referenceProfessionalId: user.professionalProfileId },
      { appointments: { some: { professionalProfileId: user.professionalProfileId } } },
    ],
  }, select: { id: true },
})
```
ADMIN: apenas `{ id, clinicId }`.

| Rota | Método | Auth | Request → Response |
|---|---|---|---|
| `/api/documents/templates` | GET | `documents` READ | → `{ system: TemplateDTO[], custom: TemplateDTO[] }` (custom: `where { clinicId, isActive: true }`; query `?includeInactive=1` para a tela admin) |
| `/api/documents/templates` | POST | `clinic_settings` WRITE | `{ type, name, body }` (zod) → cria com `clinicId: user.clinicId`; valida que todo `{{key}}` do body existe no registry → 201 ou 422 `{ unknownKeys }` |
| `/api/documents/templates/[id]` | PATCH | `clinic_settings` WRITE | `{ name?, body?, isActive? }`; `findFirst({ id, clinicId })` antes de atualizar |
| `/api/documents/templates/[id]` | DELETE | `clinic_settings` WRITE | soft delete (`isActive: false`) |
| `/api/documents` | GET | `documents` READ | `?patientId=&page=&limit=` → lista (sem `pdfData`!) `{ documents, pagination }`; PROFESSIONAL: filtro de vínculo acima |
| `/api/documents/preview` | POST | `documents` WRITE | `{ templateType, templateId?, patientId, appointmentId?, invoiceItemIds?, professionalProfileId?, manualFields? }` → `{ content, sessionRows, missingFields }` (sem persistir) |
| `/api/documents/generate` | POST | `documents` WRITE | mesmo body do preview → valida (422 com `missingFields` se bloqueado), `renderToBuffer`, cria `GeneratedDocument`, audita → `{ id, title }` |
| `/api/documents/[id]/pdf` | GET | `documents` READ | `findFirst({ id, clinicId })` + escopo profissional → `application/pdf` (Content-Disposition `inline; filename="..."`) |
| `/api/documents/[id]/send` | POST | `documents` WRITE | `{ channel: "EMAIL" \| "WHATSAPP", email?, phone? }` (zod refine por canal) → envia, grava `sentToEmail/sentAt`, audita → `{ ok: true }` |
| `/api/documents/recibo-items` | GET | `documents` READ | `?patientId=&from=&to=` (datas ISO) → itens elegíveis: `invoiceItem.findMany({ where: { invoice: { clinicId, patientId, status: "PAGO" }, type: { in: [...] }, appointment: { scheduledAt: { gte, lte } } } })` → `{ items: SessionRow-like[] }` |
| `/api/public/documents/[id]/download` | GET | **pública** | `?expires=&sig=` → `verifyDocumentLink`; rate-limit por IP (reusar `src/lib/rate-limit.ts`); 403 com mensagem pt-BR quando inválido/expirado → `application/pdf` |

Notas:
- `professionalProfileId` no body: PROFESSIONAL ignora e usa o próprio
  (`user.professionalProfileId`); ADMIN pode indicar o assinante — validado
  por `findFirst({ id, user: { clinicId: user.clinicId } })`.
- `invoiceItemIds`: validados em lote — `count({ where: { id: { in },
  invoice: { clinicId: user.clinicId, patientId } } }) === ids.length`,
  senão 403.
- Restrição clínica (regra 3): checada em preview e generate via
  `canGenerateClinicalDoc` + `Clinic.restrictClinicalDocsToProfessionals`.
- Rotas ficam finas (< 50 linhas de lógica): fetch Prisma → adapters
  (`build-merge-context`) → funções do módulo → resposta. A montagem
  preview/generate compartilha um helper interno
  `src/app/api/documents/_lib/build-generation.ts` (busca + contexto +
  validação), mantendo cada route enxuta.

### 3.5 Entrega (notificações)

Precedente seguido: o e-mail de NFS-e é chamada direta ao provider, fora do
pipeline `notification-service` (ver comentário em
`src/lib/notifications/notification-service.ts`). Documentos seguem o mesmo
padrão — **sem** novo `NotificationType`, **sem** gate
`appointmentNotificationsEnabled`:

- **E-mail**: `emailResendProvider` com `options.attachments = [{ filename,
  content: pdfBuffer.toString("base64") }]` (suporte já existente em
  `providers/email-resend.ts`), remetente resolvido como no fluxo NFS-e
  (`emailFromAddress`/`emailSenderName` da clínica). Template HTML simples em
  `src/lib/documents/email-template.ts` (espelha
  `nfse/email-template.ts`).
- **WhatsApp**: `whatsAppMockProvider` com mensagem pt-BR contendo
  `buildDocumentDownloadUrl(...)` (link HMAC, 7 dias). Nunca envia o arquivo.
- Sem cron novo em `vercel.json`.

### 3.6 UI

**Novos componentes** (`src/shared/components/documents/` — usados por
agenda e pacientes; cada um < 200 linhas):
- `DocumentWizardSheet.tsx` — orquestra os 3 passos (estado local; reset por
  `key={patientId + appointmentId}`; **sem useEffect** — dados via fetch em
  event handlers / SWR-like helper já usado no projeto).
- `TemplatePickerStep.tsx`, `DocumentDataStep.tsx` (react-hook-form + zod
  para campos manuais; datas como texto mascarado DD/MM/AAAA),
  `DocumentPreviewStep.tsx` (chama `/api/documents/preview` no avanço de
  passo — event handler), `MissingFieldsChecklist.tsx`,
  `SessionItemsPicker.tsx` (checkbox list dos itens pagos),
  `SendDocumentDialog.tsx`, `DocumentsList.tsx` + `DocumentListRow.tsx`.

**Arquivos existentes alterados**:
- `src/app/patients/components/PatientDetailsView.tsx`: `PatientTabKey`
  ganha `"documentos"`; nova aba renderiza `DocumentsTab` (novo arquivo em
  `src/app/patients/components/DocumentsTab.tsx`, fino: lista + botão que
  abre o wizard).
- `src/app/agenda/components/CalendarEntrySheet.tsx`: ação "Gerar documento"
  (lucide `FileText`) quando `type === "CONSULTA" && patient != null`
  (optional chaining em todos os usos de `patient`).
- `src/app/admin/settings/...`: nova aba "Documentos" com
  `DocumentTemplatesSection.tsx` + `TemplateEditorSheet.tsx` (em
  `src/app/admin/settings/components/`), seguindo o padrão das abas
  existentes (NFS-e).
- `src/lib/rbac/types.ts`, `permissions.ts`, `audit.ts`,
  `src/lib/audit/field-labels.ts` (registro da feature + ações, ver 3.3).
- Tela de permissões de usuário (admin) lista a nova feature
  automaticamente via `FEATURES`/`FEATURE_LABELS` — sem mudança manual.

**Ícones**: `FileText` (ação/aba), `Download`, `Send`, `Copy` (duplicar
template), `AlertTriangle` (checklist).

### 3.7 Pontos de integração (resumo)

- **PDF**: `@react-pdf/renderer` (`renderToBuffer`) — já em produção nas
  faturas/DANFSE.
- **Logo/timbre**: `Clinic.logoData`/`logoMime` → data URI (padrão do
  invoice-pdf), sem fallback hardcoded.
- **Auditoria**: `audit()` de `src/lib/rbac/audit.ts` em generate, send e
  CRUD de template.
- **Rate-limit**: `src/lib/rate-limit.ts` na rota pública de download.
- **Sem cron**; **sem** mudança em `vercel.json`.
- **anexos-paciente** (futuro): `GeneratedDocument.pdfData` migra para
  storage key quando a feature existir (coluna nova + backfill; fora deste
  plano).

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`. Enums
Prisma como string literals.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/documents/placeholders.test.ts` | cada placeholder resolve do `MergeContext`; `guardianName` cai em `billingResponsibleName → motherName → fatherName → null`; `professionalCpfCnpj` formata CPF (11 díg.) e CNPJ (14 díg.) e cai para `clinic.cnpj`; datas/horas em pt-BR no timezone do contexto; `resolveValues` separa `unresolved` |
| `src/lib/documents/merge.test.ts` | `extractPlaceholderKeys` (dedupe, ignora chaves malformadas); substituição múltipla; opcional não resolvido remove a linha vazia; obrigatório não resolvido aparece em `unresolved`; `splitContentBySessionTable` com/sem token |
| `src/lib/documents/validate.test.ts` | recibo sem CPF do paciente bloqueia com quickFixPath; sem CRP bloqueia (todos os tipos); contrato + menor sem responsável bloqueia; maior de idade não exige responsável; `isMinor` nos limites (aniversário de 18 anos hoje); `canGenerateClinicalDoc` para os 4 tipos clínicos × flag × perfil; `{{sessionList}}` presente + `sessionRows` vazio bloqueia |
| `src/lib/documents/recibo.test.ts` | filtra apenas faturas `PAGO` e tipos `SESSAO_*` (exclui `CREDITO`); ordena por data; duração via `endAt - scheduledAt` com fallback `defaultDuration`; `sumSessionRows` com centavos ("R$ 1.234,56"); lista vazia → soma "R$ 0,00" |
| `src/lib/documents/document-links.test.ts` | sign/verify round-trip; expirado → `valid: false` com mensagem pt-BR (`vi.useFakeTimers`); assinatura adulterada → inválida; URL contém id/expires/sig |
| `src/lib/documents/seed-templates.test.ts` | todos os 8 tipos têm seed; toda `{{key}}` usada nos seeds existe no registry; o seed de `DECLARACAO_COMPARECIMENTO` usa **somente** o conjunto permitido (nome, data, horários, profissional, CRP, clínica, data atual) — guarda de conformidade CFP |
| `src/lib/documents/build-merge-context.test.ts` | mapeia objetos planos → `MergeContext`; paciente sem `birthDate`; appointment nulo; sessão de grupo não vaza nomes de outros membros (entrada contém apenas o paciente-alvo) |
| `src/lib/clinic/ownership.test.ts` | helpers retornam registro quando clinicId bate e `null` quando não (com Prisma mockado via `vi.mock`) |
| `src/lib/rbac/permissions.test.ts` (atualizar) | `documents` presente nos defaults: ADMIN WRITE, PROFESSIONAL WRITE; `resolvePermissions` cobre a nova feature |

Gates antes de cada commit: `npx prisma generate`, `npm run test`,
`npm run build` — todos verdes.

---

## 5. Etapas de Implementação

Branch isolada: `bash scripts/new-feature.sh gerador-documentos-cfp` e
trabalhar em `../clinica-gerador-documentos-cfp`.

1. **Schema + migração**: editar `prisma/schema.prisma` (3.1); criar
   `prisma/migrations/20260611120000_add_document_generator/migration.sql` à
   mão; aplicar no banco da worktree com `npx prisma migrate deploy`
   (nunca `db push`/`migrate dev`); `npx prisma generate`.
   *Verificável*: `npx prisma validate` + build verdes.
2. **RBAC**: registrar feature `documents` (types, labels, defaults), novas
   `AuditAction`, labels em `field-labels.ts`; atualizar
   `permissions.test.ts`. *Verificável*: testes RBAC verdes; tela de
   permissões mostra "Documentos".
3. **Módulo de domínio (núcleo puro)**: `types.ts`, `placeholders.ts`,
   `merge.ts`, `validate.ts`, `recibo.ts` + testes. *Verificável*:
   `npx vitest run src/lib/documents/`.
4. **Seeds + links + contexto**: `seed-templates.ts`, `document-links.ts`,
   `build-merge-context.ts`, `email-template.ts` + testes; barrel
   `index.ts`. *Verificável*: testes do módulo verdes.
5. **PDF**: `document-pdf.tsx` (timbre, parágrafos, tabela de sessões,
   assinatura, numeração de páginas). *Verificável*: script ad-hoc ou rota
   de preview renderiza buffer não-vazio; inspeção visual de declaração e
   de um laudo de 3+ páginas.
6. **Ownership helpers**: criar `src/lib/clinic/ownership.ts` + testes.
7. **Rotas de templates**: GET/POST `/api/documents/templates`,
   PATCH/DELETE `[id]`. *Verificável*: curl autenticado lista
   sistema+custom; criação com placeholder inexistente → 422.
8. **Rotas de geração**: `preview`, `generate`, `recibo-items`, helper
   `_lib/build-generation.ts`. *Verificável*: gerar declaração via curl
   devolve id; paciente sem CPF em recibo → 422 com `missingFields`;
   PROFESSIONAL de outro paciente → 403.
9. **Rotas de download/envio**: `[id]/pdf`, `[id]/send`,
   `public/documents/[id]/download` (HMAC + rate-limit). *Verificável*:
   PDF baixa; link público expira; envio mock loga WhatsApp e Resend recebe
   anexo em dev.
10. **UI — wizard + aba do paciente**: componentes de
    `src/shared/components/documents/`, `DocumentsTab.tsx`, alteração do
    `PatientDetailsView.tsx`. *Verificável*: fluxo 2 completo no navegador
    com banco local.
11. **UI — agenda + admin**: ação no `CalendarEntrySheet.tsx` (fluxo 1, 2
    cliques) e aba "Documentos" em `/admin/settings` (CRUD de template).
    *Verificável*: fluxo 1 e edição de template no navegador.
12. **Passe final**: `npx prisma generate && npm run test && npm run build`;
    revisão de escopo multi-tenant em cada rota (checklist: toda query tem
    `clinicId`); commit convencional local (sem push):
    `feat(documentos): gerador de documentos CFP com templates, merge e PDF`
    terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## 6. Riscos e Questões em Aberto

1. **Crescimento do banco (bytea)**: PDFs em `GeneratedDocument.pdfData`
   seguem o precedente (`notaFiscalPdf`), mas laudos longos × volume podem
   pesar no Postgres/Neon. Mitigação: listagens nunca selecionam `pdfData`;
   migração futura para object storage quando anexos-paciente existir.
2. **Redação dos seeds vs. CFP**: os corpos dos templates precisam de
   revisão por psicólogo(a)/jurídico antes do release — a resolução define
   estrutura, mas a redação exata é responsabilidade nossa. O teste de
   conformidade da declaração reduz, não elimina, o risco.
3. **Código TUSS sugerido**: o código de psicoterapia muda conforme a versão
   da tabela TUSS; por isso o campo é texto livre e a sugestão é um label
   sem código fixo (`SUGGESTED_TUSS_LABEL`). Confirmar o código vigente
   antes de sugerir valor numérico.
4. **Colisão com receita-saude-dmed**: ambos os planos adicionam
   `ProfessionalProfile.cpf`. A migração usa `ADD COLUMN IF NOT EXISTS`;
   quem implementar por último deve conferir se o campo já está no
   `schema.prisma` para não duplicar a linha do model.
5. **LGPD / conteúdo clínico em claro**: `contentSnapshot` de laudos guarda
   conteúdo sensível sem criptografia (igual a `notes`/`therapeuticProject`
   hoje). Se o plano de prontuário eletrônico introduzir criptografia de
   campo, os documentos clínicos devem aderir — questão aberta.
6. **WhatsApp é mock**: a entrega real depende do provider definitivo; o
   design (link HMAC, nunca anexo) já está pronto para a troca.
7. **Rich text v1**: corpo em texto puro com parágrafos (sem
   negrito/itálico custom). Suficiente para os documentos CFP; editor rico
   fica para v2 se houver demanda — decisão consciente para manter o merge
   puro e o PDF simples.
8. **Assinatura**: documentos saem com linha de assinatura física. A
   integração com assinatura digital (ICP-Brasil / assinatura-digital-tcle)
   é feature separada; o contrato terapêutico já nasce com snapshot imutável
   pensado para isso.
9. **Em aberto — quem pode reenviar**: hoje qualquer usuário com
   `documents WRITE` e vínculo pode reenviar um documento gerado por outro
   profissional do mesmo paciente. Confirmar com usuários se reenvio deve
   ser restrito ao autor/ADMIN.
