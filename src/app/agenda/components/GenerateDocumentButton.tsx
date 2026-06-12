"use client"

import { useState } from "react"
import { FileText } from "lucide-react"
import { usePermission } from "@/shared/hooks"
import { DocumentWizardSheet } from "@/shared/components/documents"

interface Props {
  appointmentId: string
  patientId: string
  /** Appointment type — only CONSULTA offers the action. */
  type: string
}

/**
 * "Gerar documento" action on a CONSULTA detail (Flow 1). Opens the document
 * wizard pre-seeded with the appointment so a declaração de comparecimento is
 * two clicks away.
 */
export function GenerateDocumentButton({ appointmentId, patientId, type }: Props) {
  const { canWrite } = usePermission("documents")
  const [open, setOpen] = useState(false)

  if (type !== "CONSULTA" || !patientId || !canWrite) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 ml-2 inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted"
      >
        <FileText className="h-3.5 w-3.5" /> Gerar documento
      </button>
      {open && (
        <DocumentWizardSheet
          key={`${patientId}-${appointmentId}`}
          isOpen={open}
          onClose={() => setOpen(false)}
          seed={{ patientId, appointmentId, defaultType: "DECLARACAO_COMPARECIMENTO" }}
          onGenerated={() => setOpen(false)}
        />
      )}
    </>
  )
}
