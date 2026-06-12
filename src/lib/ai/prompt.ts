/**
 * Prompt assembly + JSON schema construction (pure).
 *
 * The system prompt encodes the clinical-writing rules; the user prompt carries
 * the (already pseudonymized) raw input, optional shared/history context, and
 * the section structure. The JSON schema mirrors the requested sections exactly,
 * with `additionalProperties: false`.
 */

import type { AssembledPrompt, DraftRequest, NoteFormat } from "./types"

/** pt-BR semantics of each format's sections, embedded in the system prompt. */
export const FORMAT_DEFINITIONS: Record<NoteFormat, string> = {
  SOAP:
    "Formato SOAP: Subjetivo (relato e percepções do paciente), Objetivo (observações e dados objetivos da sessão), Avaliação (análise clínica e hipóteses) e Plano (condutas e próximos passos).",
  DAP:
    "Formato DAP: Dados (informações subjetivas e objetivas da sessão), Avaliação (análise clínica e hipóteses) e Plano (condutas e próximos passos).",
  LIVRE:
    "Formato livre: um registro corrido e coeso da sessão, sem subdivisões rígidas.",
}

const SYSTEM_RULES = [
  "Você é um assistente que ajuda psicólogos no Brasil a redigir o rascunho de uma evolução clínica de sessão.",
  "Redija em português do Brasil, em linguagem formal de registro clínico.",
  "Use exclusivamente as informações fornecidas pelo profissional; NUNCA invente fatos clínicos, diagnósticos ou condutas que não tenham sido mencionados.",
  "Preserve EXATAMENTE quaisquer marcadores entre colchetes (por exemplo [PACIENTE], [CPF_1]) como aparecem no texto; não os traduza, remova nem substitua.",
  "Nunca inclua recomendação diagnóstica não mencionada explicitamente pelo profissional.",
  "Preencha todas as seções solicitadas; quando não houver material para uma seção, devolva uma string vazia para ela.",
  "Responda apenas com o objeto JSON das seções, sem texto adicional.",
]

export function buildNoteDraftPrompt(req: DraftRequest): AssembledPrompt {
  const lines = [...SYSTEM_RULES, "", FORMAT_DEFINITIONS[req.format]]
  if (req.abordagem && req.abordagem.trim()) {
    lines.push(
      "",
      `Adeque o estilo e a terminologia à abordagem terapêutica: ${req.abordagem.trim()}.`
    )
  }
  const system = lines.join("\n")

  const userParts: string[] = []
  if (req.sharedContext && req.sharedContext.trim()) {
    userParts.push(`Resumo compartilhado da sessão (grupo):\n${req.sharedContext.trim()}`)
  }
  if (req.historyContext && req.historyContext.length > 0) {
    userParts.push(
      "Contexto de notas anteriores (pseudonimizado):\n" +
        req.historyContext.map((h, i) => `(${i + 1}) ${h}`).join("\n")
    )
  }
  userParts.push(`Anotações da sessão atual:\n${req.roughInput}`)
  userParts.push(
    "Seções a preencher:\n" + req.sections.map((s) => `- ${s.key}: ${s.label}`).join("\n")
  )
  const user = userParts.join("\n\n")

  const properties: Record<string, unknown> = {}
  for (const s of req.sections) {
    properties[s.key] = { type: "string", description: s.label }
  }
  const schema = {
    type: "object",
    properties,
    required: req.sections.map((s) => s.key),
    additionalProperties: false,
  }

  return { system, user, schema }
}
