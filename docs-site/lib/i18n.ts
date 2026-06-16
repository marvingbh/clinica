import { defineI18n } from "fumadocs-core/i18n";

// pt-BR e o idioma primario; servido em URLs limpas (/docs/...). Ingles em /docs/en/...
// `hideLocale: 'default-locale'` oculta o prefixo de locale apenas para o idioma padrao.
export const i18n = defineI18n({
  defaultLanguage: "pt-BR",
  languages: ["pt-BR", "en"],
  hideLocale: "default-locale",
});
