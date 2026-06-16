# CLAUDE.md — Site de documentação (docs-site)

App Next.js 16 (App Router) + Fumadocs que serve a documentação do Clinica em `/docs`.
Deploy independente (projeto Vercel próprio); montável no mesmo domínio do produto via
Multi-Zones rewrite (ver README.md). Conteúdo em pt-BR por padrão; inglês incremental em `/docs/en/`.

## Comandos

```bash
npm run dev      # http://localhost:3000/docs
npm run build    # build de produção (Zod valida todo frontmatter; Orama indexa)
npm start        # servir o build
```

`postinstall` roda `fumadocs-mdx` e regenera a pasta `.source/` (não edite `.source/` à mão).

## Estrutura

- `source.config.ts` — `defineDocs` + `frontmatterSchema.extend` (schema Zod do frontmatter).
- `lib/i18n.ts` — `defineI18n` pt-BR default, `hideLocale: 'default-locale'`.
- `lib/source.ts` — `loader({ baseUrl: '/docs', i18n })`, importa `docs` de `@/.source/server`.
- `lib/layout.shared.tsx` — `defineI18nUI` (traduções da UI) + `baseOptions(locale)`.
- `middleware.ts` — `createI18nMiddleware(i18n)`.
- `mdx-components.tsx` — mapa de componentes MDX (Callout, Steps, Tabs, Cards, Files, `<Screenshot>`).
- `app/[lang]/...` — layout raiz, home `(home)`, docs `docs/[[...slug]]`.
- `app/api/search/route.ts` — `createFromSource(source)` (busca Orama in-browser).
- `content/docs/**` — todo o MDX. Uma pasta por seção com `meta.json` (título pt-BR + ordem).
- `public/img/**` — screenshots referenciados por `<Screenshot src="/img/..." alt="..." />`.

## Editando docs (Docs Sync)

- Toda página precisa de frontmatter válido: `feature`, `sources` (>=1 glob), `lastReviewedCommit`,
  `audience`. O build (Fumadocs `defineDocs` + Zod) FALHA se `sources` estiver ausente/vazio — não o remova.
- O `feature` da página deve ser chave em `../docs/feature-manifest.yml`. Mantenha os dois lados em sincronia;
  ao adicionar uma página, considere listá-la em `features.<feature>.docs` no manifesto.
- Depois de escrever prosa que reflete o código atual, ajuste `lastReviewedCommit` para o commit
  contra o qual revisou: `node ../scripts/docs/stamp.mjs --page <path> --commit HEAD`.
- Conteúdo em pt-BR por padrão (`pagina.mdx`); traduções em inglês são `pagina.en.mdx` na mesma pasta.
- Datas DD/MM/AAAA, horas HH:mm 24h, moeda R$ — siga a localização do produto.
- Páginas de funcionalidades de mercado têm `isNew: true` (renderiza um callout "Funcionalidade nova").

## Componentes MDX disponíveis (sem import na página)

`<Callout type="info|warn|error" title="...">`, `<Steps>`/`<Step>`, `<Tabs>`/`<Tab>`,
`<Cards>`/`<Card>`, `<Files>`/`<Folder>`/`<File>`, e `<Screenshot src="/img/..." alt="..." caption?="..." />`.

## Como preencher o corpo de um stub

Cada stub tem uma linha placeholder em pt-BR e um comentário `{/* OUTLINE (do sitemap): ... */}`.
Substitua o placeholder pela prosa real seguindo o outline, mantenha o frontmatter, use os componentes
acima, adicione screenshots em `public/img/<secao>/` e re-carimbe com `stamp.mjs` ao terminar.
