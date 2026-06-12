// Pure logic for the annual fiscal-reminder cron. The route wires Prisma I/O
// around these functions (queries, idempotency checks, creates).

export interface PfProfessional {
  professionalProfileId: string
  clinicId: string
}

export interface DmedClinic {
  clinicId: string
  /** professionalProfileId of an active ADMIN with a profile, or a fallback. */
  assigneeProfileId: string | null
}

export interface PlannedTodo {
  clinicId: string
  professionalProfileId: string
  title: string
  notes: string
  day: string // YYYY-MM-DD
}

/** Returns "PF" in January, "PJ" in February, or null otherwise. */
export function fiscalTodoKind(now: Date): "PF" | "PJ" | null {
  const month = now.getUTCMonth() // 0-based
  if (month === 0) return "PF"
  if (month === 1) return "PJ"
  return null
}

export function reciboTodoTitle(year: number): string {
  return `Emitir recibos Receita Saúde pendentes de ${year}`
}

export function dmedTodoTitle(year: number): string {
  return `Gerar conferência DMED ${year}`
}

/** January: one recibo-reminder todo per active PF professional. */
export function planPfTodos(professionals: PfProfessional[], now: Date): PlannedTodo[] {
  const previousYear = now.getUTCFullYear() - 1
  const day = isoDate(now)
  return professionals.map((p) => ({
    clinicId: p.clinicId,
    professionalProfileId: p.professionalProfileId,
    title: reciboTodoTitle(previousYear),
    notes: `A janela de emissão retroativa encerra em 28/02/${previousYear + 1}.`,
    day,
  }))
}

/** February: one DMED-conference todo per dmed-enabled clinic (skips clinics with no assignee). */
export function planDmedTodos(clinics: DmedClinic[], now: Date): PlannedTodo[] {
  const previousYear = now.getUTCFullYear() - 1
  const day = isoDate(now)
  const planned: PlannedTodo[] = []
  for (const c of clinics) {
    if (!c.assigneeProfileId) continue
    planned.push({
      clinicId: c.clinicId,
      professionalProfileId: c.assigneeProfileId,
      title: dmedTodoTitle(previousYear),
      notes: "Prazo de entrega da DMED: último dia útil de fevereiro.",
      day,
    })
  }
  return planned
}

/** Drops planned todos that already exist (same clinic + professional + title). */
export function filterNewTodos(
  planned: PlannedTodo[],
  existing: Array<{ clinicId: string; professionalProfileId: string; title: string }>
): PlannedTodo[] {
  const seen = new Set(existing.map((e) => `${e.clinicId}|${e.professionalProfileId}|${e.title}`))
  return planned.filter((p) => !seen.has(`${p.clinicId}|${p.professionalProfileId}|${p.title}`))
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
