/**
 * Deterministic mock provider. Used in dev without an API key and as the basis
 * for orchestration tests. Never calls any external service.
 */

import type { AiDraftProvider, AssembledPrompt, ProviderResult, SectionMap } from "../types"

const MAX_WORDS_PER_SECTION = 30

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Extract the raw input from the assembled user prompt (after the marker). */
function extractRoughInput(user: string): string {
  const marker = "Anotações da sessão atual:\n"
  const idx = user.indexOf(marker)
  if (idx === -1) return user
  const after = user.slice(idx + marker.length)
  // Stop at the next blank-line section.
  const end = after.indexOf("\n\n")
  return (end === -1 ? after : after.slice(0, end)).trim()
}

export const mockProvider: AiDraftProvider = {
  name: "mock",
  model: "mock",
  async generateNoteDraft(prompt: AssembledPrompt): Promise<ProviderResult> {
    const properties = (prompt.schema.properties ?? {}) as Record<string, { description?: string }>
    const rough = extractRoughInput(prompt.user)
    const words = rough.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS_PER_SECTION).join(" ")

    const sections: SectionMap = {}
    for (const [key, def] of Object.entries(properties)) {
      const label = def.description ?? key
      sections[key] = `[RASCUNHO MOCK] ${label}: ${words}`
    }

    const tokensIn = estimateTokens(prompt.system + prompt.user)
    const tokensOut = estimateTokens(Object.values(sections).join(" "))
    return { ok: true, sections, tokensIn, tokensOut }
  },
}
