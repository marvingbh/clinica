import { defineDocs, defineConfig, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

// SHA git: 7 a 40 hex. Usado por `lastReviewedCommit` e pelo sufixo opcional `@<sha>`.
const sha = z.string().regex(/^[0-9a-f]{7,40}$/, "deve ser um SHA git");

// Schema docs-sync. Estende o frontmatter padrao do Fumadocs com os campos exigidos
// pelo pipeline docs-as-code (Secao 3.1 do plano). `sources` com >=1 item NAO-vazio e
// `lastReviewedCommit` valido sao OBRIGATORIOS — frontmatter ausente/malformado FALHA o build.
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema.extend({
      // Uma chave de docs/feature-manifest.yml (validacao cruzada via check-drift).
      feature: z.string().min(1).optional(),
      // >=1 glob POSIX relativo a raiz do repo. OBRIGATORIO.
      sources: z.array(z.string().min(1)).min(1),
      // SHA contra o qual a prosa foi revisada. Carimbado por scripts/docs/stamp.mjs.
      lastReviewedCommit: sha.optional(),
      // Publico-alvo da pagina.
      audience: z
        .enum(["admin", "profissional", "recepcao", "paciente", "operador-plataforma"])
        .optional(),
      reviewedBy: z.string().optional(),
      owner: z.string().optional(),
      status: z.enum(["published", "draft", "needs-review"]).default("published"),
      // Escape hatch: se true, check-drift nunca marca a pagina como stale.
      ignoreDrift: z.boolean().default(false),
      // true para funcionalidades de mercado (marcadas [NOVA] no sitemap).
      isNew: z.boolean().default(false),
    }),
  },
});

export default defineConfig();
