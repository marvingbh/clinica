"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { SkeletonPage } from "@/shared/components/ui"
import { usePermission } from "@/shared/hooks/usePermission"
import {
  WeeklyScheduleGrid,
  ExceptionsList,
  TimeBlockEditorModal,
  ExceptionEditorModal,
} from "./components"
import type {
  TimeBlock,
  AvailabilityException,
  Professional,
  EditingBlock,
  EditingException,
} from "./components"

// Date utilities for Brazilian format
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
  console.log("=== AvailabilitySettingsContent RENDER ===")

  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  console.log("[Render] status:", status, "session:", !!session)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [rules, setRules] = useState<TimeBlock[]>([])
  const [editingBlock, setEditingBlock] = useState<EditingBlock | null>(null)

  // Exceptions state (date-specific only)
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([])
  const [editingException, setEditingException] = useState<EditingException | null>(null)
  const [isDeletingException, setIsDeletingException] = useState<string | null>(null)

  // ADMIN-only: professional selection
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null)
  const professionalIdParam = searchParams.get("professionalId")

  const { canRead: canReadOthersAvail } = usePermission("availability_others")
  const isAdmin = canReadOthersAvail

  // Effect 0: Set mounted state for portal rendering
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Effect 1: Handle authentication redirect
  useEffect(() => {
    console.log("[Auth Effect] status:", status)
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  // Effect 2: Fetch data when authenticated
  useEffect(() => {
    console.log("[Data Effect] Running. status:", status, "isAdmin:", isAdmin)

    if (status !== "authenticated") {
      console.log("[Data Effect] Not authenticated, skipping")
      return
    }

    // Use AbortController to cancel stale fetches
    const abortController = new AbortController()
    const signal = abortController.signal

    async function loadData() {
      console.log("[loadData] Starting fetch...")

      try {
        let professionalsData: Professional[] = []

        // Fetch professionals if admin
        if (isAdmin) {
          console.log("[loadData] Fetching professionals...")
          const profResponse = await fetch("/api/professionals?isActive=true", { signal })
          if (signal.aborted) return
          if (profResponse.ok) {
            const profData = await profResponse.json()
            professionalsData = profData.professionals || []
            setProfessionals(professionalsData)
          }
        }

        // Determine which profile to fetch availability for
        let profileId: string | undefined

        if (isAdmin && professionalIdParam) {
          setSelectedProfessionalId(professionalIdParam)
          const foundProf = professionalsData.find(
            (p: Professional) => p.id === professionalIdParam
          )
          profileId = foundProf?.professionalProfile?.id
        }

        if (signal.aborted) return

        // Fetch availability
        const params = new URLSearchParams()
        if (profileId) {
          params.set("professionalProfileId", profileId)
        }

        console.log("[loadData] Fetching availability and exceptions...")
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

        // Filter to only date-specific exceptions (ignore recurring)
        const dateExceptions = (exceptionsData.exceptions || []).filter(
          (ex: AvailabilityException) => !ex.isRecurring
        )

        console.log("[loadData] Setting state. rules:", availData.rules?.length, "exceptions:", dateExceptions.length)
        setRules(availData.rules || [])
        setExceptions(dateExceptions)
      } catch (error) {
        if (signal.aborted) return
        console.error("[loadData] Error:", error)
        toast.error("Erro ao carregar disponibilidade")
      } finally {
        if (!signal.aborted) {
          console.log("[loadData] Setting isLoading to false")
          setIsLoading(false)
        }
      }
    }

    loadData()

    // Cleanup: abort fetch when effect re-runs or component unmounts
    return () => {
      console.log("[Data Effect] Cleanup - aborting")
      abortController.abort()
    }
  }, [status, isAdmin, professionalIdParam, router])

  async function fetchAvailabilityForProfessional(profileId?: string | null) {
    try {
      const params = new URLSearchParams()
      if (profileId) {
        params.set("professionalProfileId", profileId)
      }

      const [availResponse, exceptionsResponse] = await Promise.all([
        fetch(`/api/availability?${params.toString()}`),
        fetch(`/api/availability/exceptions?${params.toString()}`),
      ])

      if (!availResponse.ok) {
        throw new Error("Failed to fetch availability")
      }

      const [availData, exceptionsData] = await Promise.all([
        availResponse.json(),
        exceptionsResponse.ok ? exceptionsResponse.json() : { exceptions: [] },
      ])

      // Filter to only date-specific exceptions (ignore recurring)
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
        body: JSON.stringify({
          professionalProfileId,
          rules,
        }),
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

  function getRulesForDay(dayOfWeek: number): TimeBlock[] {
    return rules.filter((r) => r.dayOfWeek === dayOfWeek)
  }

  function toggleDayActive(dayOfWeek: number) {
    const dayRules = getRulesForDay(dayOfWeek)

    if (dayRules.length === 0) {
      // Add default time block for this day
      setRules([
        ...rules,
        {
          dayOfWeek,
          startTime: "08:00",
          endTime: "18:00",
          isActive: true,
        },
      ])
    } else {
      // Toggle isActive for all blocks on this day
      const allActive = dayRules.every((r) => r.isActive)
      setRules(
        rules.map((r) =>
          r.dayOfWeek === dayOfWeek ? { ...r, isActive: !allActive } : r
        )
      )
    }
  }

  function openBlockEditor(dayOfWeek: number, index: number | null = null) {
    const dayRules = getRulesForDay(dayOfWeek)
    const block =
      index !== null
        ? dayRules[index]
        : { dayOfWeek, startTime: "08:00", endTime: "18:00", isActive: true }

    setEditingBlock({ dayOfWeek, index, block })
  }

  function closeBlockEditor() {
    setEditingBlock(null)
  }

  function saveBlock() {
    if (!editingBlock) return

    const { dayOfWeek, index, block } = editingBlock

    // Validate times
    if (block.startTime >= block.endTime) {
      toast.error("O horário de início deve ser anterior ao horário de término")
      return
    }

    if (index !== null) {
      // Update existing block
      let blockIndex = 0
      setRules(
        rules.map((r) => {
          if (r.dayOfWeek === dayOfWeek) {
            if (blockIndex === index) {
              blockIndex++
              return { ...block }
            }
            blockIndex++
          }
          return r
        })
      )
    } else {
      // Add new block
      setRules([...rules, { ...block }])
    }

    closeBlockEditor()
  }

  function deleteBlock() {
    if (!editingBlock || editingBlock.index === null) return

    const { dayOfWeek, index } = editingBlock
    let blockIndex = 0

    setRules(
      rules.filter((r) => {
        if (r.dayOfWeek === dayOfWeek) {
          if (blockIndex === index) {
            blockIndex++
            return false
          }
          blockIndex++
        }
        return true
      })
    )

    closeBlockEditor()
  }

  function removeAllBlocksForDay(dayOfWeek: number) {
    setRules(rules.filter((r) => r.dayOfWeek !== dayOfWeek))
  }

  // Exception handlers (date-specific only)
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
      // New exception - default to block (unavailable) for specific date
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      // For admins, default to clinic-wide; for professionals, default to their own
      const defaultTargetType = isAdmin ? "clinic" : "professional"
      setEditingException({
        date: toDisplayDateFromDate(tomorrow),
        isAvailable: false,
        startTime: null,
        endTime: null,
        reason: null,
        isFullDay: true,
        targetType: defaultTargetType,
        targetProfessionalId: isAdmin ? null : null, // will use user's own profile
      })
    }
  }

  function closeExceptionEditor() {
    setEditingException(null)
  }

  async function saveException() {
    if (!editingException) return

    const { date, isAvailable, startTime, endTime, reason, isFullDay, targetType, targetProfessionalId } = editingException

    // Validate exception has date
    if (!date) {
      toast.error("Selecione a data")
      return
    }

    // Validate time range if not full day
    if (!isFullDay) {
      if (!startTime || !endTime) {
        toast.error("Selecione os horários de início e término")
        return
      }
      if (startTime >= endTime) {
        toast.error("O horário de início deve ser anterior ao horário de término")
        return
      }
    }

    // Validate professional selection for professional-specific exceptions
    if (targetType === "professional" && isAdmin && !targetProfessionalId) {
      toast.error("Selecione um profissional")
      return
    }

    setIsSaving(true)

    try {
      let professionalProfileId: string | undefined
      const isClinicWide = targetType === "clinic"

      if (!isClinicWide) {
        // Professional-specific exception
        if (isAdmin && targetProfessionalId) {
          const prof = professionals.find((p) => p.id === targetProfessionalId)
          professionalProfileId = prof?.professionalProfile?.id
        }
        // For non-admins, the API will use the user's own profile
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
      closeExceptionEditor()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar exceção")
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteException(id: string) {
    setIsDeletingException(id)

    try {
      const response = await fetch(`/api/availability/exceptions/${id}`, {
        method: "DELETE",
      })

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
    // Extract just the date part (YYYY-MM-DD) to avoid timezone issues
    const datePart = dateStr.split("T")[0]
    // Parse as local time by appending time component
    const date = new Date(datePart + "T12:00:00")
    return date.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  if (status === "loading" || isLoading) {
    return <LoadingState />
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="min-h-[44px] min-w-[44px] flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
          >
            &larr; Voltar
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-semibold text-foreground">
            Disponibilidade Semanal
          </h1>
          <button
            onClick={saveAvailability}
            disabled={isSaving || (isAdmin && !selectedProfessionalId)}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>

        {/* ADMIN: Professional selector */}
        {isAdmin && professionals.length > 0 && (
          <div className="mb-6">
            <label
              htmlFor="professional"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Profissional
            </label>
            <select
              id="professional"
              value={selectedProfessionalId || ""}
              onChange={(e) => handleProfessionalChange(e.target.value)}
              className="w-full sm:w-auto min-w-[250px] h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
            >
              <option value="">Selecione um profissional</option>
              {professionals.map((prof) => (
                <option key={prof.id} value={prof.id}>
                  {prof.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Weekly Grid */}
        {isAdmin && !selectedProfessionalId ? (
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <p className="text-muted-foreground">
              Selecione um profissional acima para gerenciar a disponibilidade.
            </p>
          </div>
        ) : (
          <WeeklyScheduleGrid
            rules={rules}
            onToggleDay={toggleDayActive}
            onOpenBlockEditor={openBlockEditor}
            onRemoveAllBlocks={removeAllBlocksForDay}
          />
        )}

        {(!isAdmin || selectedProfessionalId) && (
          <p className="text-sm text-muted-foreground mt-6">
            Configure os horários em que você está disponível para atendimentos.
            Você pode adicionar múltiplos blocos de horário por dia.
          </p>
        )}

        {/* Exceptions Section */}
        <ExceptionsList
          exceptions={exceptions}
          isDeletingException={isDeletingException}
          onOpenExceptionEditor={openExceptionEditor}
          onDeleteException={deleteException}
          formatExceptionDate={formatExceptionDate}
        />
      </div>

      {/* Time Block Editor Modal */}
      {editingBlock && isMounted && (
        <TimeBlockEditorModal
          editingBlock={editingBlock}
          isSaving={isSaving}
          onSave={saveBlock}
          onDelete={deleteBlock}
          onClose={closeBlockEditor}
          onChange={setEditingBlock}
        />
      )}

      {/* Exception Editor Modal */}
      {editingException && isMounted && (
        <ExceptionEditorModal
          editingException={editingException}
          professionals={professionals}
          selectedProfessionalId={selectedProfessionalId}
          isAdmin={isAdmin}
          isSaving={isSaving}
          onSave={saveException}
          onClose={closeExceptionEditor}
          onChange={setEditingException}
        />
      )}
    </main>
  )
}
