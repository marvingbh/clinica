"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Copy, AlertTriangle } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import { Input, Button } from "@/shared/components/ui"
import type { ProfessionalRow } from "./types"

export function ProfessionalBookingTable({ clinicSlug }: { clinicSlug: string }) {
  const [rows, setRows] = useState<ProfessionalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  useMountEffect(() => {
    void load()
  })

  async function load() {
    try {
      const res = await fetch("/api/clinic/booking-settings/professionals")
      if (res.ok) {
        const data = await res.json()
        setRows(data.professionals)
      }
    } finally {
      setLoading(false)
    }
  }

  async function patch(row: ProfessionalRow, body: Record<string, unknown>) {
    setSavingId(row.id)
    try {
      const res = await fetch(`/api/professionals/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Erro ao salvar")
        await load()
        return
      }
      toast.success("Profissional atualizado")
      await load()
    } catch {
      toast.error("Erro de conexão")
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return <div className="h-32 bg-muted rounded animate-pulse" />
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-foreground">Profissionais</h2>
      <ul className="space-y-3">
        {rows.map((row) => (
          <ProfessionalCard
            key={row.id}
            row={row}
            clinicSlug={clinicSlug}
            saving={savingId === row.id}
            onToggle={(v) => patch(row, { allowOnlineBooking: v })}
            onSlug={(slug) => patch(row, { publicBookingSlug: slug })}
          />
        ))}
      </ul>
    </section>
  )
}

function ProfessionalCard({
  row,
  clinicSlug,
  saving,
  onToggle,
  onSlug,
}: {
  row: ProfessionalRow
  clinicSlug: string
  saving: boolean
  onToggle: (value: boolean) => void
  onSlug: (slug: string) => void
}) {
  const [slug, setSlug] = useState(row.publicBookingSlug ?? "")
  const deepLink =
    typeof window !== "undefined" && clinicSlug && row.publicBookingSlug
      ? `${window.location.origin}/agendar/${clinicSlug}/${row.publicBookingSlug}`
      : ""

  return (
    <li className="p-4 rounded-lg border border-border bg-card space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">{row.name}</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={row.allowOnlineBooking}
            disabled={saving}
            onChange={(e) => onToggle(e.target.checked)}
          />
          Listado
        </label>
      </div>

      {!row.hasAvailability && (
        <a
          href="/settings/availability"
          className="flex items-center gap-1.5 text-xs text-warn-700"
        >
          <AlertTriangle size={13} />
          Sem disponibilidade cadastrada
        </a>
      )}

      <div className="flex items-end gap-2">
        <Input
          label="Link público"
          value={slug}
          placeholder="ex: ana-silva"
          onChange={(e) => setSlug(e.target.value)}
        />
        <Button variant="secondary" size="sm" disabled={saving} onClick={() => onSlug(slug)}>
          Salvar
        </Button>
      </div>

      {deepLink && (
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate">{deepLink}</code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(deepLink)
              toast.success("Link copiado")
            }}
          >
            <Copy size={15} />
          </Button>
        </div>
      )}
    </li>
  )
}
