import { regimeAtDate, type ProfessionalRegimeInfo } from "./fiscal-period"
import type { ReciboRowView } from "./serialize"

/**
 * Receita Saúde is exclusively a PF (Pessoa Física) regime instrument — PJ
 * professionals report through DMED instead. This keeps only the recibo rows
 * whose owning professional is on the PF regime *as of the payment date*
 * (so a professional who switched regimes only shows rows from the PF period).
 *
 * Rows without a payment date are evaluated against the professional's current
 * regime — they still surface (as blockers) only when that current regime is PF.
 * Professionals with no configured regime are excluded entirely.
 *
 * The professionals dropdown is intentionally NOT filtered by this — only the
 * rows are — so the full clinic roster stays selectable.
 */
export function filterPfReciboRows(
  rows: ReciboRowView[],
  professionals: Map<string, ProfessionalRegimeInfo>
): ReciboRowView[] {
  return rows.filter((row) => {
    const prof = professionals.get(row.professionalProfileId)
    if (!prof || !prof.fiscalRegime) return false

    const effective = row.paymentDate
      ? regimeAtDate(prof.fiscalRegime, prof.fiscalRegimeSince, new Date(row.paymentDate))
      : prof.fiscalRegime
    return effective === "PF"
  })
}
