"use client"

import { useState } from "react"
import { toast } from "sonner"
import { DatePickerInput } from "@/shared/components/ui/date-picker-input"
import type { ReciboItemDTO } from "./types"

interface Props {
  patientId: string
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

function brToIso(value: string): string | null {
  const parts = value.split("/")
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  if (!d || !m || !y || y.length !== 4) return null
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
}

export function SessionItemsPicker({ patientId, selectedIds, onChange }: Props) {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [items, setItems] = useState<ReciboItemDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function loadItems() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ patientId })
      const fromIso = brToIso(from)
      const toIso = brToIso(to)
      if (fromIso) params.set("from", `${fromIso}T00:00:00.000Z`)
      if (toIso) params.set("to", `${toIso}T23:59:59.999Z`)
      const res = await fetch(`/api/documents/recibo-items?${params.toString()}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setItems(data.items ?? [])
      setLoaded(true)
      onChange((data.items ?? []).map((i: ReciboItemDTO) => i.id))
    } catch {
      toast.error("Erro ao carregar sessões pagas")
    } finally {
      setLoading(false)
    }
  }

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-muted-foreground mb-1">De</span>
          <DatePickerInput value={from} onChange={setFrom} placeholder="DD/MM/AAAA" />
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground mb-1">Até</span>
          <DatePickerInput value={to} onChange={setTo} placeholder="DD/MM/AAAA" />
        </label>
        <button
          type="button"
          onClick={loadItems}
          disabled={loading}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {loading ? "Buscando..." : "Buscar sessões"}
        </button>
      </div>

      {loaded && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma sessão paga encontrada no período selecionado
        </p>
      )}

      {items.length > 0 && (
        <ul className="divide-y rounded-md border">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.includes(it.id)}
                onChange={() => toggle(it.id)}
                className="h-4 w-4"
              />
              <span className="flex-1 truncate">{it.description}</span>
              <span className="font-medium">{it.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
