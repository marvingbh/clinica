import { createI18nMiddleware } from "fumadocs-core/i18n/middleware";
import { i18n } from "@/lib/i18n";

// Redireciona/resolve o locale a partir da i18n config (pt-BR sem prefixo, en em /en/...).
export default createI18nMiddleware(i18n);

export const config = {
  // Ignora _next, arquivos publicos e a rota de busca.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|img/).*)"],
};
