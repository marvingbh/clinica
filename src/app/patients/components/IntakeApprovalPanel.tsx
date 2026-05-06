"use client"

import { useCallback, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"
import { patientFormSchema, type PatientFormData } from "@/lib/patients/schema"
import {
  intakeSubmissionToFormData,
  buildPatientPayload,
} from "@/lib/patients/form-mappers"
import { PatientForm } from "./PatientForm"
import type { Professional, AdditionalPhone } from "./types"
import type { IntakeSubmission } from "@prisma/client"

interface Props {
  submission: IntakeSubmission
  onApproved: (patientId: string) => void
  onCancel: () => void
}

/**
 * Renders the patient form pre-filled with intake-submission data so the
 * operator can complete admin-only fields before approving. On save,
 * posts to the approve endpoint with the operator's overrides; the
 * server creates the Patient and flips the submission to APPROVED in
 * one transaction.
 */
export function IntakeApprovalPanel({ submission, onApproved, onCancel }: Props) {
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [isLoadingProfessionals, setIsLoadingProfessionals] = useState(true)
  const [billingMode, setBillingMode] = useState<string>("PER_SESSION")
  const [additionalPhones, setAdditionalPhones] = useState<AdditionalPhone[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: intakeSubmissionToFormData(submission),
  })

  useMountEffect(() => {
    fetch("/api/professionals")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setProfessionals(data?.professionals ?? [])
      })
      .catch(() => {
        // Form still works without the professional dropdown.
      })
      .finally(() => setIsLoadingProfessionals(false))

    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings?.billingMode) setBillingMode(data.settings.billingMode)
      })
      .catch(() => {})
  })

  const handleAddPhone = useCallback(() => {
    setAdditionalPhones((prev) => [
      ...prev,
      { id: undefined, phone: "", label: "", notify: true },
    ])
  }, [])

  const handleUpdatePhone = useCallback(
    (index: number, field: "phone" | "label" | "notify", value: string | boolean) => {
      setAdditionalPhones((prev) =>
        prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
      )
    },
    [],
  )

  const handleRemovePhone = useCallback((index: number) => {
    setAdditionalPhones((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const onSubmit = handleSubmit(async (data) => {
    setIsSaving(true)
    try {
      const patientBody = buildPatientPayload({ data, additionalPhones })
      const response = await fetch(`/api/intake-submissions/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", patient: patientBody }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error(result.error ?? "Erro ao aprovar ficha")
        return
      }
      toast.success("Paciente criado com sucesso")
      onApproved(result.patientId)
    } catch {
      toast.error("Erro de conexão ao aprovar a ficha")
    } finally {
      setIsSaving(false)
    }
  })

  return (
    <PatientForm
      register={register}
      errors={errors}
      control={control}
      professionals={professionals}
      isLoadingProfessionals={isLoadingProfessionals}
      additionalPhones={additionalPhones}
      isSaving={isSaving}
      isEditing={false}
      onAddPhone={handleAddPhone}
      onUpdatePhone={handleUpdatePhone}
      onRemovePhone={handleRemovePhone}
      onClose={onCancel}
      onSubmit={onSubmit}
      billingMode={billingMode}
    />
  )
}
