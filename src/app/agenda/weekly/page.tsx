"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import Link from "next/link"
import {
  FAB,
  SwipeContainer,
  ListIcon,
  BuildingIcon,
  VideoIcon,
} from "@/shared/components/ui"

import {
  Patient,
  Professional,
  Appointment,
  RecurrenceType,
  RecurrenceEndType,
  CancelType,
  AppointmentFormData,
  EditAppointmentFormData,
  appointmentSchema,
  editAppointmentSchema,
} from "../lib"

import {
  STATUS_LABELS,
  STATUS_COLORS,
  DEFAULT_APPOINTMENT_DURATION,
} from "../lib/constants"

import {
  formatPhone,
  toDateString,
  toDisplayDateFromDate,
  toIsoDate,
  canCancelAppointment,
  canMarkStatus,
  canResendConfirmation,
  getWeekStart,
  getWeekEnd,
} from "../lib/utils"

import {
  Sheet,
  PatientSearch,
  RecurrenceOptions,
  CancelDialog,
  RecurrenceEditSheet,
  RecurrenceIndicator,
} from "../components"

import { WeekNavigation, WeeklyGrid } from "./components"

function WeeklyAgendaPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  // Initialize week from URL or default to current week
  const [weekStart, setWeekStart] = useState(() => {
    const dateParam = searchParams.get("date")
    if (dateParam) {
      return getWeekStart(new Date(dateParam + "T12:00:00"))
    }
    return getWeekStart(new Date())
  })

  // Core state
  const [isLoading, setIsLoading] = useState(true)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("")
  const [appointmentDuration, setAppointmentDuration] = useState(DEFAULT_APPOINTMENT_DURATION)

  // Create appointment state
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
  const [patientSearch, setPatientSearch] = useState("")
  const [isSavingAppointment, setIsSavingAppointment] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [createProfessionalId, setCreateProfessionalId] = useState("")

  // Recurrence state (for create)
  const [isRecurrenceEnabled, setIsRecurrenceEnabled] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("WEEKLY")
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>("BY_OCCURRENCES")
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("")
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState(10)

  // Edit appointment state
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [isUpdatingAppointment, setIsUpdatingAppointment] = useState(false)

  // Cancel dialog state
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)

  // Status update state
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false)

  // Recurrence management state
  const [isManagingException, setIsManagingException] = useState(false)
  const [isRecurrenceEditSheetOpen, setIsRecurrenceEditSheetOpen] = useState(false)

  // Forms
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      modality: "PRESENCIAL",
    },
  })

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    formState: { errors: editErrors },
  } = useForm<EditAppointmentFormData>({
    resolver: zodResolver(editAppointmentSchema),
  })

  const isAdmin = session?.user?.role === "ADMIN"
  const currentProfessionalProfileId = session?.user?.professionalProfileId
  const activeProfessionalProfileId = isAdmin && selectedProfessionalId
    ? selectedProfessionalId
    : currentProfessionalProfileId

  // Watch form values for recurrence preview
  const watchedDate = watch("date")
  const watchedStartTime = watch("startTime")

  // ============================================================================
  // Week Navigation
  // ============================================================================

  function goToPreviousWeek() {
    setWeekStart((prev) => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() - 7)
      return newDate
    })
  }

  function goToNextWeek() {
    setWeekStart((prev) => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() + 7)
      return newDate
    })
  }

  function goToToday() {
    setWeekStart(getWeekStart(new Date()))
  }

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchProfessionals = useCallback(async () => {
    if (!isAdmin) return
    try {
      const response = await fetch("/api/professionals")
      if (!response.ok) return
      const data = await response.json()
      setProfessionals(data.professionals)
    } catch {
      // Silently fail
    }
  }, [isAdmin])

  const fetchAppointments = useCallback(async () => {
    if (!activeProfessionalProfileId && !isAdmin) return
    try {
      const startDate = toDateString(weekStart)
      const endDate = toDateString(getWeekEnd(weekStart))

      const params = new URLSearchParams({ startDate, endDate })
      if (isAdmin && selectedProfessionalId) {
        params.set("professionalProfileId", selectedProfessionalId)
      }
      const response = await fetch(`/api/appointments?${params.toString()}`)
      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Acesso negado")
          router.push("/login")
          return
        }
        throw new Error("Failed to fetch appointments")
      }
      const data = await response.json()
      setAppointments(data.appointments)
    } catch {
      toast.error("Erro ao carregar agenda")
    }
  }, [weekStart, activeProfessionalProfileId, isAdmin, selectedProfessionalId, router])

  // ============================================================================
  // Create Appointment
  // ============================================================================

  function openCreateSheet() {
    setSelectedPatient(null)
    setPatientSearch("")
    setCreateProfessionalId(selectedProfessionalId || "")
    setIsRecurrenceEnabled(false)
    setRecurrenceType("WEEKLY")
    setRecurrenceEndType("BY_OCCURRENCES")
    setRecurrenceEndDate("")
    setRecurrenceOccurrences(10)
    reset({
      patientId: "",
      date: toDisplayDateFromDate(weekStart),
      startTime: "",
      modality: "PRESENCIAL",
      notes: "",
    })
    setIsCreateSheetOpen(true)
  }

  function closeCreateSheet() {
    setIsCreateSheetOpen(false)
    setSelectedPatient(null)
    setPatientSearch("")
    setCreateProfessionalId("")
    setIsRecurrenceEnabled(false)
  }

  function handleSelectPatient(patient: Patient) {
    setSelectedPatient(patient)
    setValue("patientId", patient.id)
    setPatientSearch(patient.name)
  }

  async function onSubmitAppointment(data: AppointmentFormData) {
    // For admin, require a professional to be selected
    const effectiveProfessionalId = selectedProfessionalId || createProfessionalId
    if (isAdmin && !effectiveProfessionalId) {
      toast.error("Selecione um profissional")
      return
    }

    setIsSavingAppointment(true)
    try {
      const body: Record<string, unknown> = {
        patientId: data.patientId,
        date: toIsoDate(data.date),
        startTime: data.startTime,
        modality: data.modality,
        notes: data.notes || null,
      }

      if (isAdmin && effectiveProfessionalId) {
        body.professionalProfileId = effectiveProfessionalId
      }
      if (data.duration) {
        body.duration = data.duration
      }
      if (isRecurrenceEnabled) {
        body.recurrence = {
          recurrenceType,
          recurrenceEndType,
          ...(recurrenceEndType === "BY_DATE" && { endDate: recurrenceEndDate }),
          ...(recurrenceEndType === "BY_OCCURRENCES" && { occurrences: recurrenceOccurrences }),
        }
      }

      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        if (result.occurrenceIndex) {
          toast.error(`${result.error} (Ocorrencia ${result.occurrenceIndex})`)
        } else {
          toast.error(result.error || "Erro ao criar agendamento")
        }
        return
      }

      if (isRecurrenceEnabled && result.totalOccurrences) {
        toast.success(`${result.totalOccurrences} agendamentos criados com sucesso`)
      } else {
        toast.success("Agendamento criado com sucesso")
      }

      closeCreateSheet()
      fetchAppointments()
    } catch {
      toast.error("Erro ao criar agendamento")
    } finally {
      setIsSavingAppointment(false)
    }
  }

  // ============================================================================
  // Edit Appointment
  // ============================================================================

  function openEditSheet(appointment: Appointment) {
    setSelectedAppointment(appointment)
    const scheduledDate = new Date(appointment.scheduledAt)
    const endDate = new Date(appointment.endAt)
    const durationMinutes = Math.round((endDate.getTime() - scheduledDate.getTime()) / 60000)

    resetEdit({
      date: toDisplayDateFromDate(scheduledDate),
      startTime: `${scheduledDate.getHours().toString().padStart(2, "0")}:${scheduledDate.getMinutes().toString().padStart(2, "0")}`,
      duration: durationMinutes,
      modality: appointment.modality as "ONLINE" | "PRESENCIAL",
      notes: appointment.notes || "",
      price: appointment.price ? parseFloat(appointment.price) : null,
    })
    setIsEditSheetOpen(true)
  }

  function closeEditSheet() {
    setIsEditSheetOpen(false)
    setSelectedAppointment(null)
  }

  async function onSubmitEdit(data: EditAppointmentFormData) {
    if (!selectedAppointment) return

    setIsUpdatingAppointment(true)
    try {
      const [hours, minutes] = data.startTime.split(":").map(Number)
      const isoDate = toIsoDate(data.date)
      const scheduledAt = new Date(isoDate + "T12:00:00")
      scheduledAt.setHours(hours, minutes, 0, 0)

      const durationMinutes = data.duration || appointmentDuration
      const endAt = new Date(scheduledAt.getTime() + durationMinutes * 60000)

      const body: Record<string, unknown> = {
        scheduledAt: scheduledAt.toISOString(),
        endAt: endAt.toISOString(),
        modality: data.modality,
        notes: data.notes || null,
        price: data.price !== undefined && data.price !== "" ? Number(data.price) : null,
      }

      const response = await fetch(`/api/appointments/${selectedAppointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || "Erro ao atualizar agendamento")
        return
      }

      toast.success("Agendamento atualizado com sucesso")
      closeEditSheet()
      fetchAppointments()
    } catch {
      toast.error("Erro ao atualizar agendamento")
    } finally {
      setIsUpdatingAppointment(false)
    }
  }

  // ============================================================================
  // Cancel Appointment
  // ============================================================================

  async function handleCancelAppointment(reason: string, notifyPatient: boolean, cancelType: CancelType) {
    if (!selectedAppointment) return

    const response = await fetch(`/api/appointments/${selectedAppointment.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, notifyPatient, cancelType }),
    })

    const result = await response.json()

    if (!response.ok) {
      toast.error(result.error || "Erro ao cancelar agendamento")
      throw new Error(result.error)
    }

    if (result.cancelType === "series" && result.cancelledCount > 1) {
      toast.success(`${result.cancelledCount} agendamentos cancelados com sucesso`)
    } else {
      toast.success("Agendamento cancelado com sucesso")
    }
    if (result.notificationCreated) {
      toast.success("Notificacao enviada ao paciente")
    }

    setIsCancelDialogOpen(false)
    closeEditSheet()
    fetchAppointments()
  }

  // ============================================================================
  // Status Updates
  // ============================================================================

  async function handleUpdateStatus(newStatus: string, successMessage: string) {
    if (!selectedAppointment) return

    setIsUpdatingStatus(true)
    try {
      const response = await fetch(`/api/appointments/${selectedAppointment.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || "Erro ao atualizar status")
        return
      }

      toast.success(successMessage)
      closeEditSheet()
      fetchAppointments()
    } catch {
      toast.error("Erro ao atualizar status")
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  async function handleResendConfirmation() {
    if (!selectedAppointment) return

    setIsResendingConfirmation(true)
    try {
      const response = await fetch(`/api/appointments/${selectedAppointment.id}/resend-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || "Erro ao reenviar confirmacao")
        return
      }

      const channels = result.notificationsSent?.join(" e ") || "notificacao"
      toast.success(`Links de confirmacao reenviados via ${channels}`)
    } catch {
      toast.error("Erro ao reenviar confirmacao")
    } finally {
      setIsResendingConfirmation(false)
    }
  }

  // ============================================================================
  // Recurrence Management
  // ============================================================================

  async function handleToggleException(action: "skip" | "unskip") {
    if (!selectedAppointment?.recurrence) return

    const appointmentDate = new Date(selectedAppointment.scheduledAt)
    const dateStr = appointmentDate.toISOString().split("T")[0]

    setIsManagingException(true)
    try {
      const response = await fetch(
        `/api/appointments/recurrences/${selectedAppointment.recurrence.id}/exceptions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr, action }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || `Erro ao ${action === "skip" ? "pular" : "restaurar"} data`)
        return
      }

      toast.success(result.message)

      if (selectedAppointment.recurrence) {
        setSelectedAppointment({
          ...selectedAppointment,
          recurrence: {
            ...selectedAppointment.recurrence,
            exceptions: result.exceptions,
          },
          ...(action === "skip" && {
            status: "CANCELADO_PROFISSIONAL",
            cancellationReason: "Excecao na recorrencia - data pulada",
          }),
          ...(action === "unskip" &&
            selectedAppointment.status === "CANCELADO_PROFISSIONAL" &&
            selectedAppointment.cancellationReason === "Excecao na recorrencia - data pulada" && {
              status: "AGENDADO",
              cancellationReason: null,
            }),
        } as Appointment)
      }

      fetchAppointments()
    } catch {
      toast.error(`Erro ao ${action === "skip" ? "pular" : "restaurar"} data`)
    } finally {
      setIsManagingException(false)
    }
  }

  // ============================================================================
  // Effects
  // ============================================================================

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }
    if (status === "authenticated") {
      setIsLoading(false)
      fetchProfessionals()
    }
  }, [status, router, fetchProfessionals])

  useEffect(() => {
    if (status !== "authenticated" || (!activeProfessionalProfileId && !isAdmin)) {
      return
    }

    const abortController = new AbortController()

    async function fetchData() {
      try {
        const startDate = toDateString(weekStart)
        const endDate = toDateString(getWeekEnd(weekStart))
        const profId = isAdmin && selectedProfessionalId ? selectedProfessionalId : ""

        const params = new URLSearchParams({ startDate, endDate })
        if (profId) params.set("professionalProfileId", profId)

        const response = await fetch(`/api/appointments?${params.toString()}`, {
          signal: abortController.signal,
        })

        if (abortController.signal.aborted) return

        if (!response.ok) {
          if (response.status === 403) {
            toast.error("Acesso negado")
            router.push("/login")
            return
          }
          throw new Error("Failed to fetch appointments")
        }

        const data = await response.json()

        if (abortController.signal.aborted) return

        setAppointments(data.appointments)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        toast.error("Erro ao carregar agenda")
      }
    }

    fetchData()

    return () => {
      abortController.abort()
    }
  }, [status, weekStart, activeProfessionalProfileId, isAdmin, selectedProfessionalId, router])

  useEffect(() => {
    if (professionals.length > 0 && activeProfessionalProfileId) {
      const prof = professionals.find(p => p.professionalProfile?.id === activeProfessionalProfileId)
      if (prof?.professionalProfile?.appointmentDuration) {
        setAppointmentDuration(prof.professionalProfile.appointmentDuration)
      }
    }
  }, [professionals, activeProfessionalProfileId])

  // ============================================================================
  // Render
  // ============================================================================

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background pb-20">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-1/3" />
            <div className="h-[600px] bg-muted rounded" />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <WeekNavigation
              weekStart={weekStart}
              onPreviousWeek={goToPreviousWeek}
              onNextWeek={goToNextWeek}
              onToday={goToToday}
            />

            <Link
              href="/agenda"
              className="flex items-center gap-2 h-10 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted"
            >
              <ListIcon className="w-4 h-4" />
              Dia
            </Link>
          </div>

          {isAdmin && professionals.length > 0 && (
            <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
              <button
                type="button"
                onClick={() => setSelectedProfessionalId("")}
                className={`
                  flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors
                  ${selectedProfessionalId === ""
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }
                `}
              >
                Todos
              </button>
              {professionals.map((prof) => {
                const profId = prof.professionalProfile?.id || ""
                const isSelected = selectedProfessionalId === profId
                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => setSelectedProfessionalId(profId)}
                    className={`
                      flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                      ${isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }
                    `}
                  >
                    {prof.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </header>

      {/* Weekly Grid */}
      <SwipeContainer onSwipeLeft={goToNextWeek} onSwipeRight={goToPreviousWeek} className="max-w-6xl mx-auto px-4 py-4">
        <p className="text-xs text-muted-foreground text-center mb-4">
          Deslize para esquerda ou direita para mudar a semana
        </p>

        <WeeklyGrid
          weekStart={weekStart}
          appointments={appointments}
          onAppointmentClick={openEditSheet}
          showProfessional={!selectedProfessionalId && isAdmin}
        />
      </SwipeContainer>

      {/* FAB */}
      <FAB onClick={openCreateSheet} label="Novo agendamento" />

      {/* Create Appointment Sheet */}
      <Sheet isOpen={isCreateSheetOpen} onClose={closeCreateSheet} title="Novo Agendamento">
        <form onSubmit={handleSubmit(onSubmitAppointment)} className="p-4 space-y-6">
          <PatientSearch
            value={patientSearch}
            onChange={(v) => {
              setPatientSearch(v)
              if (selectedPatient && v !== selectedPatient.name) {
                setSelectedPatient(null)
                setValue("patientId", "")
              }
            }}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClearPatient={() => {
              setSelectedPatient(null)
              setValue("patientId", "")
            }}
            error={errors.patientId?.message}
          />
          <input type="hidden" {...register("patientId")} />

          {/* Professional selector for admin */}
          {isAdmin && (
            <div>
              <label htmlFor="createProfessional" className="block text-sm font-medium text-foreground mb-2">Profissional *</label>
              {selectedProfessionalId ? (
                <div className="w-full h-12 px-4 rounded-md border border-input bg-muted text-foreground flex items-center">
                  {professionals.find(p => p.professionalProfile?.id === selectedProfessionalId)?.name || "Profissional selecionado"}
                </div>
              ) : (
                <select
                  id="createProfessional"
                  value={createProfessionalId}
                  onChange={(e) => setCreateProfessionalId(e.target.value)}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione um profissional</option>
                  {professionals.map((prof) => (
                    <option key={prof.id} value={prof.professionalProfile?.id || ""}>
                      {prof.name}
                      {prof.professionalProfile?.specialty && ` - ${prof.professionalProfile.specialty}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-foreground mb-2">Data *</label>
            <input id="date" type="text" placeholder="DD/MM/AAAA" {...register("date")} className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            {errors.date && <p className="text-sm text-destructive mt-1">{errors.date.message}</p>}
          </div>

          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-2">Horario * (HH:mm)</label>
            <input
              id="startTime"
              type="text"
              placeholder="Ex: 14:30"
              pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
              {...register("startTime")}
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.startTime && <p className="text-sm text-destructive mt-1">{errors.startTime.message}</p>}
          </div>

          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-foreground mb-2">Duracao (minutos)</label>
            <input id="duration" type="number" {...register("duration", { setValueAs: (v) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v) })} placeholder={`Padrao: ${appointmentDuration} minutos`} min={15} max={480} step={5} className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <p className="text-xs text-muted-foreground mt-1">Se nao informado, usa a duracao padrao ({appointmentDuration} min)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Modalidade *</label>
            <div className="grid grid-cols-2 gap-3">
              <label className="relative flex items-center justify-center cursor-pointer">
                <input type="radio" value="PRESENCIAL" {...register("modality")} className="sr-only peer" />
                <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary">
                  <BuildingIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">Presencial</span>
                </div>
              </label>
              <label className="relative flex items-center justify-center cursor-pointer">
                <input type="radio" value="ONLINE" {...register("modality")} className="sr-only peer" />
                <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary">
                  <VideoIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">Online</span>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-2">Observacoes</label>
            <textarea id="notes" rows={3} {...register("notes")} placeholder="Observacoes sobre a consulta..." className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

          <RecurrenceOptions
            isEnabled={isRecurrenceEnabled}
            onToggle={setIsRecurrenceEnabled}
            recurrenceType={recurrenceType}
            onRecurrenceTypeChange={setRecurrenceType}
            recurrenceEndType={recurrenceEndType}
            onRecurrenceEndTypeChange={setRecurrenceEndType}
            occurrences={recurrenceOccurrences}
            onOccurrencesChange={setRecurrenceOccurrences}
            endDate={recurrenceEndDate}
            onEndDateChange={setRecurrenceEndDate}
            minDate={watchedDate}
            startDate={watchedDate}
            startTime={watchedStartTime}
          />

          <div className="flex gap-3 pt-4 pb-8">
            <button type="button" onClick={closeCreateSheet} className="flex-1 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={isSavingAppointment || !selectedPatient || (isAdmin && !selectedProfessionalId && !createProfessionalId)} className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
              {isSavingAppointment ? "Salvando..." : "Criar Agendamento"}
            </button>
          </div>
        </form>
      </Sheet>

      {/* Edit Appointment Sheet */}
      <Sheet isOpen={isEditSheetOpen} onClose={closeEditSheet} title="Editar Agendamento">
        {selectedAppointment && (
          <>
            {/* Patient & Professional Info */}
            <div className="px-4 py-4 bg-muted/30 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Paciente</p>
                    <p className="font-medium text-foreground">{selectedAppointment.patient.name}</p>
                    <p className="text-sm text-muted-foreground">{formatPhone(selectedAppointment.patient.phone)}</p>
                    {selectedAppointment.patient.email && <p className="text-sm text-muted-foreground">{selectedAppointment.patient.email}</p>}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Profissional</p>
                    <p className="font-medium text-foreground">{selectedAppointment.professionalProfile.user.name}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[selectedAppointment.status] || "bg-gray-100 text-gray-800 border-gray-200"}`}>
                  {STATUS_LABELS[selectedAppointment.status] || selectedAppointment.status}
                </span>
              </div>
            </div>

            {/* Recurrence Indicator */}
            {selectedAppointment.recurrence && (
              <RecurrenceIndicator
                appointment={selectedAppointment}
                onEdit={() => setIsRecurrenceEditSheetOpen(true)}
                onToggleException={handleToggleException}
                isManagingException={isManagingException}
              />
            )}

            <form onSubmit={handleSubmitEdit(onSubmitEdit)} className="p-4 space-y-6">
              <div>
                <label htmlFor="editDate" className="block text-sm font-medium text-foreground mb-2">Data *</label>
                <input id="editDate" type="text" placeholder="DD/MM/AAAA" {...registerEdit("date")} className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                {editErrors.date && <p className="text-sm text-destructive mt-1">{editErrors.date.message}</p>}
              </div>

              <div>
                <label htmlFor="editStartTime" className="block text-sm font-medium text-foreground mb-2">Horario * (HH:mm)</label>
                <input
                  id="editStartTime"
                  type="text"
                  placeholder="Ex: 14:30"
                  pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                  {...registerEdit("startTime")}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {editErrors.startTime && <p className="text-sm text-destructive mt-1">{editErrors.startTime.message}</p>}
              </div>

              <div>
                <label htmlFor="editDuration" className="block text-sm font-medium text-foreground mb-2">Duracao (minutos)</label>
                <input id="editDuration" type="number" {...registerEdit("duration", { setValueAs: (v) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v) })} min={15} max={480} step={5} className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Modalidade *</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="relative flex items-center justify-center cursor-pointer">
                    <input type="radio" value="PRESENCIAL" {...registerEdit("modality")} className="sr-only peer" />
                    <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary">
                      <span className="text-sm font-medium">Presencial</span>
                    </div>
                  </label>
                  <label className="relative flex items-center justify-center cursor-pointer">
                    <input type="radio" value="ONLINE" {...registerEdit("modality")} className="sr-only peer" />
                    <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary">
                      <span className="text-sm font-medium">Online</span>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="editPrice" className="block text-sm font-medium text-foreground mb-2">Valor (R$)</label>
                <input id="editPrice" type="number" step="0.01" {...registerEdit("price", { valueAsNumber: true })} placeholder="0.00" className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              <div>
                <label htmlFor="editNotes" className="block text-sm font-medium text-foreground mb-2">Observacoes</label>
                <textarea id="editNotes" rows={3} {...registerEdit("notes")} className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-4 border-t border-border">
                {canMarkStatus(selectedAppointment) && (
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => handleUpdateStatus("FINALIZADO", "Consulta finalizada com sucesso")} disabled={isUpdatingStatus} className="h-11 rounded-md bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50">
                      {isUpdatingStatus ? "..." : "Finalizar Consulta"}
                    </button>
                    <button type="button" onClick={() => handleUpdateStatus("NAO_COMPARECEU", "Paciente marcado como nao compareceu")} disabled={isUpdatingStatus} className="h-11 rounded-md bg-yellow-600 text-white font-medium hover:bg-yellow-700 disabled:opacity-50">
                      {isUpdatingStatus ? "..." : "Nao Compareceu"}
                    </button>
                  </div>
                )}

                {canResendConfirmation(selectedAppointment) && (
                  <button type="button" onClick={handleResendConfirmation} disabled={isResendingConfirmation} className="w-full h-11 rounded-md border border-primary text-primary font-medium hover:bg-primary/5 disabled:opacity-50">
                    {isResendingConfirmation ? "Reenviando..." : "Reenviar Links de Confirmacao"}
                  </button>
                )}

                {canCancelAppointment(selectedAppointment) && (
                  <button type="button" onClick={() => setIsCancelDialogOpen(true)} className="w-full h-11 rounded-md border border-red-500 text-red-600 font-medium hover:bg-red-50 dark:hover:bg-red-950/30">
                    Cancelar Agendamento
                  </button>
                )}
              </div>

              <div className="flex gap-3 pb-8">
                <button type="button" onClick={closeEditSheet} className="flex-1 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted">Fechar</button>
                <button type="submit" disabled={isUpdatingAppointment} className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
                  {isUpdatingAppointment ? "Salvando..." : "Salvar Alteracoes"}
                </button>
              </div>
            </form>
          </>
        )}
      </Sheet>

      {/* Cancel Dialog */}
      <CancelDialog
        isOpen={isCancelDialogOpen}
        onClose={() => setIsCancelDialogOpen(false)}
        appointment={selectedAppointment}
        onConfirm={handleCancelAppointment}
      />

      {/* Recurrence Edit Sheet */}
      <RecurrenceEditSheet
        isOpen={isRecurrenceEditSheetOpen}
        onClose={() => setIsRecurrenceEditSheetOpen(false)}
        appointment={selectedAppointment}
        onSave={fetchAppointments}
      />
    </main>
  )
}

export default function WeeklyAgendaPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Carregando...</div>}>
      <WeeklyAgendaPageContent />
    </Suspense>
  )
}
