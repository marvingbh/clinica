/** UI formatting helpers for /relatorios (pt-BR). */

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "n/d"
  return `${(n * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`
}

export function fmtHours(minutes: number): string {
  const h = minutes / 60
  return `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`
}

export function fmtNumber(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—"
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function fmtBrl(n: number | null | undefined): string {
  if (n == null) return "—"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function fmtBrDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR")
}
