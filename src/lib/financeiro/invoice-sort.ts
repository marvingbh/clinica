/**
 * Sort invoices by patient's recurrence day-of-week and start time.
 * Monday 08:00 first → Sunday last. Patients without recurrence go to end.
 */

interface RecurrenceInfo {
  dayOfWeek: number // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: string // "HH:mm"
}

/**
 * Maps dayOfWeek (0=Sun..6=Sat) to a weekday sort rank
 * where Monday=0 is first and Sunday=6 is last.
 */
export function weekdayRank(dayOfWeek: number): number {
  // 0(Sun)→6, 1(Mon)→0, 2(Tue)→1, 3(Wed)→2, 4(Thu)→3, 5(Fri)→4, 6(Sat)→5
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1
}

/**
 * Given a list of recurrences for a patient, pick the earliest
 * by weekday rank then start time.
 */
export function pickEarliestRecurrence(
  recurrences: RecurrenceInfo[],
): RecurrenceInfo | null {
  if (recurrences.length === 0) return null
  return recurrences.reduce((earliest, curr) => {
    const rankA = weekdayRank(earliest.dayOfWeek)
    const rankB = weekdayRank(curr.dayOfWeek)
    if (rankB < rankA) return curr
    if (rankB === rankA && curr.startTime < earliest.startTime) return curr
    return earliest
  })
}

/**
 * Sort invoices by their patient's earliest active recurrence.
 * Invoices without a recurrence sort to the end (preserving name order among them).
 */
export function sortInvoicesByRecurrence<
  T extends { patientId: string; patient: { name: string } },
>(
  invoices: T[],
  recurrenceMap: Map<string, RecurrenceInfo>,
): T[] {
  return [...invoices].sort((a, b) => {
    const recA = recurrenceMap.get(a.patientId)
    const recB = recurrenceMap.get(b.patientId)

    // Both have no recurrence → sort by name
    if (!recA && !recB) return a.patient.name.localeCompare(b.patient.name)
    // No recurrence → end
    if (!recA) return 1
    if (!recB) return -1

    const rankA = weekdayRank(recA.dayOfWeek)
    const rankB = weekdayRank(recB.dayOfWeek)
    if (rankA !== rankB) return rankA - rankB
    if (recA.startTime !== recB.startTime)
      return recA.startTime.localeCompare(recB.startTime)

    // Same day+time → sort by name
    return a.patient.name.localeCompare(b.patient.name)
  })
}
