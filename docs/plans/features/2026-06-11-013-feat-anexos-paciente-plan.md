---
title: "feat: Anexos do paciente (armazenamento de documentos e arquivos)"
type: feat
status: planned
date: 2026-06-11
slug: anexos-paciente
priority: 6
complexity: M
depends_on:
  - "subscription limits module (src/lib/subscription/limits.ts) — padrão de quota"
  - "AuditLog (src/lib/rbac/audit.ts)"
  - "RBAC feature 'patients' (src/lib/rbac/)"
  - "Vercel Blob (novo pacote @vercel/blob) ou provider filesystem local"
integrates_with:
  - "gerador-documentos-cfp (plano 009) — source GERADO"
  - "assinatura-digital-tcle (plano 010) — source ASSINADO"
  - "anamnese-form-builder (plano 008) — source FORMULARIO"
  - "portal-do-paciente (plano 003) — flag sharedWithPatient"
---

# feat: Anexos do paciente (document storage & file attachments)

Biblioteca de documentos por paciente: uploads feitos pela equipe (exames,
encaminhamentos, contratos digitalizados) + artefatos gerados pelo sistema
(PDFs de documentos CFP, TCLEs assinados, exportações de formulários),
armazenados com segurança fora do banco e servidos **somente** atrás de
autorização, com auditoria de cada download (LGPD), soft delete com janela de
restauração de 30 dias, e quota de armazenamento por plano SaaS.

Hoje **não existe nenhum modelo de arquivo/anexo no schema** (o único binário é
`Clinic.logoData` em `Bytes` no Postgres — inviável para arquivos de pacientes).
Este plano cria a fundação de storage que os planos 008/009/010 e o portal do
paciente (003) consomem.

---

## 1. Contexto de Negócio

### Problema

- Clínicas recebem exames, encaminhamentos médicos, laudos escolares, contratos
  assinados em papel e fotos de documentos — hoje tudo fica espalhado em
  WhatsApp, e-mail e pastas do Drive da secretaria, **fora do prontuário** e fora
  de qualquer controle de acesso ou trilha de auditoria.
- Documentos de saúde são **dados sensíveis** (LGPD art. 5º, II). Guardá-los em
  Drive pessoal/WhatsApp é risco jurídico direto para a clínica; o sistema
  precisa oferecer o lugar correto para que o uso errado deixe de ser o caminho
  mais fácil.
- É **pré-requisito técnico** dos planos já especificados: o gerador de
  documentos CFP (009), a assinatura de TCLE (010) e a exportação de anamneses
  (008) precisam de um lugar para arquivar PDFs. Sem este plano, cada um deles
  reinventaria storage.
- É um "checkbox feature" universal em vendas: toda demo de concorrente mostra
  a aba de arquivos do paciente.

### Evidência de mercado

Todos os concorrentes diretos têm biblioteca de documentos por paciente:
**SimplePractice** (document library + sharing), **TherapyNotes** (patient
documents), **Jane App** (files & charts), **Ninsaúde Apolo**, **PsicoManager**,
**iClinic** (anexos no prontuário) e **Allminds**. A maioria cobra por
armazenamento em tiers de plano — exatamente o modelo de quota proposto aqui.

### Usuários-alvo

- **Secretária/ADMIN**: digitaliza e anexa contratos, encaminhamentos e
  documentos administrativos; gerencia a lixeira e o consumo de armazenamento.
- **PROFESSIONAL**: anexa exames e laudos dos pacientes que atende; consulta
  documentos antes da sessão.
- **Paciente** (futuro, via portal-do-paciente): vê apenas documentos marcados
  explicitamente como "compartilhar com paciente".
- **Superadmin**: monitora consumo de storage por clínica (custo da plataforma).

### Métricas de sucesso

1. ≥ 50% das clínicas ativas com ≥ 1 documento anexado em 60 dias.
2. Zero downloads de blob sem registro de auditoria correspondente (verificável
   por reconciliação entre logs do provider e `AuditLog`).
3. ≥ 95% de uploads concluídos com sucesso (meta de confiabilidade do fluxo de
   upload em conexões móveis).
4. Upsell mensurável: clínicas que atingem 80% da quota Starter aparecem no
   funil de upgrade.

---

## 2. Especificação Funcional

### 2.1 User stories

1. **Como secretária (ADMIN)**, quero arrastar um PDF de contrato para a ficha
   do paciente com categoria e descrição, para centralizar o arquivo da clínica.
2. **Como psicóloga (PROFESSIONAL)**, quero anexar o exame que a mãe do
   paciente me enviou e encontrá-lo rapidamente antes da próxima sessão.
3. **Como psicóloga**, quero visualizar um PDF/imagem inline sem precisar
   baixar o arquivo.
4. **Como ADMIN**, quero remover um documento anexado por engano e poder
   restaurá-lo em até 30 dias.
5. **Como ADMIN**, quero ver quanto do armazenamento do meu plano já foi
   consumido e ser avisado antes de estourar a quota.
6. **Como responsável pela clínica**, quero que todo download de documento de
   paciente fique registrado (quem, quando, qual arquivo) para prestação de
   contas LGPD.
7. **Como sistema** (planos 008/009/010), quero registrar PDFs gerados
   automaticamente na biblioteca do paciente com badge de origem, sem permitir
   edição manual dos metadados.
8. **Como clínica que separa papel clínico de administrativo**, quero
   restringir a categoria EXAME para que apenas usuários com perfil
   profissional a vejam (configuração por clínica, padrão desligado).

### 2.2 Fluxos

#### Fluxo A — Upload pela equipe (ADMIN ou PROFESSIONAL com permissão WRITE)

1. Usuário abre a ficha do paciente → aba **"Documentos"**.
2. Arrasta arquivo(s) para a dropzone (ou clica "Adicionar documento" → file
   picker; no mobile abre câmera/galeria).
3. Para cada arquivo, um card de envio mostra: nome, tamanho, seletor de
   **Categoria** (obrigatório, default "Documento") e campo **Descrição**
   (opcional, máx. 500 chars), toggle **"Compartilhar com paciente"** (default
   desligado; rodapé "Visível no portal do paciente quando disponível").
4. Validação client-side imediata: tipo permitido + tamanho ≤ limite. Arquivo
   inválido nem inicia upload (toast com motivo).
5. Ao confirmar, o cliente:
   a. (provider `vercel-blob`, produção) sobe o arquivo direto para o blob
      store via token de upload obtido do servidor (fluxo client-upload do
      Vercel Blob — contorna o limite de 4,5 MB de body das functions Vercel);
   b. (provider `fs`/`memory`, dev e testes) envia multipart direto à rota da
      API.
6. Após o binário subir, o cliente chama a rota de **registro** que cria a
   linha `PatientDocument` (server revalida tipo, tamanho, quota e prefixo da
   chave) e o documento aparece no topo da lista. Toast: "Documento anexado".
7. `AuditLog` `DOCUMENT_UPLOADED`.

Falhas: se o binário subiu mas o registro falhou (rede caiu), o blob fica órfão
e é coletado pelo cron de limpeza (Fluxo F). O usuário vê "Falha ao enviar
{nome}. Tente novamente."

#### Fluxo B — Listagem e busca

1. A aba Documentos lista os documentos do paciente (mais recentes primeiro):
   ícone por tipo de arquivo, nome, chip de categoria, badge de origem (apenas
   quando não for upload manual), tamanho legível ("1,4 MB"), data
   `DD/MM/YYYY`, nome de quem anexou ("Sistema" quando `uploaderUserId` nulo).
2. Filtro por categoria (chips) e busca por nome/descrição (client-side sobre a
   página carregada; paginação de 20 em 20 com "Carregar mais").
3. PROFESSIONAL vê os documentos dos pacientes a que tem acesso pela tela de
   pacientes (mesma regra de visibilidade da feature `patients` atual). Se a
   clínica ativou a restrição clínica, usuários **sem** `professionalProfileId`
   não veem documentos da categoria EXAME (somem da lista e o download retorna
   403).

#### Fluxo C — Visualizar / baixar

1. **Visualizar** (olho): abre modal de preview para `application/pdf` (iframe)
   e imagens (img). Demais tipos mostram "Visualização não disponível — baixe o
   arquivo." O preview usa a mesma rota de download com `?disposition=inline`.
2. **Baixar** (seta): dispara download com `Content-Disposition: attachment`.
3. Ambos passam por `GET /api/patients/[id]/documents/[docId]/download`, que:
   verifica autenticação + permissão + escopo de clínica + restrição EXAME,
   grava `AuditLog` `DOCUMENT_DOWNLOADED` (com `disposition`) e **só então**
   serve o arquivo (proxy/stream — o blob nunca é exposto por URL pública; ver
   §3.3).

#### Fluxo D — Editar metadados

1. Menu "⋯" → "Editar" abre modal com Categoria, Descrição e "Compartilhar com
   paciente". Nome do arquivo não é editável em v1.
2. Disponível somente para `source = UPLOAD`. Documentos gerados pelo sistema
   (GERADO/ASSINADO/FORMULARIO) mostram "Documento gerado pelo sistema — não
   editável" e só podem ser **substituídos** pela feature de origem (que cria
   um novo documento; o antigo permanece no histórico).
3. `AuditLog` `DOCUMENT_UPDATED` com oldValues/newValues dos campos alterados.

#### Fluxo E — Remover e restaurar (soft delete, 30 dias)

1. "⋯" → "Remover" → diálogo de confirmação: "Remover documento? Ele ficará na
   lixeira por 30 dias e depois será excluído definitivamente."
2. Remoção marca `deletedAt = now()`; o blob **não** é apagado ainda.
3. Toggle "Mostrar lixeira" na aba lista os removidos (linha esmaecida com
   "Removido em DD/MM/YYYY — exclui definitivamente em DD/MM/YYYY") com ação
   **"Restaurar"** (limpa `deletedAt`).
4. Documentos com `source` GERADO/ASSINADO/FORMULARIO **não podem ser
   removidos** enquanto o artefato clínico de origem existir (retenção de
   prontuário — CFP 5 anos+): o botão Remover fica desabilitado com tooltip
   "Documento vinculado ao prontuário — sujeito à retenção clínica." (v1: regra
   simples por `source != UPLOAD`; o vínculo fino com retenção vem nos planos
   001/009/010.)
5. `AuditLog` `DOCUMENT_DELETED` / `DOCUMENT_RESTORED`.

#### Fluxo F — Limpeza (cron semanal)

1. `GET /api/jobs/cleanup-documents` (segunda 04:00 UTC, `Bearer CRON_SECRET`
   como nos jobs existentes) executa, por clínica:
   a. **Purga da lixeira**: documentos com `deletedAt < now() - 30 dias` →
      `provider.delete(storageKey)` + delete da linha. Auditoria
      `DOCUMENTS_PURGED` (agregado, com contagem e ids).
   b. **Coleta de órfãos**: blobs sob o prefixo da clínica criados há mais de
      24h sem linha `PatientDocument` correspondente (uploads pela metade) →
      `provider.delete`.
2. Resposta JSON com contadores por clínica (mesmo formato dos jobs atuais).

#### Fluxo G — Quota e medidor de consumo

1. Toda tentativa de upload soma `usedBytes + sizeBytes` e compara com a quota
   do plano (`Plan.maxStorageMb`; `-1` = ilimitado). Excedeu → 403 com
   mensagem amigável: "Limite de armazenamento do seu plano atingido
   ({usado} de {limite}). Faça upgrade para anexar mais documentos." A UI
   mostra um banner com CTA para a página de billing.
2. **Configurações → Clínica** ganha um card "Armazenamento": barra de
   progresso `{usado} de {limite}` (ex.: "612 MB de 1 GB"), amarela ≥ 80%,
   vermelha ≥ 95%.
3. **Superadmin → Clínicas**: coluna "Armazenamento" com o consumo agregado por
   clínica.
4. Documentos na lixeira **continuam contando** na quota até a purga (o blob
   ainda ocupa espaço); o card de consumo discrimina "dos quais X MB na
   lixeira".

#### Fluxo H — Registro de documentos do sistema (contrato para planos 008/009/010)

Os outros planos chamam uma função de domínio (não uma rota HTTP):

```
registerSystemDocument(prisma, {
  clinicId, patientId, source,            // "GERADO" | "ASSINADO" | "FORMULARIO"
  filename, mimeType, sizeBytes, storageKey,
  category,                               // ex.: "CONTRATO" para TCLE assinado
  description,                            // ex.: "TCLE assinado em 12/08/2026"
})
```

O documento aparece na aba com badge de origem ("Gerado", "Assinado",
"Formulário"), `uploaderUserId = null` (exibido como "Sistema"), não editável,
não removível (Fluxo E.4). Uploads do sistema **não passam pela quota** de
upload (são artefatos clínicos obrigatórios), mas **contam** no consumo
exibido.

### 2.3 Telas

| Tela | Mudança |
|---|---|
| Ficha do paciente (`/patients`, painel de detalhe) | Nova aba **"Documentos"** ao lado de Dados / Histórico / Financeiro. Conteúdo: dropzone (desktop) / botão "Adicionar documento" (mobile), filtros por categoria, lista paginada, toggle lixeira. |
| Modal de upload | Card por arquivo com categoria, descrição, compartilhar com paciente, barra de progresso. |
| Modal de preview | PDF em iframe / imagem; título com nome do arquivo; botão Baixar. |
| Modal de edição | Categoria, descrição, compartilhar com paciente. |
| `/admin/settings` | Card "Armazenamento" (medidor) + toggle "Restringir exames a profissionais". |
| `/superadmin/clinics` | Coluna "Armazenamento" na tabela. |

Layout responsivo: na lista mobile, cada documento vira um card empilhado
(ícone + nome + chips na primeira linha; tamanho/data/autor na segunda; ações
no menu "⋯").

### 2.4 Regras de negócio

1. **Tipos permitidos (allowlist)**: `application/pdf`, `image/jpeg`,
   `image/png`, `image/webp`, `application/msword`,
   `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
   `application/vnd.ms-excel`,
   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
   `text/plain`, `text/csv`. Extensão deve ser coerente com o MIME declarado.
2. **Tamanho máximo**: 10 MB por arquivo (constante
   `DEFAULT_MAX_FILE_SIZE_BYTES`, sobrescrevível por env
   `DOCUMENT_MAX_SIZE_MB`).
3. **Categorias**: `EXAME`, `ENCAMINHAMENTO`, `DOCUMENTO`, `CONTRATO`, `OUTRO`.
4. **Nomes duplicados são permitidos** — a unicidade é da `storageKey`, nunca
   do filename.
5. **Arquivo nunca é público**: nenhum endpoint retorna a URL do blob; todo
   acesso passa pela rota de download autenticada que faz proxy do conteúdo.
6. **Toda operação é auditada**: upload, download (inclusive preview), edição,
   remoção, restauração e purga — com ator, documento e IP/user-agent.
7. **Escopo de clínica**: toda query filtra `clinicId = user.clinicId`; o
   `patientId` da URL é validado contra a clínica antes de qualquer operação.
8. **`source != UPLOAD`**: metadados imutáveis, remoção bloqueada, sem quota no
   registro.
9. **Quota**: aplica-se no upload manual; `-1` = ilimitado (mesma semântica de
   `maxProfessionals`/`checkProfessionalLimit`).
10. **Restrição clínica opcional**: com
    `Clinic.restrictExamesToProfessionals = true`, documentos `EXAME` só são
    visíveis/baixáveis por usuários com `professionalProfileId` preenchido.
11. **`sharedWithPatient`** (default `false`) não tem efeito em v1 além de ser
    armazenado e exibido — é o contrato com o portal-do-paciente (plano 003).

### 2.5 Edge cases

- **Upload duplo do mesmo arquivo**: permitido; geram duas linhas com chaves
  distintas.
- **Meio-upload** (binário subiu, registro não): blob órfão coletado pelo cron
  após 24h. Janela de 24h evita apagar uploads em andamento.
- **Conexão lenta**: o fluxo client-upload do Vercel Blob usa multipart nativo
  do provider; v1 não implementa resume manual, mas o caminho fica pronto para
  habilitar `multipart: true` do SDK.
- **Paciente desativado** (`isActive=false`): documentos continuam visíveis
  (histórico); upload permanece permitido (digitalização retroativa).
- **EXIF de imagens não é removido em v1** — registrado como melhoria de
  privacidade futura (risco §6).
- **Clínica sem plano** (`planId` null, trial): usa quota default do produto
  (1024 MB) via fallback no código.
- **Arquivo de 0 bytes**: rejeitado ("Arquivo vazio").
- **Nome de arquivo com acentos/emoji/path traversal** (`../../etc`):
  `sanitizeFilename` normaliza para a chave; o nome original é preservado
  intacto na coluna `filename` para exibição.
- **Falha do provider no download**: 502 com "Não foi possível recuperar o
  arquivo. Tente novamente." (o erro nunca expõe a chave).
- **Exclusão LGPD do paciente**: a exportação de dados do paciente (quando
  implementada/estendida) deve incluir a listagem e os arquivos (zip via
  `archiver`, já dependência do projeto) — ver integração §3.7.

### 2.6 Copy pt-BR (chaves principais)

| Contexto | Texto |
|---|---|
| Aba | "Documentos" |
| Botão upload | "Adicionar documento" |
| Dropzone | "Arraste arquivos aqui ou clique para selecionar" |
| Hint | "PDF, imagens e documentos do Office até 10 MB" |
| Categorias | "Exame", "Encaminhamento", "Documento", "Contrato", "Outro" |
| Badges de origem | "Gerado", "Assinado", "Formulário" |
| Compartilhar | "Compartilhar com paciente" |
| Sucesso | "Documento anexado" / "Documento atualizado" / "Documento removido" / "Documento restaurado" |
| Erro tipo | "Tipo de arquivo não permitido. Use PDF, imagens ou documentos do Office." |
| Erro tamanho | "Arquivo excede o limite de {limite}." |
| Erro vazio | "Arquivo vazio." |
| Quota | "Limite de armazenamento do seu plano atingido ({usado} de {limite}). Faça upgrade para anexar mais documentos." |
| Lixeira | "Mostrar lixeira" / "Removido em {data} — exclui definitivamente em {data}" / "Restaurar" |
| Confirmação remoção | "Remover documento? Ele ficará na lixeira por 30 dias e depois será excluído definitivamente." |
| Sistema | "Documento gerado pelo sistema — não editável" |
| Retenção | "Documento vinculado ao prontuário — sujeito à retenção clínica" |
| Medidor | "Armazenamento: {usado} de {limite}" / "dos quais {x} na lixeira" |
| Vazio | "Nenhum documento anexado ainda." |
| Sem preview | "Visualização não disponível — baixe o arquivo." |

---

## 3. Design Técnico

### 3.0 Decisões de arquitetura

1. **Blobs fora do Postgres.** Arquivos vão para um object store atrás da
   abstração `StorageProvider`; o banco guarda só metadados + `storageKey`.
2. **Provider v1 = Vercel Blob** (`@vercel/blob`, nova dependência) — encaixa
   no deploy Vercel sem credenciais extras (`BLOB_READ_WRITE_TOKEN` injetado
   pela plataforma). Adapter S3-compatível (R2/S3) fica possível depois sem
   tocar nas rotas.
3. **Download sempre por proxy/stream** pela rota autenticada (nunca redirect
   para URL do provider). Motivo: URLs do Vercel Blob são públicas-porém-
   imprevisíveis e **não expiram** — um redirect vazaria uma capability
   permanente do arquivo. O proxy garante: autorização em todo acesso +
   auditoria completa + nenhuma URL persistente. A interface
   `getDownloadStream()` permite que um futuro adapter S3 troque para presigned
   URL com expiração curta (mudando a rota para 302) sem quebrar contrato.
4. **Upload em duas fases** (token de client-upload → registro) em produção,
   porque o body de request nas functions Vercel é limitado a **4,5 MB** e o
   limite do produto é 10 MB. Em dev/teste o provider `fs`/`memory` aceita
   multipart direto na API (sem limite de plataforma).
5. **Dois módulos de domínio**: `src/lib/storage/` (genérico: provider,
   chaves, validação, quota — reutilizável por NFS-e, logos, etc. no futuro) e
   `src/lib/patient-documents/` (regras de negócio do documento de paciente:
   permissões, ciclo de vida, registro pelo sistema).
6. **Escopo de profissional**: v1 espelha o comportamento atual da feature
   `patients` (PROFESSIONAL com `patients: READ` enxerga pacientes da clínica;
   não há own-scoping fino em pacientes hoje — ver `GET /api/patients/[id]`).
   Introduzir own-scoping de documentos antes de existir own-scoping de
   pacientes criaria inconsistência. A restrição EXAME por
   `professionalProfileId` cobre o caso clínico mais sensível.

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

```prisma
enum PatientDocumentSource {
  UPLOAD      // anexado manualmente pela equipe
  GERADO      // PDF do gerador de documentos CFP (plano 009)
  ASSINADO    // PDF carimbado da assinatura digital (plano 010)
  FORMULARIO  // exportação de formulário/anamnese (plano 008)
}

enum PatientDocumentCategory {
  EXAME
  ENCAMINHAMENTO
  DOCUMENTO
  CONTRATO
  OUTRO
}

/// Documento/arquivo anexado a um paciente (blob fica no StorageProvider)
model PatientDocument {
  id                String                  @id @default(cuid())
  clinicId          String
  patientId         String
  uploaderUserId    String?                 // null = gerado pelo sistema
  source            PatientDocumentSource   @default(UPLOAD)
  category          PatientDocumentCategory @default(DOCUMENTO)
  filename          String                  // nome original, para exibição
  mimeType          String
  sizeBytes         Int
  storageKey        String                  @unique // clinics/{clinicId}/patients/{patientId}/{docId}-{slug}
  description       String?
  sharedWithPatient Boolean                 @default(false) // portal do paciente (plano 003)
  deletedAt         DateTime?               // soft delete; purga após 30 dias
  createdAt         DateTime                @default(now())
  updatedAt         DateTime                @updatedAt

  // Relations
  clinic   Clinic  @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  patient  Patient @relation(fields: [patientId], references: [id], onDelete: Cascade)
  uploader User?   @relation("UploadedPatientDocuments", fields: [uploaderUserId], references: [id], onDelete: SetNull)

  @@index([clinicId])
  @@index([clinicId, patientId, deletedAt, createdAt])
  @@index([deletedAt]) // varredura do cron de purga
}
```

Acréscimos em modelos existentes:

```prisma
model Clinic {
  // ... campos existentes ...
  restrictExamesToProfessionals Boolean @default(false) // categoria EXAME visível só a quem tem professionalProfile
  patientDocuments              PatientDocument[]
}

model Patient {
  // ... campos existentes ...
  documents PatientDocument[]
}

model User {
  // ... campos existentes ...
  uploadedPatientDocuments PatientDocument[] @relation("UploadedPatientDocuments")
}

model Plan {
  // ... campos existentes ...
  maxStorageMb Int @default(1024) // quota de armazenamento; -1 = ilimitado (semântica igual a maxProfessionals)
}
```

#### Migração SQL (autorada offline — **NUNCA** `prisma db push`/`migrate dev`)

Criar `prisma/migrations/20260611120000_add_patient_documents/migration.sql`
(seguindo o padrão de nomes `2026MMDDhhmmss_descricao` do projeto):

```sql
-- CreateEnum
CREATE TYPE "PatientDocumentSource" AS ENUM ('UPLOAD', 'GERADO', 'ASSINADO', 'FORMULARIO');
CREATE TYPE "PatientDocumentCategory" AS ENUM ('EXAME', 'ENCAMINHAMENTO', 'DOCUMENTO', 'CONTRATO', 'OUTRO');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN "restrictExamesToProfessionals" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Plan" ADD COLUMN "maxStorageMb" INTEGER NOT NULL DEFAULT 1024;

-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "uploaderUserId" TEXT,
    "source" "PatientDocumentSource" NOT NULL DEFAULT 'UPLOAD',
    "category" "PatientDocumentCategory" NOT NULL DEFAULT 'DOCUMENTO',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "description" TEXT,
    "sharedWithPatient" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientDocument_storageKey_key" ON "PatientDocument"("storageKey");
CREATE INDEX "PatientDocument_clinicId_idx" ON "PatientDocument"("clinicId");
CREATE INDEX "PatientDocument_clinicId_patientId_deletedAt_createdAt_idx"
    ON "PatientDocument"("clinicId", "patientId", "deletedAt", "createdAt");
CREATE INDEX "PatientDocument_deletedAt_idx" ON "PatientDocument"("deletedAt");

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_uploaderUserId_fkey"
    FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Aplicação local: `npx prisma migrate deploy` contra o banco Docker da feature
(worktree isolado via `scripts/new-feature.sh anexos-paciente`). Depois
`npx prisma generate`.

> Nota: `onDelete: Cascade` em `Patient` apaga as **linhas**, não os blobs.
> Hard-delete de paciente é raro (o produto usa `isActive=false`); o cron de
> órfãos (Fluxo F.b) recolhe blobs cujas linhas sumiram.

### 3.2 Módulo genérico `src/lib/storage/`

Arquivos (todos < 200 linhas, com testes colocados):

```
src/lib/storage/
├── index.ts            # barrel
├── types.ts            # interface StorageProvider + tipos
├── provider.ts         # getStorageProvider() — factory singleton por env
├── vercel-blob.ts      # implementação @vercel/blob (server: head/stream/delete/list)
├── fs-provider.ts      # dev: grava em STORAGE_FS_DIR (default .storage/, gitignored)
├── memory-provider.ts  # vitest: Map<string, {bytes, mimeType}>
├── keys.ts             # geração/validação de chaves (puro)
├── validation.ts       # allowlist MIME, tamanho, extensão (puro)
├── quota.ts            # matemática de quota + formatBytes pt-BR (puro)
├── keys.test.ts
├── validation.test.ts
├── quota.test.ts
└── memory-provider.test.ts
```

```typescript
// types.ts
export interface PutOptions { mimeType: string }
export interface StoredObject { key: string; sizeBytes: number; uploadedAt: Date }

export interface StorageProvider {
  put(key: string, body: Buffer | ReadableStream, opts: PutOptions): Promise<void>
  /** Stream + metadados para a rota de download (proxy). null se não existe. */
  getDownloadStream(key: string): Promise<{ body: ReadableStream; mimeType: string; sizeBytes: number } | null>
  head(key: string): Promise<StoredObject | null>
  delete(key: string): Promise<void>           // idempotente (não lança se ausente)
  list(prefix: string): Promise<StoredObject[]> // para GC de órfãos
}

// provider.ts — seleção por env (singleton, padrão de src/lib/prisma.ts)
// STORAGE_PROVIDER: "vercel-blob" | "fs" | "memory"
// default: "vercel-blob" se BLOB_READ_WRITE_TOKEN presente, senão "fs"
export function getStorageProvider(): StorageProvider

// keys.ts (puro)
export function sanitizeFilename(filename: string): string
// NFD → remove acentos; [^a-zA-Z0-9._-] → "-"; colapsa "-"; máx. 80 chars; nunca vazio ("arquivo")
export function buildStorageKey(p: { clinicId: string; patientId: string; documentId: string; filename: string }): string
// => `clinics/${clinicId}/patients/${patientId}/${documentId}-${sanitizeFilename(filename)}`
export function clinicPrefix(clinicId: string): string            // `clinics/${clinicId}/`
export function keyBelongsTo(key: string, clinicId: string, patientId: string): boolean
// valida prefixo exato — barreira anti cross-tenant no registro de client-uploads

// validation.ts (puro)
export const ALLOWED_MIME_TYPES: ReadonlyMap<string, readonly string[]> // mime -> extensões
export const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
export function getMaxFileSizeBytes(env?: string): number          // DOCUMENT_MAX_SIZE_MB override
export function validateUpload(p: { filename: string; mimeType: string; sizeBytes: number; maxSizeBytes: number }):
  { ok: true } | { ok: false; error: string }                      // mensagens pt-BR de §2.6

// quota.ts (puro)
export interface StorageQuotaCheck { maxStorageMb: number | null; usedBytes: number; incomingBytes: number }
export function checkStorageQuota(c: StorageQuotaCheck): LimitResult  // mesmo shape de limits.ts; null/-1 = ilimitado
export function storageLimitBytes(maxStorageMb: number | null): number | null
export function formatBytes(bytes: number): string                  // "612 KB", "1,4 MB", "2,1 GB" (vírgula pt-BR)
export function usagePercent(usedBytes: number, limitBytes: number | null): number | null
```

`vercel-blob.ts` usa `head()`/`del()`/`list()` de `@vercel/blob` e `fetch` da
URL do blob para `getDownloadStream` (a URL fica encapsulada no provider e
nunca sai dele). `fs-provider.ts` grava `{STORAGE_FS_DIR}/{key}` + sidecar
`.meta.json` com o mimeType.

### 3.3 Módulo de domínio `src/lib/patient-documents/`

```
src/lib/patient-documents/
├── index.ts
├── types.ts            # PatientDocumentDTO, CATEGORY_LABELS, SOURCE_LABELS (pt-BR)
├── permissions.ts      # regras puras de visibilidade/edição/remoção
├── lifecycle.ts        # regras puras de purga/órfãos
├── register.ts         # registerSystemDocument (contrato planos 008/009/010)
├── usage.ts            # getClinicStorageUsage(prisma, clinicId) — agregação
├── permissions.test.ts
└── lifecycle.test.ts
```

```typescript
// permissions.ts (puro)
export interface DocumentViewer { professionalProfileId: string | null }
export interface DocumentMeta { source: PatientDocumentSourceString; category: string; deletedAt: Date | null }

export function canViewDocument(viewer: DocumentViewer, doc: DocumentMeta,
  settings: { restrictExamesToProfessionals: boolean }): boolean
// false somente quando: settings.restrict... && doc.category === "EXAME" && viewer.professionalProfileId === null

export function canEditDocument(doc: DocumentMeta): boolean      // source === "UPLOAD" && !deletedAt
export function canDeleteDocument(doc: DocumentMeta): boolean    // source === "UPLOAD" && !deletedAt
export function visibleCategoriesFor(viewer: DocumentViewer,
  settings: { restrictExamesToProfessionals: boolean }): string[] // para montar o WHERE da listagem

// lifecycle.ts (puro)
export const TRASH_RETENTION_DAYS = 30
export const ORPHAN_GRACE_HOURS = 24
export function isPurgeEligible(deletedAt: Date | null, now: Date): boolean
export function purgeDeadline(deletedAt: Date): Date              // p/ copy "exclui definitivamente em DD/MM/YYYY"
export function findOrphanKeys(blobs: StoredObject[], knownKeys: Set<string>, now: Date): string[]
// blobs sem linha no banco E uploadedAt < now - ORPHAN_GRACE_HOURS

// register.ts — usado pelos planos 008/009/010 (recebe tx/prisma; sem quota de upload)
export async function registerSystemDocument(db: PrismaClientLike, input: RegisterSystemDocumentInput): Promise<{ id: string }>

// usage.ts
export async function getClinicStorageUsage(db: PrismaClientLike, clinicId: string):
  Promise<{ usedBytes: number; trashBytes: number }>
// prisma.patientDocument.aggregate({ _sum: { sizeBytes } }) com e sem deletedAt
```

### 3.4 Rotas de API

Todas usam `withFeatureAuth` de `@/lib/api`, **auto-escopam por
`user.clinicId`** e validam que o `params.id` (paciente) pertence à clínica
antes de qualquer coisa (padrão de `GET /api/patients/[id]`; se o helper
`src/lib/clinic/ownership.ts` já existir no momento da implementação —
introduzido por plano vizinho — usar `assertPatientInClinic` de lá em vez de
repetir o `findFirst`). Handlers ficam finos (< 50 linhas de lógica inline)
delegando para os módulos §3.2/§3.3.

| Rota | Método | Auth | Descrição |
|---|---|---|---|
| `/api/patients/[id]/documents` | GET | `patients` READ | Lista documentos do paciente |
| `/api/patients/[id]/documents/upload` | POST | `patients` WRITE | Upload multipart direto (dev/fs; arquivos pequenos) |
| `/api/patients/[id]/documents/upload-token` | POST | `patients` WRITE | Token de client-upload Vercel Blob (produção) |
| `/api/patients/[id]/documents/register` | POST | `patients` WRITE | Registra blob enviado via client-upload |
| `/api/patients/[id]/documents/[docId]` | PATCH | `patients` WRITE | Edita metadados |
| `/api/patients/[id]/documents/[docId]` | DELETE | `patients` WRITE | Soft delete |
| `/api/patients/[id]/documents/[docId]/restore` | POST | `patients` WRITE | Restaura da lixeira |
| `/api/patients/[id]/documents/[docId]/download` | GET | `patients` READ | Proxy do arquivo (`?disposition=inline\|attachment`) |
| `/api/clinic/storage-usage` | GET | `clinic_settings` READ | Medidor de consumo |
| `/api/jobs/cleanup-documents` | GET | `Bearer CRON_SECRET` | Cron semanal de purga + órfãos |
| `/api/superadmin/clinics` | GET | `withSuperAdmin` (existente) | + agregado de storage por clínica |

Detalhes dos contratos:

**`GET /api/patients/[id]/documents`**
Query: `?includeDeleted=true|false` (default false), `?category=`, `?skip=&take=`
(take ≤ 50). WHERE: `{ clinicId, patientId, deletedAt: includeDeleted ? not-null-also : null, category: { in: visibleCategoriesFor(...) } }`,
`orderBy createdAt desc`. Response:
```json
{ "documents": [{ "id", "filename", "mimeType", "sizeBytes", "category",
  "source", "description", "sharedWithPatient", "deletedAt", "createdAt",
  "uploader": { "name" } | null }], "total": 12 }
```

**`POST /api/patients/[id]/documents/upload`** (multipart `file`, `category`,
`description?`, `sharedWithPatient?`)
1. Paciente ∈ clínica; 2. `validateUpload`; 3. quota (`getClinicStorageUsage` +
`checkStorageQuota` com `Plan.maxStorageMb` da clínica, fallback 1024);
4. `documentId = cuid()` → `buildStorageKey` → `provider.put`; 5. cria linha
(`uploaderUserId = user.id`, `source: "UPLOAD"`); 6. `audit` `DOCUMENT_UPLOADED`.
Erros: 400 validação, 403 quota (`{ error, code: "STORAGE_QUOTA_EXCEEDED", usedBytes, limitBytes }`), 404 paciente.

**`POST /api/patients/[id]/documents/upload-token`**
Implementa o protocolo `handleUpload` de `@vercel/blob/client`. Em
`onBeforeGenerateToken`: mesmos passos 1–3 acima + restringe
`allowedContentTypes` à allowlist, `maximumSizeInBytes` e `pathname` ao prefixo
`clinics/{clinicId}/patients/{patientId}/` (com `addRandomSuffix`). **Não**
cria linha no banco (isso é papel do `register`); `onUploadCompleted` é no-op
(não confiável em dev). Disponível apenas quando `STORAGE_PROVIDER`
= `vercel-blob` (senão 400 instruindo a usar `/upload`).

**`POST /api/patients/[id]/documents/register`** (JSON: `storageKey`,
`filename`, `mimeType`, `category`, `description?`, `sharedWithPatient?`)
1. Paciente ∈ clínica; 2. `keyBelongsTo(storageKey, user.clinicId, params.id)`
→ 403 se falso (barreira anti cross-tenant: o cliente não consegue registrar
blob de outra clínica/paciente); 3. `provider.head(storageKey)` → 404 se o blob
não existe; usa `sizeBytes` real do provider (nunca o declarado); 4.
`validateUpload` + quota; 5. `storageKey` já registrada → 409; 6. cria linha +
audit. (Se a quota reprovar aqui, o blob fica órfão e o cron o recolhe.)

**`GET .../[docId]/download`**
1. `findFirst({ id: docId, patientId: params.id, clinicId: user.clinicId })` →
404; 2. `canViewDocument` → 403; 3. soft-deleted → 410 ("Documento removido");
4. `audit` `DOCUMENT_DOWNLOADED` (`newValues: { filename, disposition }`);
5. `provider.getDownloadStream` → `new NextResponse(body, { headers: {
"Content-Type", "Content-Length", "Content-Disposition":
`${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
"Cache-Control": "private, no-store" } })`. Provider falhou → 502.

**`PATCH .../[docId]`** (zod: `category?`, `description?`,
`sharedWithPatient?`) — `canEditDocument` → 403 com copy "Documento gerado pelo
sistema — não editável"; audit `DOCUMENT_UPDATED` com old/new somente dos
campos alterados (padrão do PATCH de paciente).

**`DELETE .../[docId]`** — `canDeleteDocument` → 403 (copy de retenção);
seta `deletedAt`; audit `DOCUMENT_DELETED`.
**`POST .../[docId]/restore`** — exige `deletedAt != null` e ainda não purgado;
limpa `deletedAt`; audit `DOCUMENT_RESTORED`.

**`GET /api/clinic/storage-usage`** → `{ usedBytes, trashBytes, limitBytes,
percent }` (limite via `clinic.plan?.maxStorageMb ?? 1024`;
`limitBytes: null` quando ilimitado).

**`GET /api/jobs/cleanup-documents`** (novo arquivo
`src/app/api/jobs/cleanup-documents/route.ts`, mesmo guard `Bearer
CRON_SECRET` de `send-reminders`): itera clínicas com documentos; purga
elegíveis (`isPurgeEligible`) — `provider.delete` antes do delete da linha
(delete idempotente permite retry) — e coleta órfãos via
`provider.list(clinicPrefix(clinicId))` + `findOrphanKeys`. Response:
`{ processed: { clinics, purged, orphansDeleted }, errors: [...] }`.

### 3.5 RBAC e auditoria

- **Sem feature RBAC nova em v1.** Documentos seguem a feature `patients`
  (READ lista/baixa; WRITE anexa/edita/remove). Racional: documentos são parte
  da ficha do paciente; PROFESSIONAL tem default `patients: READ`, então **não
  anexa por padrão** — o admin concede via override `UserPermission`
  (`patients: WRITE`), mecanismo já existente na tela de permissões. Se na
  prática toda clínica precisar liberar WRITE só para documentos, promove-se a
  feature dedicada `patient_documents` em iteração futura (listado em §6).
- **Novas ações de auditoria** em `src/lib/rbac/audit.ts` (`AuditAction`):

```typescript
// Patient documents
DOCUMENT_UPLOADED: "DOCUMENT_UPLOADED",
DOCUMENT_DOWNLOADED: "DOCUMENT_DOWNLOADED",
DOCUMENT_UPDATED: "DOCUMENT_UPDATED",
DOCUMENT_DELETED: "DOCUMENT_DELETED",
DOCUMENT_RESTORED: "DOCUMENT_RESTORED",
DOCUMENTS_PURGED: "DOCUMENTS_PURGED",   // cron (agregado por clínica)
```

  `entityType: "PatientDocument"`, `entityId: doc.id`. Para `DOCUMENTS_PURGED`
  (cron, sem `AuthUser`): inserir via `prisma.auditLog.create` com
  `userId: null` (padrão `logAuthEvent`). Labels novos em
  `src/lib/audit/field-labels.ts` (`category`, `filename`, `sharedWithPatient`,
  `description`) para a timeline de histórico.

### 3.6 UI — componentes e páginas

**Novos** (feature-specific, em `src/app/patients/components/documents/`,
cada um < 200 linhas):

| Arquivo | Responsabilidade |
|---|---|
| `PatientDocumentsTab.tsx` | Orquestra a aba: fetch paginado, filtros, toggle lixeira, estados vazio/erro |
| `DocumentUploadZone.tsx` | Dropzone + file picker; valida client-side (reusa `validateUpload` de `src/lib/storage/validation` — função pura, roda no browser); decide fluxo direto vs client-upload |
| `DocumentUploadCard.tsx` | Card por arquivo em envio: categoria, descrição, compartilhar, progresso |
| `DocumentList.tsx` / `DocumentRow.tsx` | Tabela desktop / cards mobile; menu "⋯" |
| `DocumentCategoryChip.tsx` | Chip de categoria (cores fixas por categoria) |
| `DocumentSourceBadge.tsx` | Badge "Gerado"/"Assinado"/"Formulário" |
| `DocumentPreviewModal.tsx` | iframe (PDF) / img com `?disposition=inline` |
| `DocumentEditModal.tsx` | react-hook-form + zod (categoria, descrição, compartilhar) |
| `StorageQuotaBanner.tsx` | Banner 403 de quota com CTA de upgrade |

Ícones lucide: `FileText`, `Image`, `FileSpreadsheet`, `File`, `Upload`,
`Eye`, `Download`, `Trash2`, `RotateCcw`, `Pencil`. Toasts via Sonner.
**Sem `useEffect`**: dados via fetch disparado por handlers/chave de
revalidação local (mesmo padrão imperativo da página de pacientes); progresso
de upload via callbacks do `upload()`/`XMLHttpRequest`.

**Alterados:**

| Arquivo | Mudança |
|---|---|
| `src/app/patients/components/PatientDetailsView.tsx` | `PatientTabKey` += `"documentos"`; botão da aba; render `<PatientDocumentsTab patientId={...} canWrite={canWrite} />`. (Arquivo já tem 438 linhas — extrair o `PatientFinanceTab` interno para arquivo próprio nesta passada, conforme regra de tamanho.) |
| `src/app/patients/page.tsx` | repassar `canWrite` já existente; estado da nova aba |
| `src/app/admin/settings/...` (página de configurações) | Card `StorageUsageCard.tsx` (novo, em `src/app/admin/settings/components/`) consumindo `/api/clinic/storage-usage` + toggle "Restringir exames a profissionais" (persiste em `PATCH /api/admin/settings`, acrescentar campo ao zod da rota existente) |
| `src/app/superadmin/clinics/...` tabela | coluna "Armazenamento" (`formatBytes`) |
| `src/app/api/superadmin/clinics/route.ts` | incluir agregado `_sum.sizeBytes` por clínica (groupBy) |
| `.gitignore` | `.storage/` (provider fs de dev) |
| `vercel.json` | novo cron (abaixo) |
| `package.json` | `"@vercel/blob": "^x"` (dependência nova) |

```json
// vercel.json — acrescentar em "crons"
{ "path": "/api/jobs/cleanup-documents", "schedule": "0 4 * * 1" }
```

**Env vars** (`.env.example` + Vercel): `BLOB_READ_WRITE_TOKEN` (injetada pela
integração Vercel Blob), `STORAGE_PROVIDER` (opcional), `STORAGE_FS_DIR`
(opcional, default `.storage`), `DOCUMENT_MAX_SIZE_MB` (opcional, default 10).

### 3.7 Pontos de integração

- **Planos 008/009/010**: chamam `registerSystemDocument()` (§3.3) dentro das
  próprias transações ao gerar/arquivar PDFs. Contrato congelado neste plano.
- **Portal do paciente (003)**: consome `sharedWithPatient = true` +
  `deletedAt = null` com rota própria no contexto do portal (fora do escopo
  aqui; o flag e a auditoria de download já ficam prontos).
- **Exportação LGPD do paciente**: quando a exportação existir/for estendida,
  incluir `documents` (metadados) + zip dos arquivos via `archiver`
  (dependência já presente) lendo de `provider.getDownloadStream`. Registrado
  como follow-up, não bloqueia v1.
- **Notificações**: nenhuma em v1 (uploads não notificam paciente).
- **Subscription/limits**: `checkStorageQuota` segue o shape `LimitResult` de
  `src/lib/subscription/limits.ts` e é exportado também pelo barrel
  `src/lib/subscription/index.ts` para consistência; tela de planos do
  superadmin (`/superadmin/plans`) ganha campo "Armazenamento (MB)" mapeando
  `Plan.maxStorageMb` (form + zod da rota `api/superadmin/plans`).

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`. Enums
Prisma como string literais (`"UPLOAD"`, `"EXAME"`).

| Arquivo | Comportamentos |
|---|---|
| `src/lib/storage/validation.test.ts` | aceita cada MIME da allowlist; rejeita `application/x-msdownload`, `image/gif`; rejeita extensão incoerente com MIME (`laudo.exe` como `application/pdf`); rejeita 0 bytes; rejeita > limite; boundary exatamente no limite passa; `getMaxFileSizeBytes` com e sem env override |
| `src/lib/storage/keys.test.ts` | `sanitizeFilename`: acentos ("laudó é.pdf" → "laudo-e.pdf"), emoji, `../../etc/passwd` sem path traversal, nome > 80 chars truncado, string vazia → "arquivo"; `buildStorageKey` formato completo; `keyBelongsTo` true/false (outra clínica, outro paciente, prefixo parcial malicioso `clinics/c1x/...`) |
| `src/lib/storage/quota.test.ts` | abaixo da quota ok; estouro reprova com mensagem pt-BR; exatamente no limite ok; `-1` e `null` ilimitados; `storageLimitBytes` conversão MB→bytes; `formatBytes` ("0 B", "512 KB", "1,4 MB", "2,1 GB" com vírgula); `usagePercent` (50%, >100% clampado, null quando ilimitado) |
| `src/lib/storage/memory-provider.test.ts` | put/getDownloadStream roundtrip preserva bytes e mimeType; head retorna sizeBytes; delete idempotente (2x não lança); list filtra por prefixo; getDownloadStream de chave inexistente → null |
| `src/lib/patient-documents/permissions.test.ts` | `canViewDocument`: EXAME + restrição + viewer sem perfil → false; EXAME + restrição + viewer com perfil → true; EXAME sem restrição → true; outras categorias sempre true; `canEditDocument`/`canDeleteDocument`: UPLOAD true, GERADO/ASSINADO/FORMULARIO false, soft-deleted false; `visibleCategoriesFor` com/sem restrição |
| `src/lib/patient-documents/lifecycle.test.ts` | `isPurgeEligible`: 29 dias false, 30 dias+1s true, deletedAt null false (usar `vi.useFakeTimers`); `purgeDeadline` = deletedAt + 30d; `findOrphanKeys`: blob sem linha e > 24h → órfão; blob sem linha < 24h → não; blob com linha → não |
| `src/app/api/jobs/cleanup-documents/route.test.ts` | guard do CRON_SECRET (401 sem header); purga chama provider.delete antes do delete da linha; órfãos coletados; erros de uma clínica não abortam as demais (espelhar estilo de `extend-recurrences/route.test.ts`, com mocks de prisma/provider) |
| `src/lib/patient-documents/register.test.ts` (com prisma mockado) | cria linha com uploaderUserId null e source correto; recusa source "UPLOAD" via registerSystemDocument |

Gates antes de cada commit: `npx prisma generate && npm run test && npm run build`.

---

## 5. Etapas de Implementação

Cada etapa compila, passa testes e é commitável isoladamente
(conventional commits; ex.: `feat(documentos): ...` + trailer
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; **nunca** `git push`).

1. **Worktree + banco isolado**: `bash scripts/new-feature.sh anexos-paciente`;
   trabalhar em `../clinica-anexos-paciente`.
2. **Schema + migração**: editar `prisma/schema.prisma` (§3.1); criar
   `prisma/migrations/20260611120000_add_patient_documents/migration.sql` à mão;
   `npx prisma migrate deploy` no banco da feature; `npx prisma generate`.
   Verificar: `npm run build` verde.
3. **`src/lib/storage/` puro**: `types.ts`, `keys.ts`, `validation.ts`,
   `quota.ts` + testes. Verificar: `npx vitest run src/lib/storage`.
4. **Providers**: `memory-provider.ts` (+ teste), `fs-provider.ts`,
   `vercel-blob.ts` (instalar `@vercel/blob`), `provider.ts` factory;
   `.gitignore` += `.storage/`. Verificar: testes + build.
5. **`src/lib/patient-documents/`**: `types.ts` (labels pt-BR),
   `permissions.ts`, `lifecycle.ts`, `register.ts`, `usage.ts` + testes.
   Acrescentar `AuditAction` novos e labels em `field-labels.ts`.
6. **Rotas core**: `GET documents` (lista), `POST upload` (multipart direto),
   `GET download` (proxy + audit). Verificar manualmente em dev (provider fs):
   upload → arquivo em `.storage/`, download com auth, 404 cross-tenant
   (paciente de outra clínica → 404).
7. **Rotas de mutação**: `PATCH`, `DELETE` (soft), `restore` + auditoria.
   Verificar: editar/remover/restaurar pela API; GERADO recusa edição (semear
   um doc com source GERADO via script/Studio).
8. **Client-upload produção**: `upload-token` (handleUpload) + `register`
   (com `keyBelongsTo` + `head`). Verificar: em dev a rota token retorna 400
   "provider sem client-upload"; register recusa chave de outro prefixo (403).
9. **Quota**: integrar `checkStorageQuota` em upload/register; rota
   `GET /api/clinic/storage-usage`; campo `maxStorageMb` no form/route de
   planos do superadmin; agregado na listagem de clínicas do superadmin.
   Verificar: setar quota 1 MB num plano de teste e estourar.
10. **Cron**: `api/jobs/cleanup-documents/route.ts` + teste + entrada em
    `vercel.json`. Verificar: `curl -H "Authorization: Bearer $CRON_SECRET"`,
    doc com `deletedAt` retroagido some do banco e do `.storage/`.
11. **UI da aba Documentos**: componentes §3.6, extração do `PatientFinanceTab`
    de `PatientDetailsView.tsx`, nova aba, fluxos A–E completos. Verificar no
    browser (desktop + viewport mobile): upload drag-and-drop, preview PDF e
    imagem, edição, lixeira, busca/filtros, copy pt-BR, datas DD/MM/YYYY.
12. **UI de configurações + superadmin**: `StorageUsageCard`, toggle
    "Restringir exames a profissionais" (incluir campo no zod de
    `api/admin/settings`), coluna no superadmin. Verificar: restrição esconde
    EXAME para admin sem perfil profissional e o download retorna 403.
13. **Gates finais + docs**: `npx prisma generate && npm run test &&
    npm run build`; atualizar `.env.example`; atualizar seção de modelos do
    `CLAUDE.md` (PatientDocument); commit final. **Não fazer push** — aguardar
    revisão do usuário.

---

## 6. Riscos e Questões em Aberto

| # | Risco / questão | Mitigação / decisão proposta |
|---|---|---|
| 1 | **URLs do Vercel Blob são públicas (não expiram)** — qualquer vazamento da URL expõe dado de saúde permanentemente. | v1 nunca expõe a URL (proxy via rota autenticada; URL vive só dentro do provider). Médio prazo: adapter S3/R2 com bucket privado + presigned URL de 60s e rota mudando para 302 (interface já comporta). Avaliar também `del`+re-upload em rotação se houver suspeita de vazamento. |
| 2 | **Proxy de download consome banda/tempo de function** (arquivo de 10 MB passa pela Vercel Function a cada download). | Aceitável no volume de clínicas atual (arquivos ≤ 10 MB, streaming). Monitorar; o adapter S3 presigned elimina o custo quando necessário. |
| 3 | **Limite de 4,5 MB de body nas functions Vercel** quebra upload direto em produção. | Fluxo client-upload (token) é o caminho de produção; o multipart direto fica para dev e arquivos pequenos. A UI escolhe o fluxo pelo provider retornado pela API, não por tamanho. |
| 4 | **`onUploadCompleted` do Vercel Blob não dispara em localhost** e pode falhar silenciosamente. | Não dependemos dele: a linha é criada pelo `register` chamado pelo cliente; órfãos são varridos pelo cron com carência de 24h. |
| 5 | **Quota burlável entre upload-token e register** (cliente sobe blob e nunca registra). | Blob não registrado não é acessível por ninguém e é coletado em ≤ 1 semana; quota é re-checada no register com o `sizeBytes` real do `head()`. |
| 6 | **MIME declarado ≠ conteúdo real** (renomear .exe para .pdf). | v1 valida MIME+extensão declarados; sniffing de magic bytes listado como melhoria (biblioteca `file-type`) — risco contido pois download serve `Content-Type` do registro e `Content-Disposition` força download para tipos sem preview. |
| 7 | **EXIF/geolocalização em fotos não é removido em v1.** | Documentado como melhoria de privacidade (strip EXIF server-side com `sharp` no put de imagens). |
| 8 | **Feature RBAC dedicada?** PROFESSIONAL default tem `patients: READ`, logo não anexa sem override. | Decisão v1: manter na feature `patients` (§3.5) e medir fricção. Se clínicas pedirem granularidade, criar feature `patient_documents` (migração simples: novo item em `FEATURES`/`ROLE_DEFAULTS` + trocar o wrapper das rotas). |
| 9 | **Retenção clínica fina** (doc vinculado a prontuário não pode ser purgado enquanto correr o prazo CFP). | v1 aproxima por `source != UPLOAD` (nem remove). O vínculo fino (FK para artefato clínico + relógio de retenção) chega com os planos 001/009/010, que são os criadores desses documentos. |
| 10 | **Custos de storage da plataforma** crescem com clínicas grandes. | Quota por plano desde o dia 1 + visibilidade no superadmin; precificar tiers (1 GB Starter / 10 GB Pro — valores finais a confirmar com negócio). |
| 11 | **`list()` do provider em prefixos grandes** (GC de órfãos) pode paginar/custar. | Implementar `list` com paginação por cursor do SDK; GC roda por clínica e é semanal. |
| 12 | **Aberto:** documentos contam na quota enquanto na lixeira — comunicar bem na UI ("dos quais X na lixeira") ou esvaziar lixeira manualmente? | v1: contam (blob ocupa espaço de fato) + botão futuro "Esvaziar lixeira" se houver demanda. |
| 13 | **Aberto:** scan antivírus de uploads (ClamAV/serviço externo)? | Fora do v1; allowlist estrita + nunca executar/renderizar server-side limita a superfície. Reavaliar quando houver portal do paciente (download por terceiros). |
