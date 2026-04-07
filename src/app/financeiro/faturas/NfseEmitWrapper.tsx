"use client"

import { useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { toast } from "sonner"
import NfseEmissionDialog from "./[id]/NfseEmissionDialog"

interface NfseEmitWrapperProps {
  invoiceId: string
  onClose: () => void
  onSuccess: () => void
}

export function NfseEmitWrapper({ invoiceId, onClose, onSuccess }: NfseEmitWrapperProps) {
  const [ready, setReady] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inv, setInv] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cfg, setCfg] = useState<any>(null)

  useEffect(() => {
    async function load() {
      try {
        const [invRes, cfgRes] = await Promise.all([
          fetch(`/api/financeiro/faturas/${invoiceId}`),
          fetch("/api/admin/settings/nfse"),
        ])
        if (!invRes.ok) { toast.error("Erro ao carregar fatura"); onClose(); return }
        const invData = await invRes.json()
        const cfgData = cfgRes.ok ? await cfgRes.json() : null
        setInv(invData)
        setCfg(cfgData?.config ?? null)
        setReady(true)
      } catch {
        toast.error("Erro ao carregar dados para NFS-e")
        onClose()
      }
    }
    load()
  }, [invoiceId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !inv) return null

  const p = inv.patient

  return (
    <NfseEmissionDialog
      invoiceId={inv.id}
      patientId={p.id}
      patientName={p.name}
      patientCpf={p.cpf}
      patientCpfNota={p.billingCpf}
      patientBillingName={p.billingResponsibleName}
      patientAddress={{
        street: p.addressStreet,
        number: p.addressNumber,
        neighborhood: p.addressNeighborhood,
        city: p.addressCity,
        state: p.addressState,
        zip: p.addressZip,
      }}
      totalAmount={String(inv.totalAmount)}
      nfseObs={p.nfseObs}
      defaultCodigoServico={cfg?.codigoServico ?? ""}
      defaultCodigoNbs={cfg?.codigoNbs ?? ""}
      defaultCClassNbs={cfg?.cClassNbs ?? ""}
      defaultDescricao={cfg?.descricaoServico ?? ""}
      defaultAliquotaIss={cfg?.aliquotaIss ?? 0}
      onClose={onClose}
      onSuccess={() => { onSuccess(); onClose() }}
    />
  )
}
