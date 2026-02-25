"use client"

import { useFinanceiroContext } from "../context/FinanceiroContext"

const SHORT_MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

export function FinanceiroFilterBar() {
  const { year, month, setYear, setMonth } = useFinanceiroContext()

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <button
        onClick={() => setYear(year - 1)}
        className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
      >
        &larr;
      </button>
      <span className="text-lg font-semibold">{year}</span>
      <button
        onClick={() => setYear(year + 1)}
        className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
      >
        &rarr;
      </button>

      <div className="flex gap-1 ml-2 flex-wrap">
        <button
          onClick={() => setMonth(null)}
          className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
            month === null
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          Ano todo
        </button>
        {SHORT_MONTHS.map((name, i) => (
          <button
            key={i}
            onClick={() => setMonth(i + 1)}
            className={`px-2.5 py-1.5 text-xs rounded-full transition-colors ${
              month === i + 1
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}
