/** Document types that count as a "contrato terapêutico" for the guard. */
export const CONTRACT_DOC_TYPES = ["CONTRATO_TERAPEUTICO"] as const

/**
 * Res. CFP 09/2024 guard: a written therapeutic contract is required for
 * online psychology. Returns true (warning, non-blocking) only for an online
 * CONSULTA whose patient has no signed contract.
 */
export function needsTelepsychContractWarning(args: {
  type: string
  modality: string | null
  hasSignedContract: boolean
}): boolean {
  if (args.type !== "CONSULTA") return false
  if (args.modality !== "ONLINE") return false
  return !args.hasSignedContract
}
