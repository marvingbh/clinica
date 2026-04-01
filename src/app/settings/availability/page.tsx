"use client"

import { Suspense, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { SkeletonPage, SlotPicker } from "@/shared/components/ui"
import type { DayData } from "@/shared/components/ui"
import { useRequireAuth, useHasMounted, usePermission } from "@/shared/hooks"

// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { ExceptionsList, ExceptionEditorModal } from "./components"
import type {
  TimeBlock,
  AvailabilityException,
  Professional,
  EditingException,
} from "./components"
import { DAYS_OF_WEEK } from "./components"

// --- Data conversion: TimeBlock[] <-> DayData[] ---

function rulesToDays(rules: TimeBlock[]): DayData[] {
  return DAYS_OF_WEEK.map((day) => {
    const dayRules = rules.filter((r) => r.dayOfWeek === day.value)
    return {
      id: String(day.value),
      label: day.label,
      shortLabel: day.short,
      enabled: dayRules.length > 0 && dayRules.some((r) => r.isActive),
      slots: dayRules.map((r) => ({
        id: r.id || crypto.randomUUID(),
        from: r.startTime,
        to: r.endTime,
      })),
    }
  })
}

function daysToRules(days: DayData[]): TimeBlock[] {
  return days.flatMap((day) =>
    day.slots.map((slot) => ({
      dayOfWeek: Number(day.id),
      startTime: slot.from,
      endTime: slot.to,
      isActive: day.enabled,
    }))
  )
}

// --- Date utilities for Brazilian format ---

function toDisplayDateFromDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function toDisplayDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return isoDate
  const datePart = isoDate.split("T")[0]
  const [year, month, day] = datePart.split("-")
  return `${day}/${month}/${year}`
}

function toIsoDate(displayDate: string): string {
  if (!displayDate) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(displayDate)) return displayDate
  const match = displayDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return displayDate
  const [, day, month, year] = match
  return `${year}-${month}-${day}`
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-background pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <SkeletonPage />
      </div>
    </main>
  )
}

export default function AvailabilitySettingsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AvailabilitySettingsContent />
    </Suspense>
  )
}

function AvailabilitySettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isReady, status } = useRequireAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const isMounted = useHasMounted()
  const [rules, setRules] = useState<TimeBlock[]>([])

  // Exceptions state
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([])
  const [editingException, setEditingException] = useState<EditingException | null>(null)
  const [isDeletingException, setIsDeletingException] = useState<string | null>(null)

  // ADMIN-only: professional selection
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null)
  const professionalIdParam = searchParams.get("professionalId")

  const { canRead: canReadOthersAvail } = usePermission("availability_others")
  const isAdmin = canReadOthersAvail

  // Derive DayData[] from rules for SlotPicker
  const days = rulesToDays(rules)

  const handleScheduleUpdate = useCallback((updatedDays: DayData[]) => {
    setRules(daysToRules(updatedDays))
  }, [])

  // Data fetch
  useEffect(() => {
    if (!isReady) return

    const abortController = new AbortController()
    const signal = abortController.signal

    async function loadData() {
      try {
        let professionalsData: Professional[] = []

        if (isAdmin) {
          const profResponse = await fetch("/api/professionals?isActive=true", { signal })
          if (signal.aborted) return
          if (profResponse.ok) {
            const profData = await profResponse.json()
            professionalsData = profData.professionals || []
            setProfessionals(professionalsData)
          }
        }

        let profileId: string | undefined

        if (isAdmin && professionalIdParam) {
          setSelectedProfessionalId(professionalIdParam)
          const foundProf = professionalsData.find(
            (p: Professional) => p.id === professionalIdParam
          )
          profileId = foundProf?.professionalProfile?.id
        }

        if (signal.aborted) return

        const params = new URLSearchParams()
        if (profileId) params.set("professionalProfileId", profileId)

        const [availResponse, exceptionsResponse] = await Promise.all([
          fetch(`/api/availability?${params.toString()}`, { signal }),
          fetch(`/api/availability/exceptions?${params.toString()}`, { signal }),
        ])

        if (signal.aborted) return

        if (!availResponse.ok) {
          if (availResponse.status === 403) {
            toast.error("Acesso negado")
            router.push("/")
            return
          }
          throw new Error("Failed to fetch availability")
        }

        const [availData, exceptionsData] = await Promise.all([
          availResponse.json(),
          exceptionsResponse.ok ? exceptionsResponse.json() : { exceptions: [] },
        ])

        if (signal.aborted) return

        const dateExceptions = (exceptionsData.exceptions || []).filter(
          (ex: AvailabilityException) => !ex.isRecurring
        )

        setRules(availData.rules || [])
        setExceptions(dateExceptions)
      } catch {
        if (signal.aborted) return
        toast.error("Erro ao carregar disponibilidade")
      } finally {
        if (!signal.aborted) setIsLoading(false)
      }
    }

    loadData()
    return () => { abortController.abort() }
  }, [isReady, isAdmin, professionalIdParam, router])

  async function fetchAvailabilityForProfessional(profileId?: string | null) {
    try {
      const params = new URLSearchParams()
      if (profileId) params.set("professionalProfileId", profileId)

      const [availResponse, exceptionsResponse] = await Promise.all([
        fetch(`/api/availability?${params.toString()}`),
        fetch(`/api/availability/exceptions?${params.toString()}`),
      ])

      if (!availResponse.ok) throw new Error("Failed to fetch availability")

      const [availData, exceptionsData] = await Promise.all([
        availResponse.json(),
        exceptionsResponse.ok ? exceptionsResponse.json() : { exceptions: [] },
      ])

      const dateExceptions = (exceptionsData.exceptions || []).filter(
        (ex: AvailabilityException) => !ex.isRecurring
      )

      setRules(availData.rules || [])
      setExceptions(dateExceptions)
    } catch {
      toast.error("Erro ao carregar disponibilidade")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleProfessionalChange(professionalId: string) {
    setSelectedProfessionalId(professionalId)
    setIsLoading(true)
    const prof = professionals.find((p) => p.id === professionalId)
    if (prof?.professionalProfile?.id) {
      await fetchAvailabilityForProfessional(prof.professionalProfile.id)
    } else {
      setRules([])
      setExceptions([])
      setIsLoading(false)
    }
  }

  async function saveAvailability() {
    setIsSaving(true)
    try {
      let professionalProfileId: string | undefined
      if (isAdmin && selectedProfessionalId) {
        const prof = professionals.find((p) => p.id === selectedProfessionalId)
        professionalProfileId = prof?.professionalProfile?.id
      }

      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalProfileId, rules }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save availability")
      }

      const data = await response.json()
      setRules(data.rules || [])
      toast.success("Disponibilidade salva com sucesso")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar disponibilidade")
    } finally {
      setIsSaving(false)
    }
  }

  // Exception handlers
  function openExceptionEditor(exception?: AvailabilityException) {
    if (exception) {
      setEditingException({
        id: exception.id,
        date: exception.date ? toDisplayDate(exception.date) : "",
        isAvailable: exception.isAvailable,
        startTime: exception.startTime,
        endTime: exception.endTime,
        reason: exception.reason,
        isFullDay: !exception.startTime && !exception.endTime,
        targetType: exception.isClinicWide ? "clinic" : "professional",
        targetProfessionalId: exception.isClinicWide ? null : selectedProfessionalId,
      })
    } else {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setEditingException({
        date: toDisplayDateFromDate(tomorrow),
        isAvailable: false,
        startTime: null,
        endTime: null,
        reason: null,
        isFullDay: true,
        targetType: isAdmin ? "clinic" : "professional",
        targetProfessionalId: null,
      })
    }
  }

  async function saveException() {
    if (!editingException) return

    const { date, isAvailable, startTime, endTime, reason, isFullDay, targetType, targetProfessionalId } = editingException

    if (!date) { toast.error("Selecione a data"); return }
    if (!isFullDay) {
      if (!startTime || !endTime) { toast.error("Selecione os horários de início e término"); return }
      if (startTime >= endTime) { toast.error("O horário de início deve ser anterior ao horário de término"); return }
    }
    if (targetType === "professional" && isAdmin && !targetProfessionalId) { toast.error("Selecione um profissional"); return }

    setIsSaving(true)
    try {
      let professionalProfileId: string | undefined
      const isClinicWide = targetType === "clinic"
      if (!isClinicWide && isAdmin && targetProfessionalId) {
        const prof = professionals.find((p) => p.id === targetProfessionalId)
        professionalProfileId = prof?.professionalProfile?.id
      }

      const response = await fetch("/api/availability/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalProfileId: isClinicWide ? null : professionalProfileId,
          isClinicWide,
          date: toIsoDate(date),
          dayOfWeek: null,
          isRecurring: false,
          isAvailable,
          startTime: isFullDay ? null : startTime,
          endTime: isFullDay ? null : endTime,
          reason: reason || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erro ao salvar exceção")
      }

      const data = await response.json()
      setExceptions([...exceptions, data.exception])
      toast.success(isAvailable ? "Disponibilidade extra adicionada" : "Bloqueio adicionado")
      setEditingException(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar exceção")
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteException(id: string) {
    setIsDeletingException(id)
    try {
      const response = await fetch(`/api/availability/exceptions/${id}`, { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erro ao excluir exceção")
      }
      setExceptions(exceptions.filter((e) => e.id !== id))
      toast.success("Exceção removida")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir exceção")
    } finally {
      setIsDeletingException(null)
    }
  }

  function formatExceptionDate(dateStr: string): string {
    const datePart = dateStr.split("T")[0]
    const date = new Date(datePart + "T12:00:00")
    return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
  }

  const activeCount = days.filter((d) => d.enabled).length

  if (status === "loading" || isLoading) return <LoadingState />

  return (
    <main className="min-h-screen bg-background pb-20">
      <div className="max-w-lg md:max-w-3xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors touch-manipulation"
            aria-label="Voltar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <h1 className="text-lg font-semibold text-foreground tracking-[-0.02em]">Disponibilidade</h1>
          <button
            onClick={saveAvailability}
            disabled={isSaving || (isAdmin && !selectedProfessionalId)}
            className="h-9 px-4 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>

        {/* Admin: Professional selector */}
        {isAdmin && professionals.length > 0 && (
          <div className="mb-5">
            <select
              id="professional"
              value={selectedProfessionalId || ""}
              onChange={(e) => handleProfessionalChange(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            >
              <option value="">Selecione um profissional</option>
              {professionals.map((prof) => (
                <option key={prof.id} value={prof.id}>{prof.name}</option>
              ))}
            </select>
          </div>
        )}

        {isAdmin && !selectedProfessionalId ? (
          <div className="rounded-2xl bg-muted/50 border border-transparent px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">Selecione um profissional para gerenciar a disponibilidade.</p>
          </div>
        ) : (
          <>
            {/* Summary pill */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[13px] text-muted-foreground">
                {activeCount === 0
                  ? "Nenhum dia ativo"
                  : `${activeCount} dia${activeCount > 1 ? "s" : ""} ativo${activeCount > 1 ? "s" : ""}`}
              </span>
              <span className="text-[13px] text-muted-foreground/50">&middot;</span>
              <span className="text-[13px] text-muted-foreground">
                {days.reduce((n, d) => n + (d.enabled ? d.slots.length : 0), 0)} horário(s)
              </span>
            </div>
            <SlotPicker days={days} onUpdate={handleScheduleUpdate} />
          </>
        )}

        <ExceptionsList
          exceptions={exceptions}
          isDeletingException={isDeletingException}
          onOpenExceptionEditor={openExceptionEditor}
          onDeleteException={deleteException}
          formatExceptionDate={formatExceptionDate}
        />
      </div>

      {editingException && isMounted && (
        <ExceptionEditorModal
          editingException={editingException}
          professionals={professionals}
          selectedProfessionalId={selectedProfessionalId}
          isAdmin={isAdmin}
          isSaving={isSaving}
          onSave={saveException}
          onClose={() => setEditingException(null)}
          onChange={setEditingException}
        />
      )}
    </main>
  )
}
