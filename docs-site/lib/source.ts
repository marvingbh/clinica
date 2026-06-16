import { loader } from "fumadocs-core/source";
import { docs } from "@/.source/server";
import { i18n } from "./i18n";

// Loader montado em /docs (combina com basePath/assetPrefix do next.config) e ciente de i18n.
export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: "/docs",
  i18n,
});
