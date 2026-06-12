export const MIN_RETENTION_YEARS = 5
export const MAX_RETENTION_YEARS = 20

/** Clamp a retention-years value into the legal [5, 20] range. */
export function clampRetentionYears(years: number): number {
  if (!Number.isFinite(years)) return MIN_RETENTION_YEARS
  const rounded = Math.round(years)
  if (rounded < MIN_RETENTION_YEARS) return MIN_RETENTION_YEARS
  if (rounded > MAX_RETENTION_YEARS) return MAX_RETENTION_YEARS
  return rounded
}

/**
 * Compute the retention deadline = recordClosedAt + retentionYears.
 * Handles Feb 29 by clamping to the last valid day of the target month
 * (e.g. 29/02/2024 + 5y -> 28/02/2029).
 */
export function retentionDeadline(recordClosedAt: Date, retentionYears: number): Date {
  const year = recordClosedAt.getUTCFullYear() + retentionYears
  const month = recordClosedAt.getUTCMonth()
  const day = recordClosedAt.getUTCDate()
  // Last day of the target month, to clamp Feb 29 overflow.
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, lastDayOfTargetMonth)
  return new Date(
    Date.UTC(
      year,
      month,
      clampedDay,
      recordClosedAt.getUTCHours(),
      recordClosedAt.getUTCMinutes(),
      recordClosedAt.getUTCSeconds(),
      recordClosedAt.getUTCMilliseconds()
    )
  )
}

export type DisposeCheck =
  | { ok: true }
  | { ok: false; reason: "NOT_CLOSED" | "WITHIN_RETENTION" }

/**
 * Whether a record may be formally disposed: it must be closed and the
 * retention deadline must have passed.
 */
export function canDispose(
  recordClosedAt: Date | null,
  retentionYears: number,
  now: Date
): DisposeCheck {
  if (!recordClosedAt) return { ok: false, reason: "NOT_CLOSED" }
  const deadline = retentionDeadline(recordClosedAt, clampRetentionYears(retentionYears))
  if (now.getTime() < deadline.getTime()) return { ok: false, reason: "WITHIN_RETENTION" }
  return { ok: true }
}

function formatBrDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0")
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const y = date.getUTCFullYear()
  return `${d}/${m}/${y}`
}

/**
 * pt-BR retention banner. When the deadline has not passed, shows the years
 * remaining; otherwise announces that disposal is released.
 */
export function formatRetentionBanner(
  recordClosedAt: Date,
  retentionYears: number,
  now: Date
): string {
  const years = clampRetentionYears(retentionYears)
  const deadline = retentionDeadline(recordClosedAt, years)
  if (now.getTime() >= deadline.getTime()) {
    return "Prazo de guarda cumprido. O descarte formal está liberado."
  }
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000
  const yearsLeft = Math.max(1, Math.ceil((deadline.getTime() - now.getTime()) / msPerYear))
  return `Prontuário encerrado em ${formatBrDate(recordClosedAt)}. Guarda obrigatória até ${formatBrDate(deadline)} (${yearsLeft} ${yearsLeft === 1 ? "ano restante" : "anos restantes"}).`
}
