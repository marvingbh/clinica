export type NoteFormat = "SOAP" | "DAP" | "LIVRE"

/** Section definition as used by the note editor (id-keyed). */
export interface SectionDef {
  id: string
  label: string
  helpText?: string
}

/** Shape returned by GET /api/ai/usage. */
export interface AiUsageInfo {
  enabled: boolean
  optedOut: boolean
  used: number
  limit: number | null
  remaining: number | null
}
