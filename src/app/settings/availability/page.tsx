"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { SkeletonPage } from "@/shared/components/ui"

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

const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo", short: "Dom" },
  { value: 1, label: "Segunda", short: "Seg" },
  { value: 2, label: "Terça", short: "Ter" },
  { value: 3, label: "Quarta", short: "Qua" },
  { value: 4, label: "Quinta", short: "Qui" },
  { value: 5, label: "Sexta", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
]

interface TimeBlock {
  id?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

interface AvailabilityException {
  id: string
  date: string
  isAvailable: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
  createdAt: string
}

interface Professional {
  id: string
  name: string
  professionalProfile: {
    id: string
  } | null
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
  const [rules, setRules] = useState<TimeBlock[]>([])
  const [editingBlock, setEditingBlock] = useState<{
    dayOfWeek: number
    index: number | null
    block: TimeBlock
  } | null>(null)

  // Exceptions state
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([])
  const [editingException, setEditingException] = useState<{
    id?: string
    date: string
    isAvailable: boolean
    startTime: string | null
    endTime: string | null
    reason: string | null
    isFullDay: boolean
  } | null>(null)
  const [isDeletingException, setIsDeletingException] = useState<string | null>(null)

  // ADMIN-only: professional selection
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null)
  const professionalIdParam = searchParams.get("professionalId")

  const isAdmin = session?.user?.role === "ADMIN"

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

        console.log("[loadData] Setting state. rules:", availData.rules?.length, "exceptions:", exceptionsData.exceptions?.length)
        setRules(availData.rules || [])
        setExceptions(exceptionsData.exceptions || [])
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

      setRules(availData.rules || [])
      setExceptions(exceptionsData.exceptions || [])
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

  // Exception handlers
  function openExceptionEditor(exception?: AvailabilityException) {
    if (exception) {
      setEditingException({
        id: exception.id,
        date: toDisplayDate(exception.date),
        isAvailable: exception.isAvailable,
        startTime: exception.startTime,
        endTime: exception.endTime,
        reason: exception.reason,
        isFullDay: !exception.startTime && !exception.endTime,
      })
    } else {
      // New exception - default to block (unavailable)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setEditingException({
        date: toDisplayDateFromDate(tomorrow),
        isAvailable: false,
        startTime: null,
        endTime: null,
        reason: null,
        isFullDay: true,
      })
    }
  }

  function closeExceptionEditor() {
    setEditingException(null)
  }

  async function saveException() {
    if (!editingException) return

    const { date, isAvailable, startTime, endTime, reason, isFullDay } = editingException

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

    setIsSaving(true)

    try {
      let professionalProfileId: string | undefined

      if (isAdmin && selectedProfessionalId) {
        const prof = professionals.find((p) => p.id === selectedProfessionalId)
        professionalProfileId = prof?.professionalProfile?.id
      }

      const response = await fetch("/api/availability/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalProfileId,
          date: toIsoDate(date),
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
    const date = new Date(dateStr + "T00:00:00")
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
            disabled={isSaving}
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
        <div className="space-y-4">
          {DAYS_OF_WEEK.map((day) => {
            const dayRules = getRulesForDay(day.value)
            const hasRules = dayRules.length > 0
            const allActive = hasRules && dayRules.every((r) => r.isActive)

            return (
              <div
                key={day.value}
                className={`bg-card border border-border rounded-lg p-4 sm:p-6 ${
                  !allActive && hasRules ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Day toggle */}
                  <div className="flex items-center gap-3 sm:w-32">
                    <button
                      type="button"
                      onClick={() => toggleDayActive(day.value)}
                      className={`relative w-14 h-8 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background touch-manipulation ${
                        allActive ? "bg-primary" : "bg-muted"
                      }`}
                      aria-label={`Toggle ${day.label}`}
                    >
                      <span
                        className={`absolute top-1.5 w-5 h-5 rounded-full bg-white transition-transform ${
                          allActive ? "left-8" : "left-1"
                        }`}
                      />
                    </button>
                    <span className="font-medium text-foreground">
                      <span className="hidden sm:inline">{day.label}</span>
                      <span className="sm:hidden">{day.short}</span>
                    </span>
                  </div>

                  {/* Time blocks */}
                  <div className="flex-1 flex flex-wrap gap-2">
                    {dayRules.map((rule, index) => (
                      <button
                        key={rule.id || `${day.value}-${index}`}
                        type="button"
                        onClick={() => openBlockEditor(day.value, index)}
                        className={`min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background touch-manipulation ${
                          rule.isActive
                            ? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                            : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                        }`}
                      >
                        {rule.startTime} - {rule.endTime}
                      </button>
                    ))}

                    {/* Add time block button */}
                    <button
                      type="button"
                      onClick={() => openBlockEditor(day.value)}
                      className="min-h-[44px] px-4 py-2 rounded-md text-sm font-medium border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background touch-manipulation"
                    >
                      + Adicionar
                    </button>
                  </div>

                  {/* Remove all */}
                  {hasRules && (
                    <button
                      type="button"
                      onClick={() => removeAllBlocksForDay(day.value)}
                      className="text-sm text-destructive hover:underline focus:outline-none"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-sm text-muted-foreground mt-6">
          Configure os horários em que você está disponível para atendimentos.
          Você pode adicionar múltiplos blocos de horário por dia.
        </p>

        {/* Exceptions Section */}
        <div className="mt-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              Bloqueios e Exceções
            </h2>
            <button
              type="button"
              onClick={() => openExceptionEditor()}
              className="h-10 px-4 rounded-md border border-primary text-primary font-medium hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
            >
              + Adicionar Exceção
            </button>
          </div>

          {exceptions.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <p className="text-muted-foreground">
                Nenhuma exceção configurada. Adicione bloqueios para férias, feriados ou horários extras de atendimento.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {exceptions
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((exception) => (
                  <div
                    key={exception.id}
                    className={`bg-card border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
                      exception.isAvailable
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-red-500/30 bg-red-500/5"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            exception.isAvailable
                              ? "bg-green-500/20 text-green-700 dark:text-green-400"
                              : "bg-red-500/20 text-red-700 dark:text-red-400"
                          }`}
                        >
                          {exception.isAvailable ? "Disponível" : "Bloqueado"}
                        </span>
                        {exception.startTime && exception.endTime && (
                          <span className="text-sm text-muted-foreground">
                            {exception.startTime} - {exception.endTime}
                          </span>
                        )}
                        {!exception.startTime && (
                          <span className="text-sm text-muted-foreground">
                            Dia inteiro
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-foreground">
                        {formatExceptionDate(exception.date)}
                      </p>
                      {exception.reason && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          {exception.reason}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteException(exception.id)}
                      disabled={isDeletingException === exception.id}
                      className="shrink-0 px-3 py-1.5 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors disabled:opacity-50"
                    >
                      {isDeletingException === exception.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                ))}
            </div>
          )}

          <p className="text-sm text-muted-foreground mt-4">
            Use bloqueios para marcar dias de férias ou indisponibilidade.
            Use exceções de disponibilidade para atender fora do horário normal.
          </p>
        </div>
      </div>

      {/* Time Block Editor Modal */}
      {editingBlock && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeBlockEditor}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-1.5 rounded-full bg-muted" />
              </div>

              <h2 className="text-xl font-semibold text-foreground mb-6">
                {editingBlock.index !== null
                  ? "Editar Horário"
                  : "Novo Horário"}
                {" - "}
                {DAYS_OF_WEEK[editingBlock.dayOfWeek].label}
              </h2>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="startTime"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      Início
                    </label>
                    <input
                      id="startTime"
                      type="text"
                      placeholder="HH:mm"
                      value={editingBlock.block.startTime}
                      onChange={(e) =>
                        setEditingBlock({
                          ...editingBlock,
                          block: {
                            ...editingBlock.block,
                            startTime: e.target.value,
                          },
                        })
                      }
                      pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                      className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="endTime"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      Término
                    </label>
                    <input
                      id="endTime"
                      type="text"
                      placeholder="HH:mm"
                      value={editingBlock.block.endTime}
                      onChange={(e) =>
                        setEditingBlock({
                          ...editingBlock,
                          block: {
                            ...editingBlock.block,
                            endTime: e.target.value,
                          },
                        })
                      }
                      pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                      className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingBlock({
                        ...editingBlock,
                        block: {
                          ...editingBlock.block,
                          isActive: !editingBlock.block.isActive,
                        },
                      })
                    }
                    className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                      editingBlock.block.isActive ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        editingBlock.block.isActive ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                  <span className="text-sm text-foreground">
                    {editingBlock.block.isActive ? "Ativo" : "Inativo"}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <button
                    type="button"
                    onClick={saveBlock}
                    className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity"
                  >
                    Salvar
                  </button>
                  {editingBlock.index !== null && (
                    <button
                      type="button"
                      onClick={deleteBlock}
                      className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-destructive text-destructive font-medium hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                    >
                      Excluir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeBlockEditor}
                    className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Exception Editor Modal */}
      {editingException && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeExceptionEditor}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-1.5 rounded-full bg-muted" />
              </div>

              <h2 className="text-xl font-semibold text-foreground mb-6">
                {editingException.id ? "Editar Exceção" : "Nova Exceção"}
              </h2>

              <div className="space-y-6">
                {/* Exception Type */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    Tipo
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingException({
                          ...editingException,
                          isAvailable: false,
                        })
                      }
                      className={`px-4 py-3 rounded-md border text-sm font-medium transition-colors ${
                        !editingException.isAvailable
                          ? "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"
                          : "border-border text-muted-foreground hover:border-foreground"
                      }`}
                    >
                      Bloqueio
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingException({
                          ...editingException,
                          isAvailable: true,
                        })
                      }
                      className={`px-4 py-3 rounded-md border text-sm font-medium transition-colors ${
                        editingException.isAvailable
                          ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400"
                          : "border-border text-muted-foreground hover:border-foreground"
                      }`}
                    >
                      Disponibilidade Extra
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {editingException.isAvailable
                      ? "Adiciona disponibilidade fora do horário normal"
                      : "Bloqueia a agenda para este período"}
                  </p>
                </div>

                {/* Date */}
                <div>
                  <label
                    htmlFor="exceptionDate"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    Data
                  </label>
                  <input
                    id="exceptionDate"
                    type="text"
                    placeholder="DD/MM/AAAA"
                    value={editingException.date}
                    onChange={(e) =>
                      setEditingException({
                        ...editingException,
                        date: e.target.value,
                      })
                    }
                    className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Formato: DD/MM/AAAA</p>
                </div>

                {/* Full Day Toggle */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingException({
                        ...editingException,
                        isFullDay: !editingException.isFullDay,
                        startTime: !editingException.isFullDay ? null : "08:00",
                        endTime: !editingException.isFullDay ? null : "18:00",
                      })
                    }
                    className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                      editingException.isFullDay ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        editingException.isFullDay ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                  <span className="text-sm text-foreground">Dia inteiro</span>
                </div>

                {/* Time Range (only if not full day) */}
                {!editingException.isFullDay && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="exceptionStartTime"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        Início
                      </label>
                      <input
                        id="exceptionStartTime"
                        type="text"
                        placeholder="HH:mm"
                        value={editingException.startTime || ""}
                        onChange={(e) =>
                          setEditingException({
                            ...editingException,
                            startTime: e.target.value,
                          })
                        }
                        pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                        className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="exceptionEndTime"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        Término
                      </label>
                      <input
                        id="exceptionEndTime"
                        type="text"
                        placeholder="HH:mm"
                        value={editingException.endTime || ""}
                        onChange={(e) =>
                          setEditingException({
                            ...editingException,
                            endTime: e.target.value,
                          })
                        }
                        pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                        className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* Reason */}
                <div>
                  <label
                    htmlFor="exceptionReason"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    Motivo (opcional)
                  </label>
                  <input
                    id="exceptionReason"
                    type="text"
                    value={editingException.reason || ""}
                    onChange={(e) =>
                      setEditingException({
                        ...editingException,
                        reason: e.target.value,
                      })
                    }
                    placeholder="Ex: Férias, Feriado, Compromisso pessoal"
                    className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <button
                    type="button"
                    onClick={saveException}
                    disabled={isSaving}
                    className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity disabled:opacity-50"
                  >
                    {isSaving ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={closeExceptionEditor}
                    className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
