#!/usr/bin/env node
// check-drift.mjs — deteccao de defasagem (stale detection) docs <-> codigo.
// Node ESM puro (Node 22+, sem transpile). Rodado por CI, git hook e pelo Claude.
//
// Uso:
//   node scripts/docs/check-drift.mjs --base origin/main --head HEAD [--json] [--strict] [--ai-list] [--cached]
//
// Exit codes:
//   0 = sem drift
//   1 = paginas stale (so FALHA o build com --strict)
//   2 = erro de consistencia do manifesto/frontmatter (SEMPRE fatal)
//
// Algoritmo (Secao 3.3 do plano):
//   1. Carrega manifesto + frontmatter de todas as paginas; constroi indice inverso e asserta a invariante.
//   2. changed = git diff --name-only <base>..<head> (ACMR), descartando ignoreGlobs e docs-site/.
//   3. Para cada pagina, compila globs efetivos (sources da pagina ∪ sources da feature) em picomatch.
//      Pagina e CANDIDATA se algum matcher casa com algum caminho alterado.
//   4. Sensibilidade ao tempo: CANDIDATA e STALE se algum arquivo casado mudou num commit que NAO e
//      ancestral do lastReviewedCommit da pagina (git rev-list --count <lastReviewedCommit>..<head> -- <file> > 0).
//      Se ignoreDrift:true ou lastReviewedCommit === head, esta limpa.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const MANIFEST_PATH = join(REPO_ROOT, "docs", "feature-manifest.yml");

// Deps de script (gray-matter, picomatch, yaml) vivem ISOLADAS em docs-site/node_modules.
// Resolvemos a partir de docs-site/package.json para o script rodar de qualquer cwd
// (raiz no CI/husky, ou dentro de docs-site) sem poluir o package.json do produto.
const requireFromDocsSite = createRequire(
  pathToFileURL(join(REPO_ROOT, "docs-site", "package.json"))
);
const matter = requireFromDocsSite("gray-matter");
const picomatch = requireFromDocsSite("picomatch");
const { parse: parseYaml } = requireFromDocsSite("yaml");

// ---------- args ----------
function parseArgs(argv) {
  const args = { base: "origin/main", head: "HEAD", json: false, strict: false, aiList: false, cached: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--ai-list") args.aiList = true;
    else if (a === "--cached") args.cached = true;
  }
  return args;
}

// ---------- git helpers ----------
function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}
function gitSafe(args, fallback = "") {
  try {
    return git(args);
  } catch {
    return fallback;
  }
}

function changedFiles({ base, head, cached }) {
  // ACMR + deletes (D) para que fonte removida tambem apareca. POSIX, relativo a raiz.
  let out;
  if (cached) {
    out = gitSafe(["diff", "--name-only", "--diff-filter=ACMRD", "--cached"]);
  } else {
    out = gitSafe(["diff", "--name-only", "--diff-filter=ACMRD", `${base}..${head}`]);
  }
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

// ---------- manifesto ----------
function loadManifest() {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const m = parseYaml(raw);
  if (!m || !m.features) {
    throw new Error("feature-manifest.yml invalido: faltando `features`.");
  }
  return m;
}

// ---------- frontmatter das paginas ----------
function listMdxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listMdxFiles(full));
    else if (entry.endsWith(".mdx")) out.push(full);
  }
  return out;
}

function loadPages(docsRoot) {
  const absRoot = join(REPO_ROOT, docsRoot);
  const files = listMdxFiles(absRoot);
  return files.map((abs) => {
    const rel = relative(absRoot, abs).split("\\").join("/"); // POSIX
    const { data } = matter(readFileSync(abs, "utf8"));
    return {
      abs,
      // caminho relativo ao docsRoot (combina com `docs:` do manifesto)
      docPath: rel,
      repoRel: relative(REPO_ROOT, abs).split("\\").join("/"),
      fm: data,
    };
  });
}

// ---------- invariante de consistencia (Secao 3.2) ----------
// Fatais (exit 2): feature ausente no frontmatter, feature inexistente no manifesto, sources vazio,
// lastReviewedCommit ausente/invalido, ou doc listado no manifesto que nao existe em disco.
// Advisory (nao fatal): pagina cujo caminho nao consta no `docs:` da sua feature (o manifesto e
// um mapa curado e pode nao listar toda pagina do sitemap).
function assertInvariant(manifest, pages) {
  const errors = [];
  const warnings = [];
  const featureKeys = new Set(Object.keys(manifest.features));
  const shaRe = /^[0-9a-f]{7,40}$/;

  // Direcao A: pagina -> manifesto
  const docPathsByFeature = new Map(); // feature -> Set(docPath)
  for (const [key, f] of Object.entries(manifest.features)) {
    docPathsByFeature.set(key, new Set(f.docs || []));
  }

  for (const p of pages) {
    const fm = p.fm;
    if (!fm.feature) {
      errors.push(`${p.repoRel}: frontmatter sem \`feature\`.`);
    } else if (!featureKeys.has(fm.feature)) {
      errors.push(`${p.repoRel}: feature \`${fm.feature}\` nao existe no manifesto.`);
    } else {
      const listed = docPathsByFeature.get(fm.feature);
      if (!listed.has(p.docPath)) {
        warnings.push(
          `${p.repoRel}: caminho nao listado em features.${fm.feature}.docs (mapa curado; considere adicionar).`
        );
      }
    }
    if (!Array.isArray(fm.sources) || fm.sources.length === 0) {
      errors.push(`${p.repoRel}: \`sources\` deve ter >=1 glob.`);
    }
    if (!fm.lastReviewedCommit || !shaRe.test(String(fm.lastReviewedCommit))) {
      errors.push(`${p.repoRel}: \`lastReviewedCommit\` ausente ou nao e um SHA git.`);
    }
  }

  // Direcao B: manifesto -> pagina (cada doc listado deve existir em disco)
  const byDocPath = new Map(pages.map((p) => [p.docPath, p]));
  for (const [key, f] of Object.entries(manifest.features)) {
    for (const doc of f.docs || []) {
      if (!byDocPath.has(doc)) {
        errors.push(`manifesto features.${key}.docs: arquivo inexistente em disco -> ${doc}`);
      }
    }
  }

  return { errors, warnings };
}

// ---------- deteccao de stale ----------
function effectiveGlobs(page, manifest) {
  const set = new Set();
  for (const s of page.fm.sources || []) set.add(stripAnchor(s));
  const f = manifest.features[page.fm.feature];
  if (f) for (const s of f.sources || []) set.add(stripAnchor(s));
  return [...set];
}

// Remove sufixos da gramatica de ancora: <path>#<Symbol> e <glob>@<sha> (Tier-1 trata o caminho puro).
function stripAnchor(s) {
  let out = s;
  const at = out.indexOf("@");
  if (at > 0) out = out.slice(0, at);
  const hash = out.indexOf("#");
  if (hash > 0) out = out.slice(0, hash);
  return out;
}

function fileChangedSinceReviewed(file, lastReviewedCommit, head) {
  // > 0 commits que tocam `file` no intervalo (lastReviewedCommit, head] => mudou apos a revisao.
  const out = gitSafe([
    "rev-list",
    "--count",
    `${lastReviewedCommit}..${head}`,
    "--",
    file,
  ]);
  const n = parseInt(out, 10);
  return Number.isFinite(n) && n > 0;
}

function countCommitsTouching(file, lastReviewedCommit, head) {
  const out = gitSafe(["rev-list", "--count", `${lastReviewedCommit}..${head}`, "--", file]);
  const n = parseInt(out, 10);
  return Number.isFinite(n) ? n : 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let manifest;
  try {
    manifest = loadManifest();
  } catch (e) {
    console.error(`ERRO ao carregar manifesto: ${e.message}`);
    process.exit(2);
  }
  const docsRoot = manifest.defaults?.docsRoot || "docs-site/content/docs";
  const ignoreGlobs = manifest.defaults?.ignoreGlobs || [];
  const isIgnored = picomatch(ignoreGlobs, { dot: true });

  const pages = loadPages(docsRoot);
  const { errors, warnings } = assertInvariant(manifest, pages);

  if (errors.length > 0) {
    if (args.json) {
      console.log(JSON.stringify({ stale: [], ok: [], errors, warnings }, null, 2));
    } else {
      console.error("Erros de consistencia do manifesto/frontmatter (exit 2):");
      for (const e of errors) console.error(`  - ${e}`);
    }
    process.exit(2);
  }

  // Caminhos alterados (descarta ignoreGlobs e qualquer coisa dentro de docs-site/).
  const changed = changedFiles(args).filter(
    (f) => !isIgnored(f) && !f.startsWith("docs-site/")
  );
  const head = args.head;

  const stale = [];
  const ok = [];

  for (const page of pages) {
    if (page.fm.ignoreDrift === true) {
      ok.push({ page: page.repoRel, feature: page.fm.feature, reason: "ignoreDrift" });
      continue;
    }
    const last = String(page.fm.lastReviewedCommit);
    const globs = effectiveGlobs(page, manifest);
    const isMatch = picomatch(globs, { dot: true });
    const matched = changed.filter((f) => isMatch(f));

    if (matched.length === 0) {
      ok.push({ page: page.repoRel, feature: page.fm.feature });
      continue;
    }

    // Sensibilidade ao tempo: stale somente se algum arquivo casado mudou apos lastReviewedCommit.
    const matchedChanges = [];
    for (const f of matched) {
      const n = countCommitsTouching(f, last, head);
      if (n > 0) matchedChanges.push({ file: f, commits: n });
    }

    if (matchedChanges.length === 0) {
      ok.push({ page: page.repoRel, feature: page.fm.feature, reason: "ancestral" });
    } else {
      stale.push({
        page: page.repoRel,
        docPath: page.docPath,
        feature: page.fm.feature,
        owner: manifest.features[page.fm.feature]?.owner ?? null,
        matchedChanges,
        lastReviewedCommit: last,
        headCommit: gitSafe(["rev-parse", "--short", head], head),
      });
    }
  }

  // Saidas
  if (args.json) {
    console.log(JSON.stringify({ stale, ok, errors: [], warnings }, null, 2));
  } else if (args.aiList) {
    for (const s of stale) {
      console.log(s.page);
      for (const c of s.matchedChanges) console.log(`  <- ${c.file} (${c.commits} commit(s) desde ${s.lastReviewedCommit})`);
    }
  } else {
    if (warnings.length > 0) {
      console.log("Avisos de consistencia (advisory):");
      for (const w of warnings) console.log(`  ~ ${w}`);
      console.log("");
    }
    if (stale.length === 0) {
      console.log(`OK: nenhuma pagina defasada (${pages.length} paginas verificadas).`);
    } else {
      for (const s of stale) {
        const first = s.matchedChanges[0];
        console.log(
          `STALE  ${s.docPath}  <- ${first.file} (mudou em ${first.commits} commit(s) desde ${s.lastReviewedCommit})`
        );
      }
    }
  }

  process.exit(stale.length > 0 && args.strict ? 1 : 0);
}

main();
