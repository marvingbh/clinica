/** Barrel for the AI evolução-drafting domain module. */

export * from "./types"
export {
  buildEntityMap,
  pseudonymizeText,
  reidentifyText,
  pseudonymizeSections,
  type PseudonymEntity,
  type PseudonymResult,
  type PseudonymPatient,
} from "./pseudonymize"
export { FORMAT_DEFINITIONS, buildNoteDraftPrompt } from "./prompt"
export { MAX_INPUT_CHARS, truncateInput, type TruncateResult } from "./chunking"
export { parseDraftSections } from "./parse"
export {
  checkAiCredits,
  getUtcMonthRange,
  parseMonthParam,
  limitReachedMessage,
  type AiCreditCheck,
  type AiCreditResult,
} from "./credits"
export {
  generateDraft,
  type GenerateDraftInput,
  type GenerateDraftOutcome,
} from "./generate-draft"
export { getAiProvider } from "./get-provider"
export { mockProvider } from "./providers/mock"
export { createAnthropicProvider } from "./providers/anthropic"
