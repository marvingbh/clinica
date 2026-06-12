/** Adds whole days to a date (positive or negative), returning a new Date. */
export function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

/** Tipos de appointment sincronizáveis para o backfill / feed (sempre estes). */
export const SYNCABLE_TYPES = ["CONSULTA", "TAREFA", "REUNIAO", "LEMBRETE", "NOTA"] as const
