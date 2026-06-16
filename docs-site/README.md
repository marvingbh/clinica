# Clinica — Site de documentação (`docs-site`)

App Next.js 16 (App Router) + [Fumadocs](https://fumadocs.dev) que serve a documentação do produto
em `/docs`. É autossuficiente: tem seu próprio `package.json`, `node_modules` e build, e **não**
depende do build do produto. Conteúdo primário em português do Brasil (pt-BR), com inglês (`en`)
adicionável incrementalmente.

## Requisitos

- Node **>= 22** (o ambiente usa Node 26).

## Dev / build

```bash
cd docs-site
npm install          # instala deps (e roda fumadocs-mdx via postinstall, gerando .source/)
npm run dev          # http://localhost:3000/docs   (pt-BR limpo; inglês em /docs/en/)
npm run build        # build de produção: Zod valida TODO o frontmatter; Orama indexa a busca
npm start            # serve o build
```

> `npm run build` falha se qualquer página tiver frontmatter inválido (ex.: `sources` ausente/vazio).
> Isso é proposital — é o gate de qualidade do conteúdo.

### Estrutura

```
docs-site/
├── source.config.ts        # defineDocs + frontmatterSchema.extend (Zod)
├── next.config.ts          # basePath:'/docs', assetPrefix:'/docs', createMDX()
├── middleware.ts           # createI18nMiddleware(i18n)
├── mdx-components.tsx       # componentes MDX + <Screenshot>
├── lib/{i18n,source,layout.shared}.ts(x)
├── app/[lang]/…             # home + docs/[[...slug]] + api/search
├── content/docs/**          # TODO o MDX (uma pasta por seção, meta.json controla ordem/título)
└── public/img/**            # screenshots
```

## Deploy independente (Vercel)

Crie um projeto Vercel separado (ex.: `clinica-docs`) apontando para este subdiretório:

- **Root Directory:** `docs-site`
- **Build Command:** `npm run build` (ou, da raiz do monorepo, `npm --prefix docs-site run build`)
- **Install Command:** `npm ci`
- **Node version:** 22+ (defina `NODE_VERSION=26` para alinhar com o ambiente local)
- **Output:** padrão do Next.js. O índice de busca Orama é gerado em build-time — nada a provisionar.

Domínio próprio (ex.: `docs.clinica.app`) ou a URL gerada pela Vercel. Sem acoplamento ao deploy do produto.

## Mesmo domínio (`/docs`) via Multi-Zones — a aplicar **no produto**

Para servir as docs em `https://<app-do-produto>/docs` sem deploy acoplado, o **produto** (não este
app) faz rewrite de `/docs` para a URL deste deploy. Como este app já usa `basePath:'/docs'` +
`assetPrefix:'/docs'`, os assets resolvem corretamente atrás do rewrite.

> Estas alterações **não** estão aplicadas neste repositório — documente/aplique no `next.config.ts`
> do produto quando for ativar o mesmo domínio. `DOCS_URL` aponta para o deploy deste app de docs.

```ts
// next.config.ts do PRODUTO — adicionar `rewrites` DENTRO do nextConfig, antes de withPWA(nextConfig):
async rewrites() {
  return [
    { source: "/docs", destination: `${process.env.DOCS_URL}/docs` },
    { source: "/docs/:path*", destination: `${process.env.DOCS_URL}/docs/:path*` },
  ];
}
```

Além disso, o PWA do produto precisa **excluir** `/docs/*` do precache para não interceptar a zona:

```ts
// opções do withPWA no produto:
workboxOptions: { navigateFallbackDenylist: [/^\/docs/] }
```

E definir `DOCS_URL` no ambiente (Vercel) do produto apontando para o deploy deste app.
i18n: pt-BR resolve em `/docs/...`; inglês em `/docs/en/...`.

### Alternativa (single-app basePath)

Se um dia quiser um único deploy, copie `app/`, `content/`, `source.config.ts` e a rota `[[...slug]]`
para dentro do produto sob `/docs`, mantendo `basePath`/`baseUrl` em `'/docs'`. Mais simples
operacionalmente, mas acopla o deploy das docs ao do produto. A opção Multi-Zones acima é a default.

## Docs-as-code: como o `check-drift` sinaliza páginas defasadas

O elo docs⇄código vive na **raiz do repositório** (fora deste app, porque abrange código e docs):

- `docs/feature-manifest.yml` — mapa canônico feature ⇄ fonte (globs) ⇄ páginas. Também é a fonte do
  `.github/CODEOWNERS` (gerado por `scripts/docs/gen-codeowners.mjs`).
- Cada página `.mdx` declara no frontmatter: `feature`, `sources` (>=1 glob POSIX relativo à raiz do
  repo), `lastReviewedCommit` (o SHA contra o qual a prosa foi revisada) e `audience`.

### Detecção de defasagem

```bash
# da raiz do repo (as deps do script vivem em docs-site/node_modules; o script as resolve sozinho):
node scripts/docs/check-drift.mjs --base origin/main --head HEAD            # tabela humana
node scripts/docs/check-drift.mjs --base origin/main --head HEAD --json     # JSON p/ annotate.mjs
node scripts/docs/check-drift.mjs --base origin/main --head HEAD --ai-list  # checklist p/ o agente
node scripts/docs/check-drift.mjs --base origin/main --head HEAD --strict   # exit 1 se houver stale
```

Uma página é marcada **STALE** quando algum arquivo casado por seus `sources` (∪ os `sources` da
feature no manifesto) mudou em um commit **posterior** ao `lastReviewedCommit` da página
(`git rev-list --count <lastReviewedCommit>..<head> -- <arquivo> > 0`). Editar só docs nunca torna
código stale; arquivos em `defaults.ignoreGlobs` (testes, mocks) são ignorados.

- **Exit 0** = sem drift · **Exit 1** = páginas stale (falha o build só com `--strict`) ·
  **Exit 2** = mapa/frontmatter inconsistente (sempre fatal).

### Como `stamp` limpa a marcação

Atualize a prosa para refletir o código atual e **re-carimbe**:

```bash
node scripts/docs/stamp.mjs --page prontuario/prontuario-eletronico.mdx --commit HEAD
node scripts/docs/stamp.mjs --all --commit HEAD     # carimba todas (uso inicial / rebase grande)
```

`stamp` reescreve apenas a linha `lastReviewedCommit:` do frontmatter (preserva o resto). Atualizar a
prosa **e** rodar `stamp` é o que limpa a falha de CI — a revisão é forçada, não auto-silenciada.

### CI

`.github/workflows/docs-drift.yml` roda `check-drift --strict --json`, anota o PR via
`scripts/docs/annotate.mjs` (`::warning file=...` + comentário fixo) e falha conforme os exit codes.
Escape hatch: label `docs:deferred` ou linha `Docs-Drift-Ack: <motivo>` no corpo do PR rebaixa o
exit 1 para advisory. `.husky/pre-push` roda o check em modo advisory (nunca bloqueia).
