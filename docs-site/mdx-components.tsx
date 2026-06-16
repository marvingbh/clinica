import defaultMdxComponents from "fumadocs-ui/mdx";
import { Callout } from "fumadocs-ui/components/callout";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Card, Cards } from "fumadocs-ui/components/card";
import { File, Folder, Files } from "fumadocs-ui/components/files";
import type { MDXComponents } from "mdx/types";
import { Screenshot } from "@/components/screenshot";

// Mapa de componentes disponiveis dentro de qualquer .mdx, sem import explicito na pagina.
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Callout,
    Step,
    Steps,
    Tab,
    Tabs,
    Card,
    Cards,
    File,
    Folder,
    Files,
    Screenshot,
    ...components,
  };
}

// Convencao Next.js: usado por arquivos .mdx renderizados pelo App Router.
export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return getMDXComponents(components);
}
