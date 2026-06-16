#!/usr/bin/env node
// gen-codeowners.mjs — GERA .github/CODEOWNERS a partir de docs/feature-manifest.yml.
// Para cada feature, emite uma linha CODEOWNERS por glob de `sources` -> `owner`, e tambem
// roteia as paginas de docs (docsRoot/<doc>) para o mesmo owner. Regra CODEOWNERS: a ULTIMA
// regra que casa vence, entao a ordem segue a ordem do manifesto (especificos por ultimo).
//
// Uso: node scripts/docs/gen-codeowners.mjs [--check]
//   (sem flag) reescreve .github/CODEOWNERS
//   --check    falha (exit 1) se o arquivo estiver desatualizado (uso em CI, opcional)

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const MANIFEST_PATH = join(REPO_ROOT, "docs", "feature-manifest.yml");
const OUT_PATH = join(REPO_ROOT, ".github", "CODEOWNERS");

const requireFromDocsSite = createRequire(
  pathToFileURL(join(REPO_ROOT, "docs-site", "package.json"))
);
const { parse: parseYaml } = requireFromDocsSite("yaml");

// Converte um glob picomatch (raiz do repo) para um padrao CODEOWNERS (prefixado com /).
function toCodeownersPattern(glob) {
  return glob.startsWith("/") ? glob : `/${glob}`;
}

function build() {
  const manifest = parseYaml(readFileSync(MANIFEST_PATH, "utf8"));
  const docsRoot = manifest.defaults?.docsRoot || "docs-site/content/docs";
  const lines = [];
  lines.push("# CODEOWNERS — GERADO por scripts/docs/gen-codeowners.mjs a partir de");
  lines.push("# docs/feature-manifest.yml (features.*.owner + sources + docs). NAO EDITE A MAO.");
  lines.push("# Regenerar: node scripts/docs/gen-codeowners.mjs");
  lines.push("");

  for (const [key, f] of Object.entries(manifest.features)) {
    if (!f.owner) continue;
    lines.push(`# feature: ${key} — ${f.title ?? ""}`.trimEnd());
    for (const glob of f.sources || []) {
      lines.push(`${toCodeownersPattern(glob)} ${f.owner}`);
    }
    for (const doc of f.docs || []) {
      lines.push(`${toCodeownersPattern(`${docsRoot}/${doc}`)} ${f.owner}`);
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\n+$/, "\n");
}

function main() {
  const check = process.argv.includes("--check");
  const next = build();
  if (check) {
    const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, "utf8") : "";
    if (current !== next) {
      console.error("CODEOWNERS desatualizado. Rode: node scripts/docs/gen-codeowners.mjs");
      process.exit(1);
    }
    console.log("CODEOWNERS atualizado.");
    return;
  }
  writeFileSync(OUT_PATH, next);
  console.log(`Gerado ${OUT_PATH.replace(REPO_ROOT + "/", "")}`);
}

main();
