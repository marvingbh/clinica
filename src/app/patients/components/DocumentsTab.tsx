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

interface Props {
  patientId: string
  patientEmail: string | null
  patientPhone: string
  canWrite: boolean
}

export function DocumentsTab({ patientId, patientEmail, patientPhone, canWrite }: Props) {
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
