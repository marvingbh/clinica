"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Copy } from "lucide-react"
import { Input, Button } from "@/shared/components/ui"
import type { BookingSettingsState } from "./types"

const MODALITIES: ("ONLINE" | "PRESENCIAL")[] = ["ONLINE", "PRESENCIAL"]

export function BookingSettingsForm({
  settings,
  clinicSlug,
  onUpdate,
}: {
  settings: BookingSettingsState
  clinicSlug: string
  onUpdate: (s: BookingSettingsState) => void
}) {
  const [form, setForm] = useState<BookingSettingsState>(settings)
  const [blockedText, setBlockedText] = useState(settings.blockedPhones.join("\n"))
  const [saving, setSaving] = useState(false)

  const publicUrl =
    typeof window !== "undefined" && clinicSlug
      ? `${window.location.origin}/agendar/${clinicSlug}`
      : ""

  function set<K extends keyof BookingSettingsState>(key: K, value: BookingSettingsState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleModality(m: "ONLINE" | "PRESENCIAL") {
    setForm((f) => {
      const has = f.allowedModalities.includes(m)
      const next = has ? f.allowedModalities.filter((x) => x !== m) : [...f.allowedModalities, m]
      return { ...f, allowedModalities: next.length ? next : f.allowedModalities }
    })
  }

  async function save() {
    setSaving(true)
    try {
      const blockedPhones = blockedText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
      const res = await fetch("/api/clinic/booking-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, blockedPhones }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Erro ao salvar")
        return
      }
      const data = await res.json()
      onUpdate(data.settings)
      setForm(data.settings)
      setBlockedText((data.settings.blockedPhones ?? []).join("\n"))
      toast.success("Configurações salvas")
    } catch {
      toast.error("Erro de conexão")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-foreground">Agendamento online</h2>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
        <span className="font-medium text-foreground">Habilitar agendamento online</span>
      </label>

      {publicUrl && (
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate">{publicUrl}</code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(publicUrl)
              toast.success("Link copiado")
            }}
          >
            <Copy size={15} />
          </Button>
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-foreground mb-1.5">Modo de confirmação</p>
        <div className="space-y-1.5">
          {(["APPROVAL_REQUIRED", "AUTO_CONFIRM"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                checked={form.mode === m}
                onChange={() => set("mode", m)}
              />
              {m === "APPROVAL_REQUIRED" ? "Aprovação manual (recomendado)" : "Confirmação automática"}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Duração padrão (min)"
          type="number"
          value={form.sessionDurationMinutes}
          onChange={(e) => set("sessionDurationMinutes", Number(e.target.value))}
        />
        <Input
          label="Antecedência mínima (h)"
          type="number"
          value={form.minAdvanceHours}
          onChange={(e) => set("minAdvanceHours", Number(e.target.value))}
        />
        <Input
          label="Horizonte (dias)"
          type="number"
          value={form.horizonDays}
          onChange={(e) => set("horizonDays", Number(e.target.value))}
        />
        <Input
          label="Máx. em aberto / telefone"
          type="number"
          value={form.maxOpenBookingsPerPhone}
          onChange={(e) => set("maxOpenBookingsPerPhone", Number(e.target.value))}
        />
      </div>

      <div>
        <p className="text-sm font-medium text-foreground mb-1.5">Modalidades permitidas</p>
        <div className="flex gap-4">
          {MODALITIES.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.allowedModalities.includes(m)}
                onChange={() => toggleModality(m)}
              />
              {m === "ONLINE" ? "Online" : "Presencial"}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-foreground">Telefones bloqueados (um por linha)</label>
        <textarea
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          rows={3}
          value={blockedText}
          onChange={(e) => setBlockedText(e.target.value)}
        />
      </div>

      <Button onClick={save} loading={saving} disabled={saving}>
        Salvar
      </Button>
    </section>
  )
}
