import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  // O app já serve as docs sob /docs (rota app/[lang]/docs + loader baseUrl '/docs'),
  // então NÃO usamos basePath aqui — senão o caminho fica duplicado (/docs/docs/...).
  // Deploy mesmo-domínio (Multi-Zones): o produto faz rewrite de /docs/:path* -> DOCS_URL/docs/:path*.
  reactStrictMode: true,
  // Fixa a raiz do Turbopack neste app (existem multiplos lockfiles no monorepo).
  turbopack: {
    root: import.meta.dirname,
  },
};

const withMDX = createMDX();

export default withMDX(config);
