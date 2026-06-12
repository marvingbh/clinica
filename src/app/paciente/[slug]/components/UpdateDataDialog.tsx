"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/shared/components/ui/button"
import { usePortal } from "./PortalSessionProvider"
import type { PortalProfileSummary } from "./PortalSessionProvider"

const FIELDS: Array<{ key: keyof PortalProfileSummary; label: string }> = [
  { key: "name", label: "Nome" },
  { key: "phone", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "addressStreet", label: "Logradouro" },
  { key: "addressNumber", label: "Número" },
  { key: "addressNeighborhood", label: "Bairro" },
  { key: "addressCity", label: "Cidade" },
  { key: "addressState", label: "Estado" },
  { key: "addressZip", label: "CEP" },
]

export function UpdateDataDialog({
  profile,
  onClose,
}: {
  profile: PortalProfileSummary
  onClose: () => void
}) {
  const { slug } = usePortal()
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of FIELDS) init[f.key] = (profile[f.key] as string | null) ?? ""
    return init
  })
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const changes: Record<string, string | null> = {}
      for (const f of FIELDS) changes[f.key] = values[f.key] === "" ? null : values[f.key]
      const res = await fetch(`/api/public/portal/${slug}/profile/update-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: profile.id, changes }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Não foi possível enviar a solicitação.")
        return
      }
      toast.success("Alteração enviada para aprovação da clínica.")
      onClose()
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-foreground">Solicitar alteração</h2>
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="block text-xs font-medium text-muted-foreground">{f.label}</label>
            <input
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded bg-card text-foreground text-sm"
            />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="text" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Enviando..." : "Enviar"}
          </Button>
        </div>
      </div>
    </div>
  )
}
