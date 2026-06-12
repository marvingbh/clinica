/**
 * Testable orchestration of a draft generation. Dependencies are injected
 * (no Prisma here) so the whole pipeline is unit-testable with the mock provider.
 *
 * Pipeline: precondition checks → truncate → pseudonymize (input + shared +
 * history) → build prompt → provider → parse → re-identify each section.
 */

import type { AiDraftProvider, NoteFormat, SectionDef, SectionMap } from "./types"
import type { AiCreditResult } from "./credits"
import type { PseudonymEntity } from "./pseudonymize"
import { truncateInput } from "./chunking"
import { pseudonymizeText, pseudonymizeSections } from "./pseudonymize"
import { buildNoteDraftPrompt } from "./prompt"
import { parseDraftSections } from "./parse"

export interface GenerateDraftInput {
  clinic: { aiEnabled: boolean; aiHistoryContext: boolean }
  user: { aiOptOut: boolean }
  credit: AiCreditResult
  patientEntities: PseudonymEntity[]
  format: NoteFormat
  sections: SectionDef[]
  abordagem?: string
  roughInput: string
  sharedContext?: string
  historyContext?: string[]
}

export type GenerateDraftOutcome =
  | { kind: "blocked"; reason: "disabled" | "opt_out" | "no_credits"; message: string }
  | { kind: "failed"; message: string; tokensIn: number; tokensOut: number }
  | {
      kind: "success"
      sections: SectionMap
      tokensIn: number
      tokensOut: number
      truncated: boolean
    }

const FAILED_MESSAGE = "Não foi possível gerar o rascunho. Seu texto foi preservado."

export async function generateDraft(
  input: GenerateDraftInput,
  provider: AiDraftProvider
): Promise<GenerateDraftOutcome> {
  if (!input.clinic.aiEnabled) {
    return {
      kind: "blocked",
      reason: "disabled",
      message: "O assistente de IA não está habilitado para esta clínica.",
    }
  }
  if (input.user.aiOptOut) {
    return {
      kind: "blocked",
      reason: "opt_out",
      message: "Você optou por não utilizar recursos de IA.",
    }
  }
  if (!input.credit.allowed) {
    return {
      kind: "blocked",
      reason: "no_credits",
      message: input.credit.message ?? "Limite de gerações atingido.",
    }
  }

  const { text: truncatedInput, truncated } = truncateInput(input.roughInput)
  const { text: pseudoInput, tokenMap } = pseudonymizeText(truncatedInput, input.patientEntities)

  const pseudoShared = input.sharedContext
    ? pseudonymizeText(input.sharedContext, input.patientEntities).text
    : undefined

  const historyContext =
    input.clinic.aiHistoryContext && input.historyContext?.length
      ? input.historyContext.map((h) => pseudonymizeText(h, input.patientEntities).text)
      : undefined

  const prompt = buildNoteDraftPrompt({
    format: input.format,
    sections: input.sections,
    abordagem: input.abordagem,
    roughInput: pseudoInput,
    sharedContext: pseudoShared,
    historyContext,
  })

  const result = await provider.generateNoteDraft(prompt)
  if (!result.ok || !result.sections) {
    return {
      kind: "failed",
      message: FAILED_MESSAGE,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    }
  }

  const expectedKeys = input.sections.map((s) => s.key)
  const parsed = parseDraftSections(result.sections, expectedKeys)
  if (!parsed) {
    return {
      kind: "failed",
      message: FAILED_MESSAGE,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    }
  }

  // Re-identify tokens with the patient's real values (local only).
  const sections = pseudonymizeSections(parsed, tokenMap)

  return {
    kind: "success",
    sections,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    truncated,
  }
}
