#!/usr/bin/env node
// annotate.mjs — converte drift.json (saida de check-drift --json) em anotacoes de PR.
// Emite `::warning file=...` por pagina stale e (no GitHub Actions) um comentario fixo (sticky)
// listando cada pagina, sua feature, owner e os arquivos alterados.
//
// Uso:
//   node scripts/docs/annotate.mjs drift.json
//
// Escape hatch (Secao 3.4): label `docs:deferred` no PR ou linha `Docs-Drift-Ack: <motivo>` no
// corpo do PR rebaixa o resultado de bloqueante para advisory (registrado no comentario).

import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const STICKY_MARKER = "<!-- docs-drift-sticky -->";

function loadDrift(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`annotate: nao consegui ler ${path}: ${e.message}`);
    return { stale: [], ok: [], errors: [], warnings: [] };
  }
}

// Le o corpo/labels do PR via env do GitHub Actions, se disponivel.
function readPrContext() {
  const ctx = { body: "", labels: [], number: null };
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    try {
      const ev = JSON.parse(readFileSync(eventPath, "utf8"));
      if (ev.pull_request) {
        ctx.body = ev.pull_request.body || "";
        ctx.labels = (ev.pull_request.labels || []).map((l) => l.name);
        ctx.number = ev.pull_request.number;
      }
    } catch {
      /* sem contexto de PR */
    }
  }
  return ctx;
}

function isAcked(ctx) {
  if (ctx.labels.includes("docs:deferred")) return true;
  if (/^Docs-Drift-Ack:\s*.+$/m.test(ctx.body)) return true;
  return false;
}

function emitAnnotations(stale) {
  for (const s of stale) {
    const files = s.matchedChanges.map((c) => c.file).join(", ");
    // Anotacao ::warning apontando para o arquivo MDX stale.
    const msg = `Documentação possivelmente defasada (feature: ${s.feature}). Código alterado: ${files}. Atualize a prosa e rode scripts/docs/stamp.mjs --page ${s.docPath} --commit HEAD.`;
    console.log(`::warning file=docs-site/content/docs/${s.docPath}::${escapeData(msg)}`);
  }
}

function escapeData(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function buildStickyBody(drift, acked) {
  const lines = [];
  lines.push(STICKY_MARKER);
  lines.push("## Defasagem de documentação (docs-drift)");
  lines.push("");
  if (drift.errors && drift.errors.length > 0) {
    lines.push("### Erros de consistência (bloqueiam o CI)");
    for (const e of drift.errors) lines.push(`- ${e}`);
    lines.push("");
  }
  if (!drift.stale || drift.stale.length === 0) {
    lines.push("Nenhuma página marcada como defasada. ✅");
  } else {
    lines.push(
      acked
        ? "As páginas abaixo parecem defasadas. **Drift reconhecido** (label `docs:deferred` ou `Docs-Drift-Ack:`), então este check é advisory neste PR."
        : "As páginas abaixo parecem defasadas. Atualize a prosa e re-carimbe com `scripts/docs/stamp.mjs`."
    );
    lines.push("");
    lines.push("| Página | Feature | Owner | Código alterado |");
    lines.push("|---|---|---|---|");
    for (const s of drift.stale) {
      const files = s.matchedChanges.map((c) => `\`${c.file}\``).join("<br>");
      lines.push(`| \`${s.docPath}\` | ${s.feature} | ${s.owner ?? "—"} | ${files} |`);
    }
  }
  return lines.join("\n");
}

function postStickyComment(body, prNumber) {
  // Best-effort: usa `gh` se disponivel (token via GITHUB_TOKEN). Idempotente pelo marcador.
  if (!prNumber || !process.env.GITHUB_TOKEN) return false;
  try {
    const existing = execFileSync(
      "gh",
      ["pr", "view", String(prNumber), "--json", "comments", "-q", ".comments[].body"],
      { encoding: "utf8" }
    );
    const has = existing.includes(STICKY_MARKER);
    if (has) {
      // Atualizar comentarios existentes via gh exige o id; mais simples deletar+recriar e ruidoso.
      // Aqui apenas adicionamos um novo se nao houver; atualizacao fica a cargo de action dedicada.
      return true;
    }
    execFileSync("gh", ["pr", "comment", String(prNumber), "--body", body], {
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const path = process.argv[2] || "drift.json";
  const drift = loadDrift(path);
  const ctx = readPrContext();
  const acked = isAcked(ctx);

  // 1. Anotacoes inline (sempre uteis na aba Files do PR).
  emitAnnotations(drift.stale || []);

  // 2. Comentario fixo (sticky).
  const body = buildStickyBody(drift, acked);
  const posted = postStickyComment(body, ctx.number);
  if (!posted) {
    // Fallback: tambem grava no Step Summary do GitHub Actions, se disponivel.
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      try {
        appendFileSync(summaryPath, body + "\n");
      } catch {
        /* ignore */
      }
    } else {
      // Local: imprime o corpo para inspecao.
      console.log("\n" + body);
    }
  }

  // annotate nunca decide o exit code do job (isso e do check-drift --strict);
  // apenas registra. Erros de consistencia sao refletidos no corpo.
  process.exit(0);
}

main();
