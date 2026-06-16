#!/usr/bin/env node
// stamp.mjs — re-carimba `lastReviewedCommit` no frontmatter de uma pagina (equivale a `drift link`).
// Atualizar a prosa E rodar stamp e o que limpa a falha de CI — a revisao e forcada, nao auto-silenciada.
//
// Uso:
//   node scripts/docs/stamp.mjs --page <path> [--commit HEAD]
//   node scripts/docs/stamp.mjs --all --commit HEAD          # carimba todas as paginas (uso inicial)
//
// <path> pode ser absoluto, relativo a raiz do repo, ou relativo ao docsRoot
// (docs-site/content/docs). --commit aceita um ref git (default HEAD), gravado na forma curta.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const DOCS_ROOT = join(REPO_ROOT, "docs-site", "content", "docs");

function parseArgs(argv) {
  const args = { page: null, commit: "HEAD", all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--page") args.page = argv[++i];
    else if (a === "--commit") args.commit = argv[++i];
    else if (a === "--all") args.all = true;
  }
  return args;
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function resolvePagePath(p) {
  if (isAbsolute(p) && existsSync(p)) return p;
  const fromRoot = join(REPO_ROOT, p);
  if (existsSync(fromRoot)) return fromRoot;
  const fromDocsRoot = join(DOCS_ROOT, p);
  if (existsSync(fromDocsRoot)) return fromDocsRoot;
  const withExt = fromDocsRoot.endsWith(".mdx") ? fromDocsRoot : `${fromDocsRoot}.mdx`;
  if (existsSync(withExt)) return withExt;
  throw new Error(`Pagina nao encontrada: ${p}`);
}

function listMdx(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...listMdx(full));
    else if (e.endsWith(".mdx")) out.push(full);
  }
  return out;
}

// Substitui apenas a linha `lastReviewedCommit:` dentro do bloco de frontmatter (primeiro `---...---`).
// Preserva todo o resto da formatacao YAML. Se ausente, insere antes do fechamento do bloco.
function restamp(file, shortSha) {
  const raw = readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error(`Sem bloco de frontmatter: ${file}`);
  const block = m[1];
  let newBlock;
  if (/^lastReviewedCommit:.*$/m.test(block)) {
    newBlock = block.replace(/^lastReviewedCommit:.*$/m, `lastReviewedCommit: ${shortSha}`);
  } else {
    newBlock = `${block}\nlastReviewedCommit: ${shortSha}`;
  }
  const updated = raw.replace(m[0], `---\n${newBlock}\n---`);
  if (updated !== raw) writeFileSync(file, updated);
  return updated !== raw;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const shortSha = git(["rev-parse", "--short", args.commit]);

  let files;
  if (args.all) {
    files = listMdx(DOCS_ROOT);
  } else if (args.page) {
    files = [resolvePagePath(args.page)];
  } else {
    console.error("Uso: stamp.mjs --page <path> [--commit HEAD]  |  --all [--commit HEAD]");
    process.exit(2);
  }

  let changed = 0;
  for (const f of files) {
    if (restamp(f, shortSha)) {
      changed++;
      console.log(`carimbado ${shortSha}: ${f.replace(REPO_ROOT + "/", "")}`);
    }
  }
  console.log(`Concluido: ${changed} pagina(s) carimbada(s) em ${shortSha}.`);
}

main();
