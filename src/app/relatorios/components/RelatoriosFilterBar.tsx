"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Segmented } from "@/shared/components/ui/segmented"
import { useMountEffect } from "@/shared/hooks"
import { useRelatorios, type Granularity } from "../context/RelatoriosContext"

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

interface ProfOption {
  id: string
  name: string
}

function currentLabel(g: Granularity, year: number, month: number, quarter: number): string {
  if (g === "month") return `${MONTH_NAMES[month - 1]} ${year}`
  if (g === "quarter") return `${quarter}º trimestre ${year}`
  return `${year}`
}

export function RelatoriosFilterBar() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "ADMIN"
  const {
    granularity, year, month, quarter, professionalId,
    setGranularity, setYear, setMonth, setQuarter, setProfessionalId,
  } = useRelatorios()

  const [profs, setProfs] = useState<ProfOption[]>([])

  useMountEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    fetch("/api/professionals")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const list: ProfOption[] = (d.professionals || [])
          .filter((p: { professionalProfile?: { id: string } }) => p.professionalProfile)
          .map((p: { name: string; professionalProfile: { id: string } }) => ({
            id: p.professionalProfile.id,
            name: p.name,
          }))
        setProfs(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  })

  function step(delta: number) {
    if (granularity === "month") {
      let m = month + delta
      let y = year
      while (m < 1) { m += 12; y-- }
      while (m > 12) { m -= 12; y++ }
      setMonth(m)
      setYear(y)
    } else if (granularity === "quarter") {
      let q = quarter + delta
      let y = year
      while (q < 1) { q += 4; y-- }
      while (q > 4) { q -= 4; y++ }
      setQuarter(q)
      setYear(y)
    } else {
      setYear(year + delta)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <Segmented<Granularity>
        ariaLabel="Granularidade"
        options={[
          { value: "month", label: "Mês" },
          { value: "quarter", label: "Trimestre" },
          { value: "year", label: "Ano" },
        ]}
        value={granularity}
        onChange={setGranularity}
        size="md"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Período anterior"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-base font-semibold min-w-[10rem] text-center">
          {currentLabel(granularity, year, month, quarter)}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Próximo período"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {isAdmin && (
        <select
          value={professionalId ?? ""}
          onChange={(e) => setProfessionalId(e.target.value || null)}
          className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos os profissionais</option>
          {profs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}
