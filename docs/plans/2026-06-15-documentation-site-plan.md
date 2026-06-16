# Plano do Site de Documentação — Clinica

**Data:** 2026-06-15
**Autor:** Equipe Clinica (lead author)
**Branch:** `market-features`
**Idioma do conteúdo:** Português do Brasil (pt-BR) — primário; inglês (`en`) adicionável incrementalmente
**Commit base (HEAD no momento do plano):** `1d93f26`

> Este plano define o framework, o layout do repositório, o sistema de ligação docs↔código
> (frontmatter + manifesto + script de detecção de defasagem) e o **sitemap completo**
> (todas as áreas e funcionalidades — novas e existentes). É o documento mestre para a
> implementação do site de documentação em `docs-site`.

---

## 1. Escolha do framework

**Framework:** **Fumadocs** (v15+, por `fuma-nama`) como um app **Next.js 16 / App Router** independente.

**Rationale (2-3 linhas):** O produto já é Next.js 16 + React 19; Fumadocs é o único candidato
que é *construído sobre* o App Router, então o site de docs é "só mais um app Next" — implantável
sozinho **ou** montado em `/docs` via `basePath`/multi-zones nativos. Ele entrega de fábrica MDX
com componentes React, busca full-text in-browser (Orama/WASM, sem servidor), i18n com pt-BR como
idioma padrão em URLs limpas e — decisivo para o nosso pipeline — **frontmatter customizado validado
por Zod em build time** (o campo `sources:` falha o build se ausente/malformado). Node 22+ é
obrigatório; nosso ambiente já roda **Node 26**, então atende com folga.

### 1.1 Comandos exatos de scaffold

```bash
# Pré-requisitos: Node 22+ (temos Node 26). Scaffold do app de docs autônomo:
npm create fumadocs-app@latest clinica-docs
#   Quando perguntado:
#     framework      = Next.js
#     content source = Fumadocs MDX
#     incluir exemplo = sim (removemos depois)

cd clinica-docs
npm install
npm run dev   # verificar em http://localhost:3000/docs
```

Após o scaffold, o diretório `clinica-docs/` gerado é **movido/renomeado** para
`docs-site/` dentro do worktree do produto (ver Seção 2). O scaffold é feito fora da árvore
do produto apenas para evitar conflito de `node_modules` durante a geração; o conteúdo final
mora em `/Users/marcus/personal/clinica-market-features/docs-site`.

### 1.2 Configuração de montagem em `/docs` (Multi-Zones — opção preferida)

```ts
// docs-site/next.config.ts (app de docs)
const nextConfig = {
  basePath: "/docs",
  assetPrefix: "/docs",
  reactStrictMode: true,
};
export default nextConfig;
```

```ts
// docs-site/lib/source.ts
import { loader } from "fumadocs-core/source";
import { i18n } from "./i18n";
export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: "/docs",
  i18n,
});
```

```ts
// docs-site/lib/i18n.ts
import { defineI18n } from "fumadocs-core/i18n";
export const i18n = defineI18n({
  defaultLanguage: "pt-BR",
  languages: ["pt-BR", "en"],
  hideLocale: "default-locale", // pt-BR em /docs/..., inglês em /docs/en/...
});
```

```ts
// next.config.ts do PRODUTO (clinica-market-features) — adicionar rewrites:
async rewrites() {
  return [
    { source: "/docs", destination: `${process.env.DOCS_URL}/docs` },
    { source: "/docs/:path*", destination: `${process.env.DOCS_URL}/docs/:path*` },
  ];
}
// Next.js 16: nenhum rewrite extra de assets é necessário (era exigido só pré-15).
// DOCS_URL aponta para o deploy Vercel do app de docs.
```

> O `next.config.ts` do produto hoje usa `withPWA(...)`. A função `rewrites` deve ser
> adicionada **dentro** do objeto `nextConfig` antes do `withPWA(nextConfig)`, e o PWA precisa
> excluir `/docs/*` do precache (workbox `navigateFallbackDenylist: [/^\/docs/]`) para não
> interceptar a zona de docs.

---

## 2. Layout do repositório e deploy

O site de docs é **monorepo leve via npm workspaces**, com o produto na raiz e o app de docs em
`docs-site`. Isso preserva a disciplina de worktree-por-feature da equipe (o app de docs tem seu
próprio `package.json`, `node_modules` e build), sem mover o código do produto.

### 2.1 Estrutura de `docs-site/`

```
clinica-market-features/
├── package.json                # raiz: adicionar "workspaces": ["docs-site"]
├── next.config.ts              # produto: + rewrites /docs → DOCS_URL
├── docs/
│   ├── feature-manifest.yml    # MANIFESTO canônico feature⇄fonte⇄página (raiz, fora do app de docs)
│   ├── plans/2026-06-15-documentation-site-plan.md   # este arquivo
│   └── ...
├── scripts/
│   └── docs/
│       ├── check-drift.mjs     # detecção de defasagem (Node ESM)
│       ├── stamp.mjs           # re-carimbar lastReviewedCommit
│       └── annotate.mjs        # converte drift.json em anotações de PR
├── .github/
│   ├── workflows/docs-drift.yml
│   └── CODEOWNERS              # GERADO a partir do manifesto
└── docs-site/                  # APP NEXT.JS DE DOCS (Fumadocs)
    ├── package.json            # deps próprias (fumadocs-ui, fumadocs-mdx, next, react)
    ├── next.config.ts          # basePath:/docs, assetPrefix:/docs
    ├── source.config.ts        # defineDocs + frontmatterSchema.extend (Zod)
    ├── mdx-components.tsx       # mapa de componentes MDX (+ <Screenshot>)
    ├── middleware.ts           # createI18nMiddleware(i18n)
    ├── CLAUDE.md               # instruções "Editing docs" (ver Seção 3.5)
    ├── lib/
    │   ├── source.ts           # loader({ baseUrl:'/docs', i18n })
    │   └── i18n.ts             # defineI18n pt-BR default
    ├── app/
    │   ├── layout.tsx
    │   ├── [lang]/
    │   │   ├── (home)/page.tsx
    │   │   └── docs/[[...slug]]/page.tsx   # rota catch-all das páginas
    │   └── api/search/route.ts             # Orama (in-browser index)
    ├── content/
    │   └── docs/               # TODO o MDX vive aqui (ver sitemap, Seção 4)
    │       ├── index.mdx
    │       ├── meta.json       # ordem das seções da sidebar
    │       ├── primeiros-passos/
    │       ├── configuracao/
    │       ├── agenda/
    │       ├── pacientes/
    │       ├── prontuario/
    │       ├── ia/
    │       ├── documentos/
    │       ├── financeiro/
    │       ├── fiscal/
    │       ├── notificacoes/
    │       ├── portal/
    │       ├── formularios/
    │       ├── grupos/
    │       ├── teleconsulta/
    │       └── plataforma/
    └── public/
        └── img/                # screenshots e assets
```

### 2.2 Deploy independente

- Projeto Vercel separado (`clinica-docs`) que faz build **apenas** de `docs-site`.
- Build command: `npm --workspace docs-site run build`. Node 22+ (configurar `NODE_VERSION=26`
  ou engine `>=22` no projeto Vercel para alinhar com o ambiente local).
- Índice de busca Orama é gerado em **build time** — nada para provisionar.
- Domínio próprio (ex.: `docs.clinica.app` ou URL gerada pela Vercel). Sem acoplamento ao deploy
  do produto. `DOCS_URL` do produto aponta para esta URL.

### 2.3 Deploy no mesmo domínio (Multi-Zones — Opção A, recomendada)

- Os dois apps deployam e escalam de forma independente; para o usuário final, as docs vivem em
  `https://app.clinica.com/docs`.
- O produto faz **rewrite** de `/docs` e `/docs/:path*` para `DOCS_URL` (Seção 1.2). Como o app de
  docs já usa `basePath:'/docs'` + `assetPrefix:'/docs'`, os assets resolvem corretamente.
- i18n: pt-BR resolve em `/docs/...`; inglês em `/docs/en/...`.

### 2.4 Alternativa (Opção B — single-app basePath)

Se no futuro a equipe quiser um único deploy: copiar `app/`, `content/`, `source.config.ts` e a
rota `[[...slug]]` para dentro do produto sob um segmento `/docs`, mantendo `basePath`/`baseUrl`
em `'/docs'`. Mais simples operacionalmente, mas acopla o deploy das docs ao do produto.
**A Opção A é a default** por isolar build, dependências e cadência de deploy.

---

## 3. Especificação de ligação docs↔código (docs-as-code)

Sistema de duas camadas: **Tier 1 determinístico** (sempre ativo, é a espinha dorsal) e
**Tier 2 semântico opcional** (LLM, apenas advisory sobre as páginas que o Tier 1 já marcou).

### 3.1 Schema de frontmatter das páginas

Cada página `docs-site/content/docs/**/*.mdx` carrega:

```yaml
---
title: Prontuário Eletrônico
description: Registrar, assinar, exportar e corrigir evoluções clínicas
# --- bloco docs-sync ---
feature: prontuario                # obrigatório. UMA chave de docs/feature-manifest.yml
sources:                           # obrigatório, >=1 glob relativo à raiz do repo
  - src/lib/prontuario/**
  - src/app/prontuario/**
  - src/app/api/prontuario/**/route.ts
  - prisma/schema.prisma#ClinicalNote   # opcional: âncora #Symbol (modelo/export)
lastReviewedCommit: 1d93f26        # obrigatório. SHA contra o qual o texto foi revisado
audience: profissional             # admin | profissional | recepcao | paciente | operador-plataforma
reviewedBy: marcus                 # opcional (auditoria estilo CODEOWNERS)
owner: "@clinica/clinical"         # opcional (handle de time para roteamento de PR)
status: published                  # published | draft | needs-review
ignoreDrift: false                 # opcional escape hatch; se true, nunca é marcada
isNew: true                        # opcional. true para funcionalidades de mercado (Grupos 1-6)
---
```

**Schema Zod** (em `docs-site/source.config.ts`, validado no build via Fumadocs
`defineDocs`/`defineCollections` + `frontmatterSchema.extend`):

```ts
import { defineDocs, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

const sha = z.string().regex(/^[0-9a-f]{7,40}$/, "deve ser um SHA git");

export const docs = defineDocs({
  docs: {
    schema: frontmatterSchema.extend({
      feature: z.string().min(1),
      sources: z.array(z.string().min(1)).min(1),
      lastReviewedCommit: sha,
      audience: z.enum([
        "admin", "profissional", "recepcao", "paciente", "operador-plataforma",
      ]),
      reviewedBy: z.string().optional(),
      owner: z.string().optional(),
      status: z.enum(["published", "draft", "needs-review"]).default("published"),
      ignoreDrift: z.boolean().default(false),
      isNew: z.boolean().default(false),
    }),
  },
});
```

**Gramática de âncora** para cada item de `sources` (superset de globs):
`<glob>` | `<path>#<Symbol>` | `<glob>@<sha>`
- `<glob>`: picomatch relativo à raiz do repo (`src/lib/fiscal/**`, `src/app/api/**/route.ts`).
- `#<Symbol>` (opcional): estreita para export/modelo Prisma nomeado (modo Tier-2/AST; o Tier-1
  trata como o caminho puro).
- `@<sha>` (opcional): provenance por item; na ausência, vale o `lastReviewedCommit` da página.

**Regras:** globs POSIX relativos à raiz; `feature` DEVE existir como chave no manifesto;
`lastReviewedCommit` é o carimbo "revisado contra", o que torna a detecção sensível ao tempo.

### 3.2 Formato do manifesto central

Arquivo `docs/feature-manifest.yml` (na raiz do repo, **fora** do app de docs, porque abrange
código e docs). Mapa canônico feature⇄fonte⇄página e índice inverso do script.

```yaml
# docs/feature-manifest.yml — mapa canônico feature ⇄ fonte ⇄ docs.
# Glob: itens mais específicos/posteriores vencem (regra CODEOWNERS). Globs POSIX da raiz.
version: 1
defaults:
  docsRoot: docs-site/content/docs   # onde os caminhos de página abaixo resolvem
  ignoreGlobs:
    - "**/*.test.ts"
    - "**/*.test.tsx"
    - "**/__mocks__/**"
    - "**/*.stories.tsx"

features:
  onboarding-contas:
    title: Onboarding, contas e permissões
    owner: "@clinica/platform"
    sources:
      - src/app/signup/**
      - src/app/login/**
      - src/app/users/**
      - src/app/profile/**
      - src/app/professionals/**
      - src/app/api/auth/**
      - src/app/api/users/**
      - src/app/api/me/**
      - src/lib/auth.ts
      - src/lib/rbac/**
    docs:
      - primeiros-passos/login-e-conta.mdx
      - configuracao/usuarios-e-permissoes.mdx
      - configuracao/meu-perfil.mdx
      - configuracao/profissionais.mdx

  configuracao-clinica:
    title: Configurações da Clínica
    owner: "@clinica/platform"
    sources:
      - src/app/admin/settings/**
      - src/app/api/admin/settings/**
      - src/lib/clinic/**
    docs:
      - configuracao/dados-da-clinica.mdx
      - configuracao/cores-da-agenda.mdx
      - configuracao/configuracoes-financeiras.mdx
      - configuracao/configuracoes-de-email.mdx
      - configuracao/teleconsulta-config.mdx

  agendamento:
    title: Agenda e agendamentos
    owner: "@clinica/scheduling"
    sources:
      - src/app/agenda/**
      - src/app/api/appointments/**
      - src/lib/appointments/**
      - src/lib/professionals/availability.ts
      - src/lib/jobs/send-reminders.ts
      - src/lib/jobs/extend-recurrences.ts
    docs:
      - agenda/visao-geral-agenda.mdx
      - agenda/criar-e-editar-agendamento.mdx
      - agenda/status-e-pendencias.mdx
      - agenda/recorrencias.mdx
      - agenda/conflitos-e-arrastar-soltar.mdx
      - agenda/tarefas.mdx
      - agenda/imprimir-agenda.mdx
      - agenda/disponibilidade.mdx

  calendar-sync:
    title: Sincronização de Agenda (Google/iCal)
    owner: "@clinica/scheduling"
    sources:
      - src/lib/calendar-sync/**
      - src/app/api/calendar-sync/**
      - src/app/profile/components/CalendarSyncSettings.tsx
      - src/app/profile/components/GoogleCalendarCard.tsx
      - src/app/profile/components/IcsFeedCard.tsx
    docs:
      - agenda/sincronizacao-google-ical.mdx

  pacientes:
    title: Pacientes e cadastros
    owner: "@clinica/clinical"
    sources:
      - src/app/patients/**
      - src/app/api/patients/**
      - src/lib/patients/**
      - src/lib/phone/**
    docs:
      - pacientes/cadastro-de-pacientes.mdx
      - pacientes/consentimentos-e-lgpd.mdx
      - pacientes/historico-e-financeiro.mdx
      - pacientes/abas-do-paciente.mdx

  prontuario:
    title: Prontuário Eletrônico
    owner: "@clinica/clinical"
    sources:
      - src/lib/prontuario/**
      - src/app/prontuario/**
      - src/app/api/prontuario/**
    docs:
      - prontuario/prontuario-eletronico.mdx
      - prontuario/busca-e-navegacao.mdx
      - prontuario/exportar-pdf.mdx
      - prontuario/adendos.mdx

  escalas:
    title: Escalas Clínicas (PHQ-9/GAD-7)
    owner: "@clinica/clinical"
    sources:
      - src/lib/scales/**
      - src/app/escala/**
      - src/app/api/patients/[id]/escalas/**
      - src/app/patients/components/escalas/**
    docs:
      - prontuario/escalas-clinicas.mdx

  anexos:
    title: Anexos do Paciente
    owner: "@clinica/clinical"
    sources:
      - src/lib/patient-documents/**
      - src/lib/storage/**
      - src/app/patients/components/documents/**
      - src/app/api/patients/[id]/documents/**
    docs:
      - pacientes/anexos-do-paciente.mdx

  ia:
    title: Recursos de IA
    owner: "@clinica/clinical"
    sources:
      - src/lib/ai/**
      - src/app/api/ai/**
      - src/app/prontuario/components/ai/**
      - src/app/admin/settings/components/AiSettingsTab.tsx
      - src/app/admin/settings/components/AiDisclosureDialog.tsx
    docs:
      - ia/assistente-de-evolucoes.mdx
      - ia/creditos-e-feedback.mdx
      - ia/configuracao-de-ia.mdx

  documentos:
    title: Documentos CFP
    owner: "@clinica/clinical"
    sources:
      - src/lib/documents/**
      - src/shared/components/documents/**
      - src/app/api/documents/**
      - src/app/patients/components/DocumentsTab.tsx
      - src/app/admin/settings/components/DocumentTemplatesSection.tsx
      - src/app/admin/settings/components/TemplateEditorSheet.tsx
    docs:
      - documentos/gerar-documentos-cfp.mdx
      - documentos/enviar-documentos.mdx
      - documentos/templates-de-documentos.mdx

  assinaturas:
    title: Assinatura Eletrônica
    owner: "@clinica/clinical"
    sources:
      - src/lib/assinaturas/**
      - src/app/assinar/**
      - src/app/verificar/**
      - src/app/api/assinaturas/**
      - src/app/api/public/assinaturas/**
      - src/lib/jobs/signature-reminders.ts
    docs:
      - documentos/assinatura-eletronica.mdx
      - documentos/verificar-autenticidade.mdx

  financeiro:
    title: Financeiro e faturamento
    owner: "@clinica/finance"
    sources:
      - src/app/financeiro/**
      - src/app/api/financeiro/**
      - src/lib/financeiro/**
      - src/lib/cobranca/**
      - src/lib/expenses/**
      - src/lib/cashflow/**
      - src/lib/expense-matcher/**
      - src/lib/bank-reconciliation/**
      - src/lib/bank-statement-parser/**
    docs:
      - financeiro/dashboard-financeiro.mdx
      - financeiro/faturas.mdx
      - financeiro/creditos-de-sessao.mdx
      - financeiro/tabela-de-precos.mdx
      - financeiro/repasse.mdx
      - financeiro/cobranca-stripe.mdx
      - financeiro/fluxo-de-caixa.mdx
      - financeiro/despesas.mdx
      - financeiro/conciliacao-bancaria.mdx

  fiscal:
    title: Fiscal (NFS-e, Receita Saúde, DMED)
    owner: "@clinica/finance"
    sources:
      - src/lib/nfse/**
      - src/lib/fiscal/**
      - src/app/financeiro/receita-saude/**
      - src/app/financeiro/dmed/**
      - src/app/financeiro/faturas/[id]/Nfse*
      - src/app/api/financeiro/faturas/[id]/nfse/**
      - src/app/api/financeiro/fiscal/**
      - src/app/admin/settings/components/NfseConfig*
      - src/app/admin/settings/components/FiscalConfigTab.tsx
    docs:
      - fiscal/configuracao-fiscal.mdx
      - fiscal/nfse.mdx
      - fiscal/receita-saude.mdx
      - fiscal/dmed.mdx

  notificacoes:
    title: Notificações e lembretes
    owner: "@clinica/platform"
    sources:
      - src/lib/notifications/**
      - src/app/admin/settings/notifications/**
      - src/app/api/admin/notification-templates/**
    docs:
      - notificacoes/notificacoes-e-lembretes.mdx
      - configuracao/templates-de-notificacao.mdx

  portal-paciente:
    title: Portal do Paciente e agendamento online
    owner: "@clinica/scheduling"
    sources:
      - src/lib/booking/**
      - src/lib/patient-portal/**
      - src/app/agendar/**
      - src/app/paciente/**
      - src/app/api/public/booking/**
      - src/app/api/public/portal/**
      - src/app/admin/settings/agendamento-online/**
      - src/app/admin/settings/components/PortalTab.tsx
    docs:
      - portal/agendamento-online.mdx
      - portal/configurar-agendamento-online.mdx
      - portal/portal-do-paciente.mdx
      - portal/solicitacoes-de-agendamento.mdx

  lista-espera:
    title: Lista de Espera
    owner: "@clinica/scheduling"
    sources:
      - src/lib/waitlist/**
      - src/app/espera/**
      - src/app/oferta/**
      - src/app/api/waitlist/**
      - src/app/api/public/waitlist/**
      - src/app/admin/settings/components/WaitlistTab.tsx
    docs:
      - portal/lista-de-espera.mdx

  formularios:
    title: Formulários e intake
    owner: "@clinica/clinical"
    sources:
      - src/lib/forms/**
      - src/lib/intake/**
      - src/app/formularios/**
      - src/app/f/**
      - src/app/intake/**
      - src/app/api/forms/**
      - src/app/api/intake-submissions/**
      - src/app/api/public/intake/**
      - src/app/patients/components/IntakeSubmission*
    docs:
      - formularios/construtor-de-formularios.mdx
      - formularios/enviar-e-responder.mdx
      - formularios/fichas-de-cadastro.mdx

  grupos:
    title: Grupos terapêuticos
    owner: "@clinica/clinical"
    sources:
      - src/lib/groups/**
      - src/app/groups/**
      - src/app/api/groups/**
      - src/app/api/group-sessions/**
      - src/app/agenda/components/group-session/**
      - src/app/agenda/components/CreateGroupSessionSheet.tsx
      - src/app/agenda/components/GroupSessionSheet.tsx
    docs:
      - grupos/grupos-terapeuticos.mdx
      - grupos/sessoes-de-grupo.mdx

  teleconsulta:
    title: Teleconsulta (telessaúde)
    owner: "@clinica/scheduling"
    sources:
      - src/lib/telehealth/**
      - src/app/teleconsulta/**
      - src/app/api/appointments/[id]/teleconsulta/**
      - src/app/api/public/teleconsulta/**
      - src/shared/components/telehealth/**
      - src/app/agenda/components/Teleconsulta*
    docs:
      - teleconsulta/teleconsulta.mdx
      - teleconsulta/acesso-do-paciente.mdx

  relatorios:
    title: Relatórios e dashboard operacional
    owner: "@clinica/platform"
    sources:
      - src/lib/analytics/**
      - src/app/relatorios/**
    docs:
      - financeiro/relatorios-operacionais.mdx

  superadmin:
    title: Superadmin (administração da plataforma)
    owner: "@clinica/platform"
    sources:
      - src/app/superadmin/**
      - src/app/api/superadmin/**
      - src/lib/superadmin-auth.ts
      - src/lib/api/with-superadmin.ts
      - src/lib/subscription/**
    docs:
      - plataforma/superadmin.mdx
      - plataforma/planos-e-assinaturas.mdx
      - plataforma/monitoramento-de-ia.mdx
```

**O manifesto serve três consumidores a partir de um arquivo:**
1. O script de drift constrói um índice inverso: glob → `{feature, docs[]}`.
2. É o contrato do campo `feature` do frontmatter (todo `feature` deve ser chave aqui, e o
   caminho da página deve constar em `docs:` daquela feature — consistência bidirecional).
3. `.github/CODEOWNERS` é **gerado** de `features.*.owner` + `sources`, então roteamento de
   review e de docs nunca divergem.

**Invariante de consistência (assertada no CI):** para cada página, `frontmatter.feature`
existe no manifesto E o caminho da página está listado em `docs:` daquela feature; para cada
`(feature, docPage)` no manifesto, o arquivo existe e seu frontmatter aponta de volta. Pega
"adicionei página mas esqueci o manifesto" e "renomeei pasta de fonte mas esqueci a página".

### 3.3 Script de detecção de defasagem (stale detection)

**Arquivo:** `scripts/docs/check-drift.mjs` — Node ESM (Node 26, sem transpile). Rodado por CI,
pelo git hook e pelo Claude.

```
node scripts/docs/check-drift.mjs --base origin/main --head HEAD [--json] [--strict] [--ai-list] [--cached]
```

- `--base`/`--head`: refs para `git diff --name-only --diff-filter=ACMR <base>..<head>`
  (ACMR = added/copied/modified/renamed; deletes tratados à parte para que fonte removida
  também apareça). Defaults: base=`origin/main` (CI) ou conjunto staged (`--cached`) no hook.
- Lê: `docs/feature-manifest.yml`, frontmatter de todo `docs-site/content/docs/**/*.mdx`
  (via `gray-matter`), e o `lastReviewedCommit` por página.

**Algoritmo:**
1. Carrega manifesto + frontmatter de todas as páginas; constrói o índice inverso e **asserta a
   invariante** (falha rápido com exit 2 se o mapa estiver quebrado).
2. `changed = git diff --name-only <base>..<head>` (normalizado POSIX, relativo à raiz). Descarta
   caminhos em `defaults.ignoreGlobs` e qualquer caminho dentro de `docs-site/` (edição só de docs
   não torna código defasado).
3. Para cada página, compila os globs efetivos (página `sources` ∪ `sources` da feature no
   manifesto) em matchers picomatch (`picomatch(glob, { dot: true })`). Página é **candidata** se
   algum matcher casa com algum caminho alterado.
4. **Sensibilidade ao tempo** (o check "revisado contra commit"): candidata é **STALE** só se ao
   menos um arquivo casado mudou num commit que NÃO é ancestral do `lastReviewedCommit` da página.
   Implementado como `git rev-list --count <lastReviewedCommit>..<head> -- <matchedFile> > 0`.
   Se `ignoreDrift:true` ou `lastReviewedCommit === head` após refresh, está limpo.
5. (Precisão `#Symbol` opcional, Tier-2): para itens com `#Symbol`, fingerprint AST (`git show
   <sha>:<file>` vs atual; hash só daquele símbolo) e rebaixa para não-stale se só mudou
   formatação. O Tier-1 funciona sem isso.

**Saídas:**
- Humano (default): tabela — `STALE  prontuario/prontuario-eletronico.mdx  ← src/lib/prontuario/list.ts (mudou em 3 commits desde 1d93f26)`.
- `--json`: `{ "stale": [{ "page", "feature", "owner", "matchedChanges":[...], "lastReviewedCommit", "headCommit" }], "ok":[...], "errors":[...] }` — consumido por `annotate.mjs` e pelo Claude.
- `--ai-list`: caminhos absolutos das páginas stale + suas fontes casadas, em linhas separadas, formatado para o Claude ler e agir.
- **Exit codes:** `0` = sem drift; `1` = páginas stale (só falha o build com `--strict`);
  `2` = erro de consistência do manifesto/frontmatter (sempre fatal).

**Caminho de refresh (re-stamp):** `scripts/docs/stamp.mjs --page <path> [--commit HEAD]`
reescreve `lastReviewedCommit` no frontmatter (equivalente ao `drift link`). Atualizar a prosa
**E** rodar `stamp` é o que limpa a falha de CI — a revisão é forçada, não auto-silenciada.

### 3.4 Integração CI / hook

**GitHub Actions — `.github/workflows/docs-drift.yml` (check obrigatório em PRs):**

```yaml
name: docs-drift
on: pull_request
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }          # histórico completo para rev-list/show
      - uses: actions/setup-node@v4
        with: { node-version: 26 }
      - run: npm ci
      - name: Detectar defasagem de docs
        run: node scripts/docs/check-drift.mjs --base origin/${{ github.base_ref }} --head HEAD --strict --json > drift.json || echo "drift=1" >> $GITHUB_ENV
      - name: Anotar PR
        if: always()
        run: node scripts/docs/annotate.mjs drift.json   # emite ::warning file=... e/ou comentário fixo
      # Exit 2 (mapa quebrado) sempre falha; exit 1 (stale) falha só com --strict.
```

- O `annotate.mjs` transforma `drift.json` em anotações `::warning file=...` nas páginas MDX stale
  e um comentário fixo (sticky) listando cada página, sua feature, owner e os arquivos alterados.
  Adicionar como required check na branch protection.
- **Tier 2 (opcional):** segundo job com `anthropics/claude-code-action` recebe `drift.json`, abre
  só as páginas marcadas + o diff e propõe a edição (padrão Dosu/doc-drift, mas escopado às
  marcações do Tier-1 para o LLM nunca varrer toda a árvore).
- **Escape hatch:** label `docs:deferred` no PR ou linha `Docs-Drift-Ack: <motivo>` no corpo do PR
  rebaixa exit 1 para advisory (registrado no comentário) — correções urgentes não ficam bloqueadas.

**Git hook — `.husky/pre-push` (advisory, nunca bloqueia commit, só avisa antes de compartilhar):**

```sh
node scripts/docs/check-drift.mjs --base origin/main --head HEAD || true
```

Opcionalmente um `pre-commit` com `--cached`. Hooks locais são advisory; o CI é o gate.
Também é possível dobrar uma chamada não-strict de `check-drift.mjs` no pipeline `vercel-build`
para um resumo de drift no build, sem bloquear o deploy.

### 3.5 Texto de instrução para CLAUDE.md

**Adicionar ao `CLAUDE.md` do PRODUTO (raiz):**

```markdown
## Docs ficam em sincronia com o código
- As docs vivem em `docs-site/content/docs/**/*.mdx`. Cada página declara `sources:` (globs) +
  `feature:` + `lastReviewedCommit:` no frontmatter; o mapa feature⇄fonte⇄página é
  `docs/feature-manifest.yml`.
- ANTES de finalizar qualquer mudança no código do produto, rode:
  `node scripts/docs/check-drift.mjs --base origin/main --head HEAD --ai-list`
  Trate a saída como checklist: ela imprime exatamente quais páginas seus arquivos tornaram stale.
- Para CADA página stale: abra-a, atualize a prosa para refletir o novo comportamento, e re-carimbe
  com `node scripts/docs/stamp.mjs --page <path> --commit HEAD`. Nunca edite `lastReviewedCommit`
  à mão nem o avance sem revisar/atualizar a prosa — o carimbo afirma "li esta mudança contra esta doc".
- Se uma mudança genuinamente não afeta o conteúdo da página, ainda assim re-carimbe (registra que
  você revisou). Use `ignoreDrift: true` só para arquivos intencionalmente não documentados (testes,
  mocks) — prefira ajustar `ignoreGlobs` no manifesto.
- Se adicionar/renomear pasta de fonte ou adicionar página de doc, ATUALIZE `docs/feature-manifest.yml`
  na mesma mudança — o script falha o CI (exit 2) se o mapa e o frontmatter discordarem.
- Ao tocar arquivos sob qualquer `sources:` do manifesto, você está editando uma feature documentada:
  assuma que uma página precisa de atualização até o check-drift dizer o contrário.
```

**Adicionar ao `docs-site/CLAUDE.md`:**

```markdown
## Editando docs
- Toda página precisa de frontmatter válido: `feature`, `sources` (>=1 glob), `lastReviewedCommit`,
  `audience`. O build (Fumadocs `defineDocs` + Zod) FALHA se algum estiver ausente/malformado — não os remova.
- O `feature` da página deve ser chave em `docs/feature-manifest.yml` e a página deve constar em
  `docs:` daquela feature. Mantenha os dois lados em sincronia.
- Depois de escrever prosa que reflete o código atual, ajuste `lastReviewedCommit` para o commit
  contra o qual revisou (use `scripts/docs/stamp.mjs`).
- Conteúdo em pt-BR por padrão (`page.mdx`); traduções em inglês são `page.en.mdx`.
- Datas DD/MM/AAAA, horas HH:mm 24h, moeda R$ — siga a localização do produto.
```

**Modelo mental para o Claude:** `check-drift.mjs` é o gatilho — converte um diff de código em
uma lista concreta de TODOs de páginas stale, então o Claude nunca precisa adivinhar quais docs
foram afetadas.

---

## 4. Sitemap completo

Ordem das seções: **Primeiros passos** → **Configuração inicial** → uma seção por área da feature
(novas e existentes). Páginas marcadas **[NOVA]** documentam funcionalidades de mercado (Grupos 1-6).

Audiências: `admin`, `profissional`, `recepcao`, `paciente`, `operador-plataforma`.

### Seção: Primeiros passos
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `primeiros-passos/o-que-e-o-clinica` | O que é o Clinica | admin | `src/app/landing/**` | Visão geral do produto, módulos, modelo multi-tenant e para quem serve. |
| `primeiros-passos/criar-conta-da-clinica` | Criar a conta da clínica | admin | `src/app/signup/**`, `src/app/api/public/signup/**` | Inscrição inicial em /signup: cria clínica, usuário ADMIN e perfil profissional. |
| `primeiros-passos/login-e-conta` | Entrar e acessar o sistema | admin | `src/app/login/**`, `src/lib/auth.ts`, `src/app/api/auth/**` | Login por credenciais, sessão multi-tenant, recuperação de acesso, logout. |
| `primeiros-passos/visao-geral-do-painel` | Visão geral do painel e navegação | profissional | `src/app/agenda/**`, `src/app/hooks/**` | Tour do menu lateral/bottom nav, dashboard inicial e como abrir Configurações. |
| `primeiros-passos/papeis-e-permissoes` | Papéis e permissões (ADMIN x PROFISSIONAL) | admin | `src/lib/rbac/**` | Os dois papéis, escopo de acesso e por que ADMIN não vê prontuário. |

### Seção: Configuração inicial
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `configuracao/dados-da-clinica` | Dados gerais da clínica | admin | `src/app/admin/settings/components/GeneralTab.tsx`, `src/lib/clinic/**` | Nome, slug, contato, endereço, fuso horário e logo; link da ficha de cadastro. |
| `configuracao/usuarios-e-permissoes` | Usuários e permissões | admin | `src/app/users/**`, `src/app/api/users/**`, `src/lib/rbac/**` | Criar/editar/desativar usuários; overrides de permissão por usuário por feature. **[NOVA: overrides por usuário]** |
| `configuracao/meu-perfil` | Meu perfil | profissional | `src/app/profile/**`, `src/app/api/me/**` | Editar dados pessoais/profissionais, duração padrão de sessão e opt-out de IA. |
| `configuracao/profissionais` | Cadastro de profissionais | admin | `src/app/professionals/**`, `src/app/admin/settings/agendamento-online/components/ProfessionalBookingTable.tsx`, `src/app/api/professionals/**` | Criar perfis, especialidade, registro, buffers, regime fiscal e settings de agendamento. |
| `configuracao/disponibilidade` | Disponibilidade do profissional | profissional | `src/lib/professionals/availability.ts`, `src/app/settings/**` | Regras semanais + exceções (férias/folgas) que alimentam slots de agendamento. |
| `configuracao/cores-da-agenda` | Cores da agenda | admin | `src/app/admin/settings/components/AgendaColorsTab.tsx`, `src/lib/clinic/**` | Personalizar cores por tipo de evento; paletas e restaurar padrão. |
| `configuracao/configuracoes-financeiras` | Configurações financeiras | admin | `src/app/admin/settings/components/BillingTab.tsx`, `src/lib/financeiro/invoice-template.ts` | Vencimento, modo de cobrança, agrupamento, imposto, template e dados de pagamento. |
| `configuracao/configuracoes-de-email` | Configurações de e-mail | admin | `src/app/admin/settings/components/EmailTab.tsx`, `src/lib/notifications/**` | Remetente, endereço de envio (Resend), BCC e acesso aos templates. |
| `configuracao/templates-de-notificacao` | Templates de notificação | admin | `src/app/admin/settings/notifications/**`, `src/app/api/admin/notification-templates/**`, `src/lib/notifications/templates.ts` | Personalizar mensagens WhatsApp/Email com variáveis, preview e restaurar. |
| `configuracao/teleconsulta-config` | Habilitar teleconsulta | admin | `src/app/admin/settings/components/SchedulingTab.tsx`, `src/lib/telehealth/**` | Flag por clínica; depende de TELEHEALTH_JITSI_DOMAIN no servidor. **[NOVA]** |
| `configuracao/armazenamento` | Armazenamento e cotas | admin | `src/app/admin/settings/components/StorageUsageCard.tsx`, `src/lib/storage/**` | Monitorar uso/lixeira; restringir exames a profissionais; cota por plano. **[NOVA]** |
| `configuracao/configuracoes-de-prontuario` | Configurações de prontuário | admin | `src/app/admin/settings/components/ProntuarioTab.tsx`, `src/lib/prontuario/retention.ts` | Prazo de guarda, responsável por prontuários de inativos, mensagem de risco. **[NOVA]** |

### Seção: Agenda e agendamentos
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `agenda/visao-geral-agenda` | Visão geral da agenda (diária e semanal) | profissional | `src/app/agenda/page.tsx`, `src/app/agenda/weekly/**`, `src/app/agenda/components/**` | Timeline diária, grade semanal, tipos de evento e seleção de profissional. |
| `agenda/criar-e-editar-agendamento` | Criar e editar agendamentos | profissional | `src/app/agenda/components/CreateAppointmentSheet.tsx`, `src/app/agenda/components/AppointmentEditor.tsx`, `src/app/api/appointments/**` | Criar por paciente/tipo/modalidade; editar horário, notas, preço; histórico. |
| `agenda/status-e-pendencias` | Status e pendências | profissional | `src/lib/appointments/status-transitions.ts`, `src/app/agenda/pendencias/**`, `src/app/agenda/components/CancelConfirmDialog.tsx` | Workflow AGENDADO→CONFIRMADO→FINALIZADO, cancelamentos e ações em massa. |
| `agenda/recorrencias` | Agendamentos recorrentes | profissional | `src/lib/appointments/recurrence.ts`, `src/lib/appointments/recurrence-slots.ts`, `src/lib/appointments/biweekly.ts`, `src/app/agenda/recorrencias/**`, `src/lib/jobs/extend-recurrences.ts` | Semanal/quinzenal/mensal, exceções e quinzenal com alternância de paciente. **[NOVA]** |
| `agenda/conflitos-e-arrastar-soltar` | Conflitos e arrastar-e-soltar | profissional | `src/lib/appointments/conflict-check.ts`, `src/lib/appointments/drag-constraints.ts`, `src/app/agenda/components/SlotMatchesDialog.tsx` | Detecção de conflito com buffers; reagendar por drag-and-drop com sugestões. |
| `agenda/tarefas` | Tarefas (TODOs do profissional) | profissional | `src/lib/todos/**`, `src/app/agenda/components/todos/**`, `src/app/tarefas/**` | Tarefas datadas sem paciente, recorrência e geração a partir de notas pendentes. **[NOVA]** |
| `agenda/imprimir-agenda` | Imprimir a agenda | recepcao | `src/app/agenda/components/AgendaPrintView.tsx`, `src/app/agenda/components/DailyPrintGrid.tsx`, `src/app/agenda/components/WeeklyPrintGrid.tsx` | Layouts de impressão diário/semanal e exportar para PDF. |
| `agenda/disponibilidade` | Disponibilidade que alimenta a agenda | profissional | `src/lib/professionals/availability.ts`, `src/app/settings/**` | Como regras e exceções definem os slots livres na agenda e no agendamento online. |
| `agenda/lembretes-automaticos` | Lembretes automáticos de sessão | recepcao | `src/lib/jobs/send-reminders.ts`, `src/lib/appointments/appointment-links.ts` | Lembretes em horários configuráveis com links HMAC de confirmar/cancelar. **[NOVA]** |
| `agenda/sincronizacao-google-ical` | Sincronizar com Google Agenda / iCal | profissional | `src/lib/calendar-sync/**`, `src/app/api/calendar-sync/**`, `src/app/profile/components/CalendarSyncSettings.tsx` | OAuth Google bidirecional e feed iCal público; tratamento de erros de sync. **[NOVA]** |

### Seção: Pacientes
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `pacientes/cadastro-de-pacientes` | Cadastro e gestão de pacientes | recepcao | `src/app/patients/**`, `src/app/api/patients/**`, `src/lib/patients/**`, `src/lib/phone/**` | Criar/editar/visualizar, múltiplos telefones, pagadores habituais e desativação. |
| `pacientes/consentimentos-e-lgpd` | Consentimentos e LGPD | recepcao | `src/app/patients/components/PatientDetailsView.tsx`, `src/app/patients/components/PatientForm.tsx` | Status de consentimento WhatsApp/Email com datas, projeto terapêutico, referência. |
| `pacientes/historico-e-financeiro` | Histórico de atendimentos e taxa de sessão | profissional | `src/app/patients/components/AppointmentHistorySection.tsx`, `src/app/patients/components/PatientFinanceTab.tsx` | Histórico paginado, taxa de sessão e profissional de referência. |
| `pacientes/abas-do-paciente` | Abas e deep-links do paciente | profissional | `src/app/patients/components/PatientDetailsView.tsx`, `src/app/patients/page.tsx` | As 8 abas, deep-links `?id=&tab=` e abas de página (Pacientes/Fichas/Solicitações). **[NOVA]** |
| `pacientes/anexos-do-paciente` | Anexos do paciente | profissional | `src/lib/patient-documents/**`, `src/lib/storage/**`, `src/app/patients/components/documents/**`, `src/app/api/patients/[id]/documents/**` | Upload, categorizar, buscar, pré-visualizar, lixeira/restaurar e cota de armazenamento. **[NOVA]** |
| `pacientes/solicitacoes-do-portal` | Solicitações do portal do paciente | recepcao | `src/lib/patient-portal/**`, `src/app/patients/components/PortalRequestsTable.tsx`, `src/app/api/public/portal/**` | Tratar pedidos de reagendamento, alteração de dados e export LGPD do portal. **[NOVA]** |

### Seção: Prontuário
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `prontuario/prontuario-eletronico` | Prontuário eletrônico | profissional | `src/lib/prontuario/**`, `src/app/prontuario/[id]/**`, `src/app/api/prontuario/notes/**` | Registrar evolução (SOAP/DAP/Livre), autosave, assinar e tornar imutável. **[NOVA]** |
| `prontuario/busca-e-navegacao` | Buscar e navegar o prontuário | profissional | `src/app/prontuario/page.tsx`, `src/app/prontuario/components/ProntuarioBrowser.tsx`, `src/app/api/prontuario/notes/**`, `src/app/api/prontuario/pending/**` | Filtrar por Pendentes/Rascunhos/Assinadas, buscar por nome e paginar. **[NOVA]** |
| `prontuario/exportar-pdf` | Exportar prontuário em PDF | profissional | `src/lib/prontuario/record-export.ts`, `src/app/api/prontuario/record/[patientId]/pdf/**`, `src/app/patients/components/prontuario/ProntuarioTab.tsx` | Exportar notas assinadas com cabeçalho, adendos, assinaturas e hash. **[NOVA]** |
| `prontuario/adendos` | Adendos (correções de nota assinada) | profissional | `src/lib/prontuario/immutability.ts`, `src/app/prontuario/components/AddendumList.tsx`, `src/app/api/prontuario/notes/[id]/addenda/**` | Adicionar correções imutáveis e datadas a notas já assinadas. **[NOVA]** |
| `prontuario/escalas-clinicas` | Escalas clínicas (PHQ-9 / GAD-7) | profissional | `src/lib/scales/**`, `src/app/escala/**`, `src/app/api/patients/[id]/escalas/**`, `src/app/patients/components/escalas/**` | Enviar/preencher escalas, cálculo de score, faixa de risco e trajetória. **[NOVA]** |

### Seção: Recursos de IA
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `ia/assistente-de-evolucoes` | Assistente de IA para evoluções | profissional | `src/lib/ai/**`, `src/app/api/ai/note-draft/**`, `src/app/prontuario/components/ai/AiDraftPanel.tsx` | Gerar rascunho a partir de tópicos, pseudonimização, abordagem e contexto histórico. **[NOVA]** |
| `ia/creditos-e-feedback` | Créditos, feedback e revisão de IA | profissional | `src/app/prontuario/components/ai/AiCreditsBadge.tsx`, `src/app/prontuario/components/ai/AiFeedbackButtons.tsx`, `src/app/prontuario/components/ai/AiReviewBanner.tsx`, `src/app/api/ai/usage/**` | Contador mensal de créditos, feedback 👍/👎 e banners de revisão CFP 11/2018. **[NOVA]** |
| `ia/configuracao-de-ia` | Configurar IA na clínica e opt-out | admin | `src/app/admin/settings/components/AiSettingsTab.tsx`, `src/app/admin/settings/components/AiDisclosureDialog.tsx`, `src/app/profile/page.tsx` | Habilitar IA, aceitar termos LGPD, contexto histórico e opt-out individual. **[NOVA]** |

### Seção: Documentos e assinaturas
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `documentos/gerar-documentos-cfp` | Gerar documentos CFP | profissional | `src/lib/documents/**`, `src/shared/components/documents/**`, `src/app/api/documents/generate/**`, `src/app/api/documents/preview/**`, `src/app/patients/components/DocumentsTab.tsx` | Wizard de tipos CFP, merge de dados, preview, checklist de pendências e PDF. **[NOVA]** |
| `documentos/enviar-documentos` | Enviar documentos (e-mail/WhatsApp) | recepcao | `src/shared/components/documents/SendDocumentDialog.tsx`, `src/app/api/documents/[id]/send/**`, `src/app/api/documents/recibo-items/**` | Enviar por e-mail (anexo) ou WhatsApp (link HMAC 7 dias); recibos por período. **[NOVA]** |
| `documentos/templates-de-documentos` | Templates de documentos | admin | `src/app/admin/settings/components/DocumentTemplatesSection.tsx`, `src/app/admin/settings/components/TemplateEditorSheet.tsx`, `src/lib/documents/seed-templates.ts`, `src/app/api/documents/templates/**` | Duplicar modelos do sistema, editar placeholders e restringir docs clínicos. **[NOVA]** |
| `documentos/assinatura-eletronica` | Assinatura eletrônica de TCLE/contratos | admin | `src/lib/assinaturas/**`, `src/app/assinar/**`, `src/app/api/assinaturas/**`, `src/app/api/public/assinaturas/**`, `src/lib/jobs/signature-reminders.ts` | Envelope OTP, trilha de evidências, ICP-Brasil opcional, sync LGPD, lembretes. **[NOVA]** |
| `documentos/verificar-autenticidade` | Verificar autenticidade de documentos | paciente | `src/app/verificar/**`, `src/lib/assinaturas/verification-code.ts`, `src/app/api/public/assinaturas/verification/**` | Verificação pública por código, validação de hash SHA-256 e aviso CFP 09/2024. **[NOVA]** |

### Seção: Financeiro e faturamento
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `financeiro/dashboard-financeiro` | Dashboard financeiro | admin | `src/app/financeiro/page.tsx`, `src/app/financeiro/components/**`, `src/lib/financeiro/dashboard-aggregation.ts`, `src/app/api/financeiro/dashboard/**` | Resumo, cobrança, atendimento e análise; filtros por período. **[NOVA]** |
| `financeiro/faturas` | Gerenciamento de faturas | admin | `src/app/financeiro/faturas/**`, `src/lib/financeiro/generate-monthly-invoice.ts`, `src/lib/financeiro/generate-per-session-invoices.ts`, `src/app/api/financeiro/faturas/**` | Gerar/editar/cancelar, status, recalcular, enviar, PDF/ZIP e agrupamento. **[NOVA]** |
| `financeiro/creditos-de-sessao` | Créditos de sessão | admin | `src/app/financeiro/creditos/**`, `src/lib/financeiro/credit-eligibility.ts`, `src/app/api/financeiro/creditos/**` | Créditos de cancelamentos acordados, disponibilidade e consumo em faturas. **[NOVA]** |
| `financeiro/tabela-de-precos` | Tabela de preços | admin | `src/app/financeiro/precos/**`, `src/lib/financeiro/billing-labels.ts` | Valores de sessão por paciente, edição em lote e modos de faturamento. **[NOVA]** |
| `financeiro/repasse` | Repasse a profissionais | admin | `src/app/financeiro/repasse/**`, `src/lib/financeiro/repasse.ts`, `src/app/api/financeiro/repasse/**` | Cálculo mensal, impostos, líquido, marcar pago e detalhamento por profissional. **[NOVA]** |
| `financeiro/cobranca-stripe` | Cobrança integrada (Stripe) | admin | `src/lib/cobranca/**`, `src/app/financeiro/faturas/components/CobrarModal.tsx`, `src/app/financeiro/faturas/components/ChargeHistory.tsx`, `src/app/api/financeiro/faturas/[id]/cobranca/**` | Links Pix/cartão via Stripe Connect, régua de dunning e histórico de cobrança. **[NOVA]** |
| `financeiro/fluxo-de-caixa` | Fluxo de caixa | admin | `src/app/financeiro/fluxo-de-caixa/**`, `src/lib/cashflow/**`, `src/app/api/financeiro/cashflow/**` | Realizado x projetado, gráfico/tabela, granularidade e estimativa de impostos. **[NOVA]** |
| `financeiro/despesas` | Despesas e contas a pagar | admin | `src/app/financeiro/despesas/**`, `src/lib/expenses/**`, `src/app/api/financeiro/despesas/**` | Criar/categorizar/pagar despesas, categorias, recorrentes e import OFX/CSV. **[NOVA]** |
| `financeiro/conciliacao-bancaria` | Conciliação bancária e integração Inter | admin | `src/lib/bank-reconciliation/**`, `src/lib/expense-matcher/**`, `src/lib/bank-statement-parser/**`, `src/app/financeiro/conciliacao/**`, `src/app/financeiro/despesas/inter/**`, `src/app/api/financeiro/conciliacao/**` | Importar transações, matching com faturas/Stripe, reembolsos e Inter. **[NOVA]** |
| `financeiro/relatorios-operacionais` | Relatórios e dashboard operacional | admin | `src/lib/analytics/**`, `src/app/relatorios/**` | Ocupação, retenção, faltas e desempenho por profissional; escopo por papel. **[NOVA]** |

### Seção: Fiscal (NFS-e, Receita Saúde, DMED)
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `fiscal/configuracao-fiscal` | Configuração fiscal (NFS-e e DMED) | admin | `src/app/admin/settings/components/NfseConfigForm.tsx`, `src/app/admin/settings/components/NfseConfigFields.tsx`, `src/app/admin/settings/components/FiscalConfigTab.tsx`, `src/lib/nfse/validation.ts`, `src/app/api/admin/settings/nfse/**`, `src/app/api/financeiro/fiscal/config/**` | Certificado A1, dados municipais, regime tributário, ISS e dados DMED/CNPJ. **[NOVA]** |
| `fiscal/nfse` | Emissão de NFS-e | admin | `src/lib/nfse/**`, `src/app/financeiro/faturas/[id]/Nfse*`, `src/app/financeiro/faturas/NfseEmitWrapper.tsx`, `src/app/api/financeiro/faturas/[id]/nfse/**` | Emitir por fatura/item, DANFSE/XML, cancelar, e-mail, marcar externa, histórico, download em massa. **[NOVA]** |
| `fiscal/receita-saude` | Receita Saúde (recibos PF) | admin | `src/lib/fiscal/recibo-validation.ts`, `src/lib/fiscal/recibo-file-builder.ts`, `src/lib/fiscal/recibo-result-parser.ts`, `src/app/financeiro/receita-saude/**`, `src/app/api/financeiro/fiscal/receita-saude/**` | Lote TXT por profissional PF, bloqueadores com "Corrigir cadastro" e upload de retorno. **[NOVA]** |
| `fiscal/dmed` | DMED (declaração anual PJ) | admin | `src/lib/fiscal/dmed-aggregation.ts`, `src/lib/fiscal/dmed-file-builder.ts`, `src/lib/fiscal/dmed-csv.ts`, `src/app/financeiro/dmed/**`, `src/app/api/financeiro/fiscal/dmed/**` | Conferência por CPF do pagador por ano, divergências e download TXT/CSV. **[NOVA]** |

### Seção: Notificações e lembretes
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `notificacoes/notificacoes-e-lembretes` | Notificações e lembretes | admin | `src/lib/notifications/**`, `src/app/api/jobs/send-reminders/**` | Canais (Resend/WhatsApp mock), tipos de notificação, retry, LGPD e gate por clínica. |

### Seção: Portal do paciente e agendamento online
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `portal/agendamento-online` | Agendamento online público | paciente | `src/lib/booking/**`, `src/app/agendar/**`, `src/app/api/public/booking/**` | Fluxo público sem login: escolher profissional, slot e dados; auto-confirm ou aprovação. **[NOVA]** |
| `portal/configurar-agendamento-online` | Configurar agendamento online | admin | `src/app/admin/settings/agendamento-online/**`, `src/app/api/clinic/booking-settings/**` | Modo de confirmação, duração, antecedência, modalidades, slugs e bloqueio de telefones. **[NOVA]** |
| `portal/portal-do-paciente` | Portal do paciente (área do paciente) | paciente | `src/lib/patient-portal/**`, `src/app/paciente/**`, `src/app/api/public/portal/**` | Login OTP, próximas sessões, histórico, faturas/recibos, dados e consentimentos. **[NOVA]** |
| `portal/solicitacoes-de-agendamento` | Aprovar solicitações de agendamento | recepcao | `src/app/agenda/solicitacoes/**`, `src/app/api/public/booking/**`, `src/app/api/admin/booking-requests/**` | Revisar pendentes, aprovar (vincular/criar paciente), recusar e reenviar. **[NOVA]** |
| `portal/lista-de-espera` | Lista de espera e ofertas automáticas | recepcao | `src/lib/waitlist/**`, `src/app/espera/**`, `src/app/oferta/**`, `src/app/api/public/waitlist/**`, `src/app/admin/settings/components/WaitlistTab.tsx` | Entradas, modo triagem/automático, estratégia, ofertas por link e aceite/recusa. **[NOVA]** |

### Seção: Formulários e intake
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `formularios/construtor-de-formularios` | Construtor de formulários | profissional | `src/lib/forms/**`, `src/app/formularios/**`, `src/app/api/forms/templates/**` | Drag-and-drop, 10 tipos de campo, condicionais, validação, versionamento e biblioteca. **[NOVA]** |
| `formularios/enviar-e-responder` | Enviar e responder formulários | recepcao | `src/app/formularios/components/SendFormDialog.tsx`, `src/app/f/**`, `src/app/api/forms/responses/**`, `src/app/api/public/forms/**`, `src/lib/forms/completion.ts` | Enviar por canal, preenchimento público com progresso, status e visualização/PDF. **[NOVA]** |
| `formularios/fichas-de-cadastro` | Fichas de cadastro (intake público) | recepcao | `src/lib/intake/**`, `src/app/intake/**`, `src/app/api/public/intake/**`, `src/app/api/intake-submissions/**`, `src/app/patients/components/IntakeSubmission*` | Ficha pública, ViaCEP, aprovar/rejeitar virando paciente e envio automático de formulário. **[NOVA]** |

### Seção: Grupos terapêuticos
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `grupos/grupos-terapeuticos` | Grupos terapêuticos | profissional | `src/lib/groups/**`, `src/app/groups/**`, `src/app/api/groups/**` | Criar/editar grupos, membros (entrada/saída), profissionais adicionais, desativar/encerrar. |
| `grupos/sessoes-de-grupo` | Sessões de grupo na agenda | profissional | `src/app/agenda/components/group-session/**`, `src/app/agenda/components/GroupSessionSheet.tsx`, `src/app/agenda/components/CreateGroupSessionSheet.tsx`, `src/app/api/group-sessions/**` | Gerar/reagendar sessões, status por participante, evolução em massa e faturas agrupadas. |

### Seção: Teleconsulta (telessaúde)
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `teleconsulta/teleconsulta` | Iniciar teleconsulta (profissional) | profissional | `src/lib/telehealth/**`, `src/app/agenda/components/Teleconsulta*`, `src/shared/components/telehealth/**`, `src/app/api/appointments/[id]/teleconsulta/**` | Sala Jitsi/mock, sessões de grupo online, link externo, janela de acesso e finalizar. **[NOVA]** |
| `teleconsulta/acesso-do-paciente` | Acesso do paciente à teleconsulta | paciente | `src/app/teleconsulta/**`, `src/app/api/public/teleconsulta/**`, `src/lib/telehealth/video-tokens.ts`, `src/lib/telehealth/join-window.ts` | Link por token HMAC, pré-entrada LGPD, sala de espera, telas de erro e auditoria. **[NOVA]** |

### Seção: Plataforma (Superadmin)
| Slug | Título (pt-BR) | Audiência | sources | Outline |
|---|---|---|---|---|
| `plataforma/superadmin` | Superadmin: clínicas e dashboard | operador-plataforma | `src/app/superadmin/**`, `src/app/api/superadmin/**`, `src/lib/superadmin-auth.ts`, `src/lib/api/with-superadmin.ts` | Login JWT, métricas (MRR/trials), gestão de clínicas, detalhes e ações de assinatura. |
| `plataforma/planos-e-assinaturas` | Planos e assinaturas | operador-plataforma | `src/app/superadmin/plans/**`, `src/app/api/superadmin/plans/**`, `src/lib/subscription/**` | Criar/editar planos (limites, preço, créditos IA, portal, cota) e limites por plano. |
| `plataforma/monitoramento-de-ia` | Monitoramento de consumo de IA | operador-plataforma | `src/app/superadmin/components/AiUsageTable.tsx`, `src/app/api/superadmin/ai-usage/**` | Consumo mensal por clínica (gerações, tokens, feedback) sem conteúdo clínico. **[NOVA]** |

> **Cobertura:** todas as 14 áreas de inventário mapeiam para >=1 página. Cada feature de cada
> inventário tem ao menos uma página de destino. Funcionalidades de mercado (Grupos 1-6) estão
> marcadas **[NOVA]**. Funcionalidades pré-existentes (login, agenda base, grupos, notificações,
> superadmin, NFS-e base) também estão cobertas.

---

## 5. Checklist de build/verify para a implementação

**Scaffold e estrutura**
- [ ] `npm create fumadocs-app@latest clinica-docs` (Next.js + Fumadocs MDX) e mover para `docs-site/`.
- [ ] Adicionar `"workspaces": ["docs-site"]` ao `package.json` da raiz; `npm install` na raiz.
- [ ] Remover conteúdo de exemplo do scaffold; criar a árvore `content/docs/` conforme o sitemap.

**Configuração de framework**
- [ ] `docs-site/next.config.ts`: `basePath:'/docs'`, `assetPrefix:'/docs'`.
- [ ] `docs-site/lib/i18n.ts`: `defineI18n` pt-BR default, `hideLocale:'default-locale'`.
- [ ] `docs-site/lib/source.ts`: `loader({ baseUrl:'/docs', i18n })`.
- [ ] `docs-site/middleware.ts`: `createI18nMiddleware(i18n)`.
- [ ] `docs-site/source.config.ts`: `defineDocs` + `frontmatterSchema.extend` com o schema Zod (Seção 3.1).
- [ ] `docs-site/mdx-components.tsx`: mapa de componentes + `<Screenshot>`.
- [ ] `npm --workspace docs-site run dev` abre em `http://localhost:3000/docs`.

**Linkagem docs↔código**
- [ ] Criar `docs/feature-manifest.yml` (Seção 3.2) com todas as 20 chaves de feature.
- [ ] Criar `scripts/docs/check-drift.mjs`, `stamp.mjs`, `annotate.mjs` (Node ESM, sem transpile).
- [ ] Toda página MDX nasce com frontmatter completo e `lastReviewedCommit` carimbado contra o HEAD em que foi escrita.
- [ ] `node scripts/docs/check-drift.mjs --base origin/main --head HEAD` roda sem exit 2 (mapa consistente).
- [ ] `.github/workflows/docs-drift.yml` criado e marcado como required check.
- [ ] `.github/CODEOWNERS` gerado a partir do manifesto (`features.*.owner`).
- [ ] `.husky/pre-push` advisory adicionado.
- [ ] Bloco "Docs Sync" adicionado ao `CLAUDE.md` da raiz e ao `docs-site/CLAUDE.md` (Seção 3.5).

**Conteúdo**
- [ ] Seções "Primeiros passos" e "Configuração inicial" escritas primeiro (onboarding completo).
- [ ] Uma página por linha do sitemap; toda feature de todo inventário coberta.
- [ ] Páginas **[NOVA]** marcam visualmente a funcionalidade como recente (callout/badge).
- [ ] Localização pt-BR: datas DD/MM/AAAA, horas HH:mm, moeda R$, locale `pt-BR`.
- [ ] Screenshots em `docs-site/public/img/` referenciados via `<Screenshot>`/Next Image.

**Build e deploy**
- [ ] `npm --workspace docs-site run build` passa (Zod valida todo o frontmatter; Orama indexa).
- [ ] Busca in-browser funciona (digitar termo retorna resultados por locale).
- [ ] Projeto Vercel `clinica-docs` criado (Node 22+/26) com build só de `docs-site`; deploy independente OK.
- [ ] No produto: `rewrites` para `${DOCS_URL}/docs` + `${DOCS_URL}/docs/:path*` adicionados antes de `withPWA`.
- [ ] PWA do produto exclui `/docs/*` do precache (`navigateFallbackDenylist`).
- [ ] `DOCS_URL` definido no env do produto (Vercel) apontando para o deploy de docs.
- [ ] Verificar `https://<dominio-produto>/docs` serve as docs (pt-BR) e `/docs/en/` o inglês.
- [ ] Links internos não quebram com `basePath:'/docs'`; assets carregam via `assetPrefix`.

**Regressão de docs-as-code (verificação do pipeline)**
- [ ] Editar um arquivo sob `src/lib/prontuario/**` num PR de teste e confirmar que `check-drift`
      marca `prontuario/*.mdx` como STALE e o CI anota o PR.
- [ ] `stamp.mjs --page <stale> --commit HEAD` limpa a marcação e o CI volta a verde.
