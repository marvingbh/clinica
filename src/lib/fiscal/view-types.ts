import type { ReciboStatusValue } from "./types"

/** Emission status snapshot joined to a recibo row for the UI. */
export interface EmissionStatusSnapshot {
  status: ReciboStatusValue
  reciboNumero: string | null
  erro: string | null
  batchId: string
}
