"use client"

import { useState } from "react"
import { toast } from "sonner"
import { FileSignature, Send, RotateCcw, XCircle, Download } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import { SignatureStatusBadge } from "./SignatureStatusBadge"
import { SendForSignatureDialog, type SignerDefaults } from "./SendForSignatureDialog"
import type { GeneratedDocumentDTO } from "@/shared/components/documents"

interface EnvelopeSigner {
  id: string
  name: string
  role: string
  signingOrder: number
  status: string
  expiresAt: string
}
interface Envelope {
  id: string
  status: string
  documentId: string
  verificationCode: string | null
  signers: EnvelopeSigner[]
}

interface Props {
  patientId: string
  documents: GeneratedDocumentDTO[]
  defaultSigners: SignerDefaults[]
  isMinor: boolean
  canWrite: boolean
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function DocumentSignaturesPanel({ patientId, documents, defaultSigners, isMinor, canWrite }: Props) {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([])
  const [loading, setLoading] = useState(true)
  const [sendDocId, setSendDocId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/assinaturas?patientId=${patientId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setEnvelopes(data.envelopes ?? [])
    } catch {
      // silent: panel is secondary
    } finally {
      setLoading(false)
    }
  }
  useMountEffect(() => { load() })

  function latestEnvelope(documentId: string): Envelope | undefined {
    return envelopes.find((e) => e.documentId === documentId)
  }

  async function resend(envelopeId: string, requestId: string) {
    const res = await fetch(`/api/assinaturas/${envelopeId}/resend`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }),
    })
    if (res.ok) { toast.success("Link reenviado."); load() } else {
      const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Erro ao reenviar")
    }
  }
  async function cancel(envelopeId: string) {
    const res = await fetch(`/api/assinaturas/${envelopeId}/cancel`, { method: "POST" })
    if (res.ok) { toast.success("Envio cancelado."); load() } else {
      const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Erro ao cancelar")
    }
  }

  if (documents.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <FileSignature className="h-4 w-4" /> Assinaturas
      </h3>
      {loading ? (
        <div className="h-8 w-full bg-muted rounded animate-pulse" />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Documento</th>
                <th className="px-3 py-2 text-left">Assinatura</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const env = latestEnvelope(doc.id)
                const active = env?.signers.find((s) => s.status === "PENDENTE" || s.status === "VISUALIZADO")
                return (
                  <tr key={doc.id} className="border-t">
                    <td className="px-3 py-2">{doc.title}</td>
                    <td className="px-3 py-2">
                      {env ? <SignatureStatusBadge status={env.status} /> : <span className="text-muted-foreground">—</span>}
                      {active && <span className="ml-2 text-xs text-muted-foreground">venc. {fmt(active.expiresAt)}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {canWrite && !env && (
                          <button type="button" onClick={() => setSendDocId(doc.id)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">
                            <Send className="h-3.5 w-3.5" /> Enviar para assinatura
                          </button>
                        )}
                        {canWrite && env && active && (
                          <>
                            <button type="button" onClick={() => resend(env.id, active.id)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">
                              <RotateCcw className="h-3.5 w-3.5" /> Reenviar
                            </button>
                            <button type="button" onClick={() => cancel(env.id)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted text-red-600">
                              <XCircle className="h-3.5 w-3.5" /> Cancelar
                            </button>
                          </>
                        )}
                        {env?.status === "CONCLUIDO" && (
                          <a href={`/api/assinaturas/${env.id}/arquivo`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">
                            <Download className="h-3.5 w-3.5" /> Via assinada
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {sendDocId && (
        <SendForSignatureDialog
          isOpen={!!sendDocId}
          onClose={() => setSendDocId(null)}
          documentId={sendDocId}
          defaultSigners={defaultSigners}
          isMinor={isMinor}
          onSent={load}
        />
      )}
    </div>
  )
}
