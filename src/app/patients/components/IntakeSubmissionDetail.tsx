"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { formatPhoneDisplay, formatCpfCnpjDisplay } from "@/lib/intake"
import type { IntakeSubmission } from "@prisma/client"
import { IntakeApprovalPanel } from "./IntakeApprovalPanel"

interface IntakeSubmissionDetailProps {
  id: string
  canWrite: boolean
  onBack: () => void
}

type ViewMode = "review" | "approve-edit" | "post-save"

const FIRST_SESSION_TITLE = "Reunião com responsáveis"

function formatDate(dateStr: string | Date) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value || "—"}</dd>
    </div>
  )
}

export function IntakeSubmissionDetail({ id, canWrite, onBack }: IntakeSubmissionDetailProps) {
  const router = useRouter()
  const [submission, setSubmission] = useState<IntakeSubmission | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("review")
  const [approvedPatientId, setApprovedPatientId] = useState<string | null>(null)

  useMountEffect(() => {
    const controller = new AbortController()

    ;(async () => {
      try {
        const response = await fetch(`/api/intake-submissions/${id}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error()
        setSubmission(await response.json())
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setError("Erro ao carregar ficha")
      } finally {
        setIsLoading(false)
      }
    })()

    return () => controller.abort()
  })

  function handleStartApproveEdit() {
    setError("")
    setViewMode("approve-edit")
  }

  function handleApproved(patientId: string) {
    setApprovedPatientId(patientId)
    setViewMode("post-save")
  }

  function handleScheduleFirstSession() {
    if (!approvedPatientId) return
    const params = new URLSearchParams({
      newAppointment: "1",
      patientId: approvedPatientId,
      title: FIRST_SESSION_TITLE,
    })
    router.push(`/agenda?${params.toString()}`)
  }

  async function handleReject() {
    if (!submission) return
    setIsProcessing(true)
    setError("")

    try {
      const response = await fetch(`/api/intake-submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "Erro ao rejeitar ficha")
        setIsProcessing(false)
        return
      }

      toast.success("Ficha rejeitada")
      onBack()
    } catch {
      setError("Erro de conexao. Tente novamente.")
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-32 bg-muted rounded" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded" />
        ))}
      </div>
    )
  }

  if (error && !submission) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">{error}</p>
        <button onClick={onBack} className="mt-4 text-sm text-primary hover:underline">
          Voltar
        </button>
      </div>
    )
  }

  if (!submission) return null

  // Approve-edit mode: render the patient form pre-filled with the
  // intake submission. The form owns the API call (via the new approve
  // endpoint with operator overrides).
  if (viewMode === "approve-edit") {
    return (
      <IntakeApprovalPanel
        submission={submission}
        onApproved={handleApproved}
        onCancel={() => setViewMode("review")}
      />
    )
  }

  // Post-save mode: brief success block with "schedule first session"
  // CTA. Skipping the schedule is one click ("Concluído" → onBack).
  if (viewMode === "post-save") {
    return (
      <div className="space-y-6 text-center py-6">
        <div className="space-y-2">
          <div className="text-2xl">✓</div>
          <h2 className="text-lg font-semibold text-foreground">Paciente criado</h2>
          <p className="text-sm text-muted-foreground">
            A ficha foi aprovada e o paciente está disponível em /pacientes.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={handleScheduleFirstSession}
            className="h-11 px-6 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Agendar primeira sessão
          </button>
          <button
            onClick={onBack}
            className="h-11 px-6 rounded-md border border-input text-foreground font-medium hover:bg-muted transition-colors"
          >
            Concluído
          </button>
        </div>
      </div>
    )
  }

  const isPending = submission.status === "PENDING"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Voltar para lista
        </button>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          submission.status === "PENDING"
            ? "bg-yellow-100 text-yellow-800"
            : submission.status === "APPROVED"
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800"
        }`}>
          {submission.status === "PENDING" ? "Pendente" : submission.status === "APPROVED" ? "Aprovada" : "Rejeitada"}
        </span>
      </div>

      <h2 className="text-lg font-semibold text-foreground">{submission.childName}</h2>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {/* Child info */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">Dados da Crianca</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome" value={submission.childName} />
          <Field label="Data de nascimento" value={formatDate(submission.childBirthDate)} />
          <Field label="Escola" value={submission.schoolName} />
          <Field label="Unidade" value={submission.schoolUnit} />
          <Field label="Turno" value={submission.schoolShift} />
        </dl>
      </section>

      {/* Parents */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">Pais</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome do pai" value={submission.fatherName} />
          <Field label="Telefone do pai" value={submission.fatherPhone ? formatPhoneDisplay(submission.fatherPhone) : null} />
          <Field label="Nome da mae" value={submission.motherName} />
          <Field label="Telefone da mae" value={submission.motherPhone ? formatPhoneDisplay(submission.motherPhone) : null} />
        </dl>
      </section>

      {/* Guardian */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">Responsavel Financeiro</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome" value={submission.guardianName} />
          <Field label="CPF/CNPJ" value={formatCpfCnpjDisplay(submission.guardianCpfCnpj)} />
          <Field label="Telefone" value={formatPhoneDisplay(submission.phone)} />
          <Field label="Email" value={submission.email} />
        </dl>
      </section>

      {/* Address */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">Endereco</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Rua" value={submission.addressStreet} />
          <Field label="Numero" value={submission.addressNumber} />
          <Field label="Bairro" value={submission.addressNeighborhood} />
          <Field label="Cidade" value={submission.addressCity} />
          <Field label="UF" value={submission.addressState} />
          <Field label="CEP" value={submission.addressZip} />
        </dl>
      </section>

      {/* Consents */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">Autorizacoes</h3>
        <dl className="space-y-2">
          <Field
            label="Gravacao das sessoes"
            value={submission.consentSessionRecording ? "Sim" : "Nao"}
          />
        </dl>
      </section>

      {/* Metadata */}
      <section className="text-xs text-muted-foreground">
        Enviada em {formatDate(submission.submittedAt)}{" "}
        {submission.ipAddress && `(IP: ${submission.ipAddress})`}
      </section>

      {/* Actions */}
      {isPending && canWrite && (
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleStartApproveEdit}
            disabled={isProcessing}
            className="flex-1 h-11 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Aprovar
          </button>
          <button
            onClick={handleReject}
            disabled={isProcessing}
            className="h-11 px-6 rounded-md border border-destructive text-destructive font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            Rejeitar
          </button>
        </div>
      )}
    </div>
  )
}
