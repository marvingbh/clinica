"use client"

// eslint-disable-next-line no-restricted-imports
import { useEffect, useState } from "react"
import type { RecurrenceForSlot } from "@/lib/appointments/recurrence-slots"
import type { AvailabilityRule, Professional } from "../../lib/types"

interface UseRecurrenceDataResult {
  recurrences: RecurrenceForSlot[]
  professionals: Professional[]
  /** Active availability rules for the selected professional. Empty in "Todos" mode. */
  availabilityRules: AvailabilityRule[]
  /** Appointment duration (minutes) for the selected professional. Default 50. */
  appointmentDuration: number
  isLoading: boolean
  error: string | null
}

interface ApiRow {
  id: string
  type: string
  title: string | null
  recurrenceType: "WEEKLY" | "BIWEEKLY" | "MONTHLY"
  dayOfWeek: number
  startTime: string
  endTime: string
  duration: number
  startDate: string
  endDate: string | null
  professionalProfileId: string
  professionalProfile: { user: { name: string } } | null
  patientId: string | null
  patient: { id: string; name: string } | null
  additionalProfessionals: Array<{
    professionalProfileId: string
    professionalProfile: { user: { name: string } } | null
  }>
  groupMemberCount?: number
}

const DEFAULT_DURATION = 50

function toRow(r: ApiRow): RecurrenceForSlot {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    recurrenceType: r.recurrenceType,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
    duration: r.duration,
    startDate: r.startDate,
    endDate: r.endDate,
    professionalProfileId: r.professionalProfileId,
    professionalName: r.professionalProfile?.user?.name ?? null,
    patientId: r.patientId,
    patientName: r.patient?.name ?? null,
    additionalProfessionalIds: r.additionalProfessionals.map((a) => a.professionalProfileId),
    groupMemberCount: r.groupMemberCount,
  }
}

export function useRecurrenceData(
  selectedProfessionalId: string,
  isAdmin: boolean,
): UseRecurrenceDataResult {
  const [recurrences, setRecurrences] = useState<RecurrenceForSlot[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    const qs = selectedProfessionalId
      ? `?professionalProfileId=${encodeURIComponent(selectedProfessionalId)}`
      : ""
    fetch(`/api/appointments/recurrences/slots${qs}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelled) return
        const rows = (data.recurrences as ApiRow[]).map(toRow)
        setRecurrences(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar recorrências")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedProfessionalId])

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    fetch("/api/professionals")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setProfessionals(data.professionals ?? [])
      })
      .catch(() => {
        /* non-fatal: prof list is admin-only */
      })
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  // Availability rules only make sense in single-professional mode — different
  // pros have different schedules and combining them would surface false free
  // slots.
  useEffect(() => {
    if (!selectedProfessionalId) {
      setAvailabilityRules([])
      return
    }
    let cancelled = false
    fetch(`/api/availability?professionalProfileId=${encodeURIComponent(selectedProfessionalId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setAvailabilityRules((data.rules as AvailabilityRule[]) ?? [])
      })
      .catch(() => {
        if (!cancelled) setAvailabilityRules([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedProfessionalId])

  const appointmentDuration =
    professionals.find((p) => p.professionalProfile?.id === selectedProfessionalId)?.professionalProfile
      ?.appointmentDuration ?? DEFAULT_DURATION

  return { recurrences, professionals, availabilityRules, appointmentDuration, isLoading, error }
}
