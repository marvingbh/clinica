"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/shared/components/ui/button"
import { PortalShell } from "../components/PortalShell"
import { ConsentToggles } from "../components/ConsentToggles"
import { UpdateDataDialog } from "../components/UpdateDataDialog"
import { usePortal } from "../components/PortalSessionProvider"

export default function DadosPage() {
  return (
    <PortalShell>
      <MyData />
    </PortalShell>
  )
}

function MyData() {
  const { slug, activeProfile, me } = usePortal()
  const [showUpdate, setShowUpdate] = useState(false)
  const [lgpdBusy, setLgpdBusy] = useState(false)
  const readOnly = me?.access === "read_only"

  if (!activeProfile) {
    return <p className="text-sm text-muted-foreground">Perfil indisponível.</p>
  }

  async function requestLgpd() {
    setLgpdBusy(true)
    try {
      const res = await fetch(`/api/public/portal/${slug}/profile/lgpd-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: activeProfile!.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Não foi possível registrar a solicitação.")
        return
      }
      toast.success("Solicitação registrada. A clínica responderá pelos seus contatos cadastrados.")
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setLgpdBusy(false)
    }
  }

  const addr = [
    activeProfile.addressStreet,
    activeProfile.addressNumber,
    activeProfile.addressNeighborhood,
    activeProfile.addressCity,
    activeProfile.addressState,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Meus dados</h1>

      <div className="bg-card border border-border rounded-lg p-4 space-y-2 text-sm">
        <Row label="Nome" value={activeProfile.name} />
        <Row label="Telefone" value={activeProfile.phone} />
        <Row label="E-mail" value={activeProfile.email ?? "—"} />
        <Row label="Endereço" value={addr || "—"} />
      </div>

      {!readOnly && (
        <Button variant="outlined" onClick={() => setShowUpdate(true)}>
          Solicitar alteração
        </Button>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Preferências de contato</h2>
        <ConsentToggles />
      </section>

      <section className="space-y-2 border-t border-border pt-4">
        <Button variant="text" disabled={lgpdBusy || readOnly} onClick={requestLgpd}>
          Solicitar meus dados (LGPD)
        </Button>
      </section>

      {showUpdate && <UpdateDataDialog profile={activeProfile} onClose={() => setShowUpdate(false)} />}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  )
}
