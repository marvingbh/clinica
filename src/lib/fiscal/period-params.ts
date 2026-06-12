/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD, defaulting to the current calendar year. */
export function parsePeriodParams(
  params: URLSearchParams,
  now: Date = new Date()
): { from: Date; to: Date } {
  const fromStr = params.get("from")
  const toStr = params.get("to")
  const year = now.getFullYear()

  const from = fromStr ? parseDateBoundary(fromStr, false) : new Date(Date.UTC(year, 0, 1))
  const to = toStr ? parseDateBoundary(toStr, true) : new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  return { from, to }
}

/** Inclusive year window [Jan 1 .. Dec 31 23:59:59.999] in UTC. */
export function yearWindow(year: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  }
}

function parseDateBoundary(value: string, endOfDay: boolean): Date {
  // Accept YYYY-MM-DD (ISO) or DD/MM/YYYY (pt-BR masked input).
  let y: number, m: number, d: number
  if (value.includes("/")) {
    const [dd, mm, yyyy] = value.split("/")
    y = Number(yyyy)
    m = Number(mm)
    d = Number(dd)
  } else {
    const [yyyy, mm, dd] = value.split("-")
    y = Number(yyyy)
    m = Number(mm)
    d = Number(dd)
  }
  return endOfDay
    ? new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
    : new Date(Date.UTC(y, m - 1, d))
}
