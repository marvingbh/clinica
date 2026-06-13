"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useMountEffect, usePermission } from "@/shared/hooks"
import type { FormResponseStatus, FormSentVia } from "@prisma/client"
import { ResponseStatusChip } from "@/app/formularios/components/ResponseStatusChip"
import { SendFormDialog } from "@/app/formularios/components/SendFormDialog"

interface ResponseRow {
  id: string
  templateName: string
  version: number
  status: FormResponseStatus
  sentVia: FormSentVia
  sentAt: string
  expiresAt: string
  completedAt: string | null
  professionalName: string | null
}

interface PatientFormsSectionProps {
  patientId: string
  patientName: string
}

/** "Formulários" section of the patient details view: list + send + actions. */
export function PatientFormsSection({ patientId, patientName }: PatientFormsSectionProps) {
  const router = useRouter()
  const { canRead, canWrite } = usePermission("forms")
  const [rows, setRows] = useState<ResponseRow[] | null>(null)
  const [showSend, setShowSend] = useState(false)

  async function reload() {
    const res = await fetch(`/api/forms/responses?patientId=${patientId}`)
    setRows(res.ok ? (await res.json()).responses : [])
  }

  useMountEffect(() => {
    if (canRead) void reload()
  })

  async function cancelSend(id: string) {
    const res = await fetch(`/api/forms/responses/${id}/cancel`, { method: "POST" })
    if (res.ok) {
      toast.success("Envio cancelado")
      void reload()
    } else {
      toast.error("Não foi possível cancelar")
    }
  }

  async function resend(id: string) {
    const res = await fetch(`/api/forms/responses/${id}/resend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    if (res.ok) {
      toast.success("Link reenviado")
      void reload()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? "Não foi possível reenviar")
    }
  }

  if (!canRead) return null

  return (
    <section className="rounded-xl border border-ink-100 bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink-900">Formulários</h3>
        {canWrite && (
          <button onClick={() => setShowSend(true)} className="rounded-lg bg-ink-900 text-white px-3 py-1.5 text-[13px]">
            Enviar formulário
          </button>
        )}
      </div>

      <div className="mt-3">
        {rows === null ? (
          <p className="text-[13px] text-ink-500">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-ink-400">Nenhum formulário enviado.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2">
                <div>
                  <p className="text-[14px] text-ink-900">
                    {r.templateName} <span className="text-[12px] text-ink-400">v{r.version}</span>
                  </p>
                  <p className="text-[12px] text-ink-500">
                    Enviado em {new Date(r.sentAt).toLocaleDateString("pt-BR")}
                    {r.completedAt ? ` • Concluído em ${new Date(r.completedAt).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ResponseStatusChip status={r.status} />
                  {r.status === "CONCLUIDO" ? (
                    <button
                      onClick={() => router.push(`/formularios/respostas/${r.id}`)}
                      className="text-[12px] text-ink-600 hover:underline"
                    >
                      Ver
                    </button>
                  ) : canWrite ? (
                    <>
                      <button onClick={() => resend(r.id)} className="text-[12px] text-ink-600 hover:underline">
                        Reenviar
                      </button>
                      {r.status !== "EXPIRADO" && (
                        <button onClick={() => cancelSend(r.id)} className="text-[12px] text-red-500 hover:underline">
                          Cancelar
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showSend && (
        <SendFormDialog
          patientId={patientId}
          patientName={patientName}
          onClose={() => setShowSend(false)}
          onSent={() => void reload()}
        />
      )}
    </section>
  )
}
