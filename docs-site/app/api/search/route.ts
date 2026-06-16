import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Indice Orama gerado em build-time (busca in-browser, sem servidor de busca).
// `localeMap` mapeia nossos códigos de locale (pt-BR/en) para os tokenizadores
// do Orama — sem isso o Orama recebe "pt-BR" e lança LANGUAGE_NOT_SUPPORTED.
export const { GET } = createFromSource(source, {
  localeMap: {
    "pt-BR": "portuguese",
    en: "english",
  },
});
