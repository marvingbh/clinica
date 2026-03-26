import type { CashFlowEntry } from "./types"

/**
 * Aggregate daily entries into weekly buckets (Mon-Sun).
 */
export function aggregateByWeek(entries: CashFlowEntry[]): CashFlowEntry[] {
  if (entries.length === 0) return []

  const weeks: CashFlowEntry[] = []
  let currentWeek: CashFlowEntry | null = null

  for (const entry of entries) {
    const date = new Date(entry.date)
    const dayOfWeek = date.getUTCDay() // 0=Sun, 1=Mon (UTC to avoid timezone issues)

    // Start a new week on Monday (but not if this is the very first entry which already started a week)
    if (!currentWeek || (dayOfWeek === 1 && currentWeek.date !== entry.date)) {
      if (currentWeek) weeks.push(currentWeek)
      currentWeek = {
        date: entry.date, // Week start date
        inflow: 0,
        outflow: 0,
        net: 0,
        runningBalance: entry.runningBalance,
        details: { invoices: [], expenses: [], repasse: [] },
      }
    }

    currentWeek.inflow += entry.inflow
    currentWeek.outflow += entry.outflow
    currentWeek.net += entry.net
    currentWeek.runningBalance = entry.runningBalance // Use last day's balance
    currentWeek.details.invoices.push(...entry.details.invoices)
    currentWeek.details.expenses.push(...entry.details.expenses)
    currentWeek.details.repasse.push(...entry.details.repasse)
  }

  if (currentWeek) weeks.push(currentWeek)
  return weeks
}

/**
 * Aggregate daily entries into monthly buckets.
 */
export function aggregateByMonth(entries: CashFlowEntry[]): CashFlowEntry[] {
  if (entries.length === 0) return []

  const months = new Map<string, CashFlowEntry>()

  for (const entry of entries) {
    const monthKey = entry.date.substring(0, 7) // YYYY-MM

    if (!months.has(monthKey)) {
      months.set(monthKey, {
        date: `${monthKey}-01`,
        inflow: 0,
        outflow: 0,
        net: 0,
        runningBalance: 0,
        details: { invoices: [], expenses: [], repasse: [] },
      })
    }

    const bucket = months.get(monthKey)!
    bucket.inflow += entry.inflow
    bucket.outflow += entry.outflow
    bucket.net += entry.net
    bucket.runningBalance = entry.runningBalance // Last day's balance
    bucket.details.invoices.push(...entry.details.invoices)
    bucket.details.expenses.push(...entry.details.expenses)
    bucket.details.repasse.push(...entry.details.repasse)
  }

  return Array.from(months.values())
}
