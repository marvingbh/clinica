"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Pagination } from "@/shared/components/ui/pagination"
import { DatePickerInput } from "@/shared/components/ui/date-picker-input"
import { MONTH_LABEL } from "./months"

/** Which smart presets to offer, based on whether the dates are past or future. */
type DateDirection = "past" | "future" | "both"

type Preset = "last7" | "last30" | "next7" | "next30" | "custom"

const PRESET_LABEL: Record<Preset, string> = {
  last7: "Últimos 7 dias",
  last30: "Últimos 30 dias",
  next7: "Próximos 7 dias",
  next30: "Próximos 30 dias",
  custom: "Período personalizado",
}

const PRESETS_BY_DIRECTION: Record<DateDirection, Preset[]> = {
  past: ["last7", "last30", "custom"],
  future: ["next7", "next30", "custom"],
  both: ["last7", "last30", "next7", "next30", "custom"],
}

/** Default window: there is no "no filter" option — 7 days (past or future). */
function defaultPreset(direction: DateDirection): Preset {
  return direction === "future" ? "next7" : "last7"
}

interface MonthYear {
  month: number // 1-12
  year: number
}

interface FilteredPagedListProps<T> {
  items: T[]
  getKey: (item: T) => string
  getSearchText: (item: T) => string
  renderItem: (item: T) => React.ReactNode
  /** Day-based filter (sessions): ISO accessor + smart 7/30-day presets. */
  getDate?: (item: T) => string | null
  dateDirection?: DateDirection
  /** Month-based filter (faturas/recibos): reference month/year accessor. */
  getMonth?: (item: T) => MonthYear
  pageSize?: number
  searchPlaceholder?: string
  emptyText: string
}

const selectClass =
  "h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"

/** DD/MM/AAAA → Date at start/end of day; null if incomplete or invalid. */
function parseBrDate(s: string, endOfDay: boolean): Date | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0)
  return isNaN(date.getTime()) ? null : date
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function presetRange(preset: Preset): { from: Date | null; to: Date | null } {
  const now = new Date()
  switch (preset) {
    case "last7":
      return { from: startOfDay(addDays(now, -7)), to: endOfDay(now) }
    case "last30":
      return { from: startOfDay(addDays(now, -30)), to: endOfDay(now) }
    case "next7":
      return { from: startOfDay(now), to: endOfDay(addDays(now, 7)) }
    case "next30":
      return { from: startOfDay(now), to: endOfDay(addDays(now, 30)) }
    default:
      return { from: null, to: null }
  }
}

/**
 * Generic client-side list: free-text search + a date filter + pagination.
 * The date filter adapts to the data: `getDate` → smart day presets (sessions);
 * `getMonth` → Ano/Mês dropdowns defaulting to the most recent year (faturas,
 * recibos — which are monthly records). Per-patient lists are small, so all of
 * this runs in the browser over the already-loaded items (no API change).
 */
export function FilteredPagedList<T>({
  items,
  getKey,
  getSearchText,
  renderItem,
  getDate,
  dateDirection = "past",
  getMonth,
  pageSize = 10,
  searchPlaceholder = "Buscar",
  emptyText,
}: FilteredPagedListProps<T>) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  // Day-mode state
  const [preset, setPreset] = useState<Preset>(() => defaultPreset(dateDirection))
  const [fromText, setFromText] = useState("")
  const [toText, setToText] = useState("")
  // Month-mode state (null year = auto: most recent year present in the data)
  const [pickedYear, setPickedYear] = useState<number | "all" | null>(null)
  const [pickedMonth, setPickedMonth] = useState<number | "all">("all")

  const q = query.trim().toLowerCase()

  // Month-mode: distinct years (desc) + effective (auto-most-recent) year.
  const years = getMonth
    ? Array.from(new Set(items.map((i) => getMonth(i).year))).sort((a, b) => b - a)
    : []
  const effYear: number | "all" = getMonth ? (pickedYear ?? years[0] ?? "all") : "all"

  // Day-mode: resolve the active range.
  const { from, to } = getDate
    ? preset === "custom"
      ? { from: parseBrDate(fromText, false), to: parseBrDate(toText, true) }
      : presetRange(preset)
    : { from: null, to: null }

  const filtered = items.filter((it) => {
    if (q && !getSearchText(it).toLowerCase().includes(q)) return false
    if (getMonth) {
      const my = getMonth(it)
      if (effYear !== "all" && my.year !== effYear) return false
      if (pickedMonth !== "all" && my.month !== pickedMonth) return false
    } else if (getDate && (from || to)) {
      const iso = getDate(it)
      const d = iso ? new Date(iso) : null
      if (!d) return false
      if (from && d < from) return false
      if (to && d > to) return false
    }
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(0)
          }}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {getMonth ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={effYear === "all" ? "all" : String(effYear)}
            onChange={(e) => {
              setPickedYear(e.target.value === "all" ? "all" : Number(e.target.value))
              setPage(0)
            }}
            aria-label="Filtrar por ano"
            className={selectClass}
          >
            <option value="all">Todos os anos</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={pickedMonth === "all" ? "all" : String(pickedMonth)}
            onChange={(e) => {
              setPickedMonth(e.target.value === "all" ? "all" : Number(e.target.value))
              setPage(0)
            }}
            aria-label="Filtrar por mês"
            className={selectClass}
          >
            <option value="all">Todos os meses</option>
            {MONTH_LABEL.map((label, i) => (
              <option key={i} value={String(i + 1)}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ) : getDate ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value as Preset)
              setPage(0)
            }}
            aria-label="Filtrar por período"
            className={selectClass}
          >
            {PRESETS_BY_DIRECTION[dateDirection].map((p) => (
              <option key={p} value={p}>
                {PRESET_LABEL[p]}
              </option>
            ))}
          </select>
          {preset === "custom" && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">De</span>
                <div className="w-40">
                  <DatePickerInput
                    value={fromText}
                    onChange={(v) => {
                      setFromText(v)
                      setPage(0)
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">até</span>
                <div className="w-40">
                  <DatePickerInput
                    value={toText}
                    onChange={(v) => {
                      setToText(v)
                      setPage(0)
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          {items.length === 0 ? emptyText : "Nenhum resultado no período/busca. Ajuste o filtro."}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paged.map((it) => (
              <div key={getKey(it)}>{renderItem(it)}</div>
            ))}
          </div>
          {filtered.length > pageSize && (
            <Pagination page={safePage} pageSize={pageSize} total={filtered.length} onPage={setPage} />
          )}
        </>
      )}
    </div>
  )
}
