interface Sortable {
  done: boolean
  order: number
  createdAt: Date | string
  updatedAt?: Date | string
}

/**
 * Combined-list ordering: open todos first by `order` (then `createdAt`),
 * completed todos at the end by `updatedAt` desc (most recently completed first).
 */
export function sortCombined<T extends Sortable>(todos: T[]): T[] {
  return todos.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (!a.done) {
      if (a.order !== b.order) return a.order - b.order
      return tsOf(a.createdAt) - tsOf(b.createdAt)
    }
    // both done: most recently updated first
    return tsOf(b.updatedAt ?? b.createdAt) - tsOf(a.updatedAt ?? a.createdAt)
  })
}

function tsOf(v: Date | string): number {
  return typeof v === "string" ? new Date(v).getTime() : v.getTime()
}

/**
 * Strip height per day = the count of OPEN todos in the day with the most opens.
 * Used by the agenda strip so all days share a uniform visible height.
 */
export function maxOpenCountByDay(todos: Array<{ day: string; done: boolean }>): number {
  const counts = new Map<string, number>()
  for (const t of todos) {
    if (t.done) continue
    counts.set(t.day, (counts.get(t.day) ?? 0) + 1)
  }
  let max = 0
  for (const c of counts.values()) {
    if (c > max) max = c
  }
  return max
}
