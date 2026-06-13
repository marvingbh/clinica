"use client"

import { useState } from "react"
import { toast } from "sonner"
import { FileText } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import {
  DocumentWizardSheet,
  DocumentsList,
  SendDocumentDialog,
  type GeneratedDocumentDTO,
} from "@/shared/components/documents"
import { DocumentSignaturesPanel } from "./DocumentSignaturesPanel"
import type { SignerDefaults } from "./SendForSignatureDialog"

interface Props {
  patientId: string
  patientEmail: string | null
  patientPhone: string
  patientName: string
  patientCpf: string | null
  patientBirthDate: string | null
  guardianName: string | null
  guardianCpf: string | null
  guardianPhone: string | null
  canWrite: boolean
}

function computeIsMinor(birthDate: string | null): boolean {
  if (!birthDate) return false
  const d = new Date(birthDate)
  if (isNaN(d.getTime())) return false
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return age < 18
}

export function DocumentsTab({
  patientId,
  patientEmail,
  patientPhone,
  patientName,
  patientCpf,
  patientBirthDate,
  guardianName,
  guardianCpf,
  guardianPhone,
  canWrite,
}: Props) {
  const [documents, setDocuments] = useState<GeneratedDocumentDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [sendDoc, setSendDoc] = useState<GeneratedDocumentDTO | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/documents?patientId=${patientId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDocuments(data.documents ?? [])
    } catch {
      toast.error("Erro ao carregar documentos")
    } finally {
      setLoading(false)
    }
  }

  useMountEffect(() => {
    load()
  })

  const isMinor = computeIsMinor(patientBirthDate)
  const defaultSigners: SignerDefaults[] = isMinor
    ? [{ name: guardianName ?? "", cpf: guardianCpf ?? undefined, phone: guardianPhone ?? patientPhone ?? undefined, email: patientEmail ?? undefined, role: "RESPONSAVEL" }]
    : [{ name: patientName, cpf: patientCpf ?? undefined, email: patientEmail ?? undefined, phone: patientPhone ?? undefined, role: "PACIENTE" }]

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            <FileText className="h-4 w-4" /> Novo documento
          </button>
        </div>
      )}

      <DocumentsList documents={documents} loading={loading} onSend={(d) => setSendDoc(d)} />

      {!loading && documents.length > 0 && (
        <DocumentSignaturesPanel
          patientId={patientId}
          documents={documents}
          isMinor={isMinor}
          canWrite={canWrite}
          defaultSigners={defaultSigners}
        />
      )}

      {wizardOpen && (
        <DocumentWizardSheet
          key={patientId}
          isOpen={wizardOpen}
          onClose={() => setWizardOpen(false)}
          seed={{ patientId }}
          onGenerated={load}
        />
      )}

      {sendDoc && (
        <SendDocumentDialog
          isOpen={!!sendDoc}
          onClose={() => setSendDoc(null)}
          documentId={sendDoc.id}
          defaultEmail={patientEmail}
          defaultPhone={patientPhone}
          onSent={load}
        />
      )}
    </div>
  )
}
