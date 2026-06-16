import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { i18n } from "./i18n";

// Traducoes da UI do Fumadocs por idioma. As chaves verbosas (entre parenteses) sao as
// chaves canonicas do Fumadocs; o que nao for sobrescrito cai no padrao em ingles.
// pt-BR recebe os rotulos mais visiveis (busca, navegacao, sumario) em portugues.
export const { provider } = defineI18nUI(i18n, {
  "pt-BR": {
    displayName: "Português (Brasil)",
    "Search(search dialog)": "Buscar na documentação",
    "Search(search trigger)": "Buscar",
    "No results found(search dialog)": "Nenhum resultado encontrado",
    "On this page(table of contents)": "Nesta página",
    "Last updated on(page footer)": "Última atualização em",
    "Next Page(pagination)": "Próxima",
    "Previous Page(pagination)": "Anterior",
    "Choose a language(language switcher)": "Idioma",
  },
  en: {
    displayName: "English",
  },
});

// Opcoes compartilhadas pelos layouts (home + docs). Recebe o locale atual.
// `i18n: true` habilita o seletor de idioma; a config completa (com a funcao `translations`,
// nao-serializavel) flui pelo RootProvider e nunca e passada a um Client Component.
export function baseOptions(_locale: string): BaseLayoutProps {
  return {
    i18n: true,
    nav: {
      title: "Clinica · Documentação",
    },
  };
}
