/**
 * Pure types for the AI evolução-drafting domain.
 *
 * This module is intentionally decoupled from the prontuário domain: it operates
 * on `format` + section keys + raw text and returns a `SectionMap`. The route
 * adapter maps the prontuário's `SectionDef { id, label }` to this module's
 * `SectionDef { key, label }`.
 */

export type NoteFormat = "SOAP" | "DAP" | "LIVRE"

/** Map of sectionKey -> generated text. */
export type SectionMap = Record<string, string>

export interface SectionDef {
  key: string
  label: string
}

export interface DraftRequest {
  format: NoteFormat
  /** Sections coming from the note template. */
  sections: SectionDef[]
  /** Optional approach hint: TCC, psicanálise, ABA… */
  abordagem?: string
  /** Raw professional input — ALREADY pseudonymized. */
  roughInput: string
  /** Group-session shared summary (already pseudonymized). */
  sharedContext?: string
  /** Summaries of recent signed notes (already pseudonymized). */
  historyContext?: string[]
}

export interface AssembledPrompt {
  system: string
  user: string
  /** json_schema for the provider's structured-output config. */
  schema: Record<string, unknown>
}

export interface ProviderResult {
  ok: boolean
  /** Raw provider output (still pseudonymized). */
  sections?: SectionMap
  tokensIn: number
  tokensOut: number
  /** Technical message (for logs) — never surfaced raw to the user. */
  error?: string
}

export interface AiDraftProvider {
  name: string // "anthropic" | "mock"
  model: string
  generateNoteDraft(prompt: AssembledPrompt): Promise<ProviderResult>
}
