"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
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
  StethoscopeIcon,
  ClipboardListIcon,
  BellIcon,
  StickyNoteIcon,
  UsersRoundIcon,
  XIcon,
} from "@/shared/components/ui"

import {
  Patient,
  Professional,
  Appointment,
  RecurrenceEndType,
  CancelType,
  AppointmentFormData,
  EditAppointmentFormData,
  appointmentSchema,
  editAppointmentSchema,
  GroupSession,
} from "../lib"

import { fetchGroupSessions } from "../services/groupSessionService"
import { fetchAppointmentById } from "../services/appointmentService"

import {
  DEFAULT_APPOINTMENT_DURATION,
} from "../lib/constants"

import {
  toDateString,
  toDisplayDateFromDate,
  toIsoDate,
  toLocalDateTime,
  calculateEndTime,
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
  AppointmentEditor,
  InlineAlert,
  GroupSessionSheet,
  CalendarEntrySheet,
} from "../components"
import type { AppointmentType } from "../components/RecurrenceOptions"
import type { CalendarEntryType } from "../lib/types"

import { useCalendarEntryCreate } from "../hooks"

import { WeekNavigation, WeeklyGrid } from "./components"

function WeeklyAgendaPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  // Initialize week from URL, localStorage, or default to current week
  const [weekStart, setWeekStartState] = useState(() => {
    const dateParam = searchParams.get("date")
    if (dateParam) {
      return getWeekStart(new Date(dateParam + "T12:00:00"))
    }
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("clinica:selectedDate")
      if (stored) {
        const [year, month, day] = stored.split("-").map(Number)
        const date = new Date(year, month - 1, day)
        if (!isNaN(date.getTime())) return getWeekStart(date)
      }
    }
    return getWeekStart(new Date())
  })

  const setWeekStart = useCallback((dateOrFn: Date | ((prev: Date) => Date)) => {
    setWeekStartState((prev) => {
      const newDate = typeof dateOrFn === "function" ? dateOrFn(prev) : dateOrFn
      if (typeof window !== "undefined") {
        const y = newDate.getFullYear()
        const m = String(newDate.getMonth() + 1).padStart(2, "0")
        const d = String(newDate.getDate()).padStart(2, "0")
        localStorage.setItem("clinica:selectedDate", `${y}-${m}-${d}`)
      }
      return newDate
    })
  }, [])

  // Core state
  const [isLoading, setIsLoading] = useState(true)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [selectedProfessionalId, setSelectedProfessionalIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("clinica:selectedProfessionalId") || ""
    }
    return ""
  })
  const setSelectedProfessionalId = useCallback((id: string) => {
    setSelectedProfessionalIdState(id)
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem("clinica:selectedProfessionalId", id)
      } else {
        localStorage.removeItem("clinica:selectedProfessionalId")
      }
    }
  }, [])
  // Use session's appointmentDuration for non-admins, default for admins (will be updated when selecting professional)
  const [appointmentDuration, setAppointmentDuration] = useState(
    session?.user?.appointmentDuration || DEFAULT_APPOINTMENT_DURATION
  )

  // Group session sheet state
  const [isGroupSessionSheetOpen, setIsGroupSessionSheetOpen] = useState(false)
  const [selectedGroupSession, setSelectedGroupSession] = useState<GroupSession | null>(null)

  // Create appointment state
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
  const [patientSearch, setPatientSearch] = useState("")
  const [isSavingAppointment, setIsSavingAppointment] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [createProfessionalId, setCreateProfessionalId] = useState("")
  const [createApiError, setCreateApiError] = useState<string | null>(null)

  // Appointment type state (for create) - WEEKLY by default (psychology clinic norm)
  // INDEFINITE end type by default - appointments continue until explicitly stopped
  const [appointmentType, setAppointmentType] = useState<AppointmentType>("WEEKLY")
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>("INDEFINITE")
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("")
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState(10)

  // Edit appointment state
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [isUpdatingAppointment, setIsUpdatingAppointment] = useState(false)
  const [editApiError, setEditApiError] = useState<string | null>(null)

  // Cancel dialog state
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)

  // Status update state
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false)

  // Recurrence management state
  const [isManagingException, setIsManagingException] = useState(false)

  // Delete appointment state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletingAppointment, setIsDeletingAppointment] = useState(false)

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

  const editForm = useForm<EditAppointmentFormData>({
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
      const startDateStr = toDateString(weekStart)
      const endDateStr = toDateString(getWeekEnd(weekStart))
      const profId = isAdmin && selectedProfessionalId ? selectedProfessionalId : undefined

      const params = new URLSearchParams({ startDate: startDateStr, endDate: endDateStr })
      if (profId) {
        params.set("professionalProfileId", profId)
      }

      const [appointmentsResponse, groupSessionsData] = await Promise.all([
        fetch(`/api/appointments?${params.toString()}`),
        fetchGroupSessions({
          startDate: weekStart,
          endDate: getWeekEnd(weekStart),
          professionalProfileId: profId,
        }),
      ])

      if (!appointmentsResponse.ok) {
        if (appointmentsResponse.status === 403) {
          toast.error("Acesso negado")
          router.push("/login")
          return
        }
        throw new Error("Failed to fetch appointments")
      }
      const data = await appointmentsResponse.json()
      setAppointments(data.appointments)
      setGroupSessions(groupSessionsData.groupSessions)
    } catch {
      toast.error("Erro ao carregar agenda")
    }
  }, [weekStart, activeProfessionalProfileId, isAdmin, selectedProfessionalId, router])

  // Group session handlers
  const openGroupSessionSheet = (session: GroupSession) => {
    setSelectedGroupSession(session)
    setIsGroupSessionSheetOpen(true)
  }

  const closeGroupSessionSheet = () => {
    setIsGroupSessionSheetOpen(false)
    setSelectedGroupSession(null)
  }

  // ============================================================================
  // Calendar Entry Create (non-CONSULTA types)
  // ============================================================================

  const {
    isSheetOpen: isEntrySheetOpen,
    openSheet: openEntrySheet,
    closeSheet: closeEntrySheet,
    entryType: createEntryType,
    form: entryForm,
    createProfessionalId: entryProfessionalId,
    setCreateProfessionalId: setEntryProfessionalId,
    isProfessionalLocked: isEntryProfessionalLocked,
    isRecurring: isEntryRecurring,
    setIsRecurring: setIsEntryRecurring,
    recurrenceEndType: entryRecurrenceEndType,
    setRecurrenceEndType: setEntryRecurrenceEndType,
    recurrenceEndDate: entryRecurrenceEndDate,
    setRecurrenceEndDate: setEntryRecurrenceEndDate,
    recurrenceOccurrences: entryRecurrenceOccurrences,
    setRecurrenceOccurrences: setEntryRecurrenceOccurrences,
    apiError: entryApiError,
    clearApiError: clearEntryApiError,
    isSaving: isSavingEntry,
    onSubmit: onSubmitEntry,
  } = useCalendarEntryCreate({
    selectedDate: weekStart,
    isAdmin,
    selectedProfessionalId,
    professionals,
    onSuccess: fetchAppointments,
  })

  // FAB menu state
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false)

  // ============================================================================
  // Create Appointment
  // ============================================================================

  function openCreateSheet(overrides?: { date?: Date; startTime?: string; appointmentType?: AppointmentType }) {
    setSelectedPatient(null)
    setPatientSearch("")
    setCreateProfessionalId(selectedProfessionalId || "")
    setCreateApiError(null)
    // Default to WEEKLY recurring appointment with no end date, unless overridden
    setAppointmentType(overrides?.appointmentType || "WEEKLY")
    setRecurrenceEndType("INDEFINITE")
    setRecurrenceEndDate("")
    setRecurrenceOccurrences(10)
    const effectiveDate = overrides?.date || weekStart
    reset({
      patientId: "",
      date: toDisplayDateFromDate(effectiveDate),
      startTime: overrides?.startTime || "",
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
    setAppointmentType("WEEKLY")
  }

  // Handle alternate week click (biweekly appointments)
  const handleAlternateWeekClick = useCallback(async (appointment: Appointment) => {
    const scheduledAt = new Date(appointment.scheduledAt)
    const startTime = `${scheduledAt.getHours().toString().padStart(2, "0")}:${scheduledAt.getMinutes().toString().padStart(2, "0")}`

    if (appointment.alternateWeekInfo?.isAvailable) {
      // No one scheduled — open create form pre-filled for the alternate date
      const alternateDate = new Date(scheduledAt)
      alternateDate.setDate(alternateDate.getDate() + 7)
      openCreateSheet({ date: alternateDate, startTime, appointmentType: "BIWEEKLY" })
    } else if (appointment.alternateWeekInfo?.pairedAppointmentId) {
      // Someone is paired — fetch the paired appointment and open edit sheet
      const paired = await fetchAppointmentById(appointment.alternateWeekInfo.pairedAppointmentId)
      if (paired) {
        openEditSheet(paired)
      }
    }
  }, [])

  const handleFabMenuSelect = useCallback((type: CalendarEntryType | "CONSULTA") => {
    setIsFabMenuOpen(false)
    if (type === "CONSULTA") {
      openCreateSheet()
    } else {
      openEntrySheet(type as Exclude<CalendarEntryType, "CONSULTA">)
    }
  }, [openEntrySheet])

  function handleSelectPatient(patient: Patient) {
    setSelectedPatient(patient)
    setValue("patientId", patient.id)
    setPatientSearch(patient.name)
  }

  async function onSubmitAppointment(data: AppointmentFormData) {
    // Clear any previous API error
    setCreateApiError(null)

    // For admin, require a professional to be selected
    const effectiveProfessionalId = selectedProfessionalId || createProfessionalId
    if (isAdmin && !effectiveProfessionalId) {
      setCreateApiError("Selecione um profissional")
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

      // Only add recurrence if not SINGLE
      const isRecurring = appointmentType !== "SINGLE"
      if (isRecurring) {
        body.recurrence = {
          recurrenceType: appointmentType,
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
          setCreateApiError(`${result.error} (Ocorrencia ${result.occurrenceIndex})`)
        } else {
          setCreateApiError(result.error || "Erro ao criar agendamento")
        }
        return
      }

      if (isRecurring && result.totalOccurrences) {
        toast.success(`${result.totalOccurrences} agendamentos criados com sucesso`)
      } else {
        toast.success("Agendamento criado com sucesso")
      }

      closeCreateSheet()
      fetchAppointments()
    } catch {
      setCreateApiError("Erro ao criar agendamento")
    } finally {
      setIsSavingAppointment(false)
    }
  }

  // ============================================================================
  // Edit Appointment
  // ============================================================================

  function openEditSheet(appointment: Appointment) {
    setSelectedAppointment(appointment)
    setEditApiError(null)
    const scheduledDate = new Date(appointment.scheduledAt)
    const endDate = new Date(appointment.endAt)
    const durationMinutes = Math.round((endDate.getTime() - scheduledDate.getTime()) / 60000)

    editForm.reset({
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

    // Clear any previous API error
    setEditApiError(null)

    setIsUpdatingAppointment(true)
    try {
      const scheduledAt = toLocalDateTime(data.date, data.startTime)

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
        setEditApiError(result.error || "Erro ao atualizar agendamento")
        return
      }

      toast.success("Agendamento atualizado com sucesso")
      closeEditSheet()
      fetchAppointments()
    } catch {
      setEditApiError("Erro ao atualizar agendamento")
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
  // Delete Appointment
  // ============================================================================

  async function handleDeleteAppointment() {
    if (!selectedAppointment) return

    setIsDeletingAppointment(true)
    try {
      const response = await fetch(`/api/appointments/${selectedAppointment.id}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || "Erro ao excluir agendamento")
        return
      }

      toast.success("Agendamento excluido com sucesso")
      setIsDeleteDialogOpen(false)
      closeEditSheet()
      fetchAppointments()
    } catch {
      toast.error("Erro ao excluir agendamento")
    } finally {
      setIsDeletingAppointment(false)
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
        const startDateStr = toDateString(weekStart)
        const endDateStr = toDateString(getWeekEnd(weekStart))
        const profId = isAdmin && selectedProfessionalId ? selectedProfessionalId : ""

        const params = new URLSearchParams({ startDate: startDateStr, endDate: endDateStr })
        if (profId) params.set("professionalProfileId", profId)

        // Fetch appointments and group sessions in parallel
        const [appointmentsResponse, groupSessionsData] = await Promise.all([
          fetch(`/api/appointments?${params.toString()}`, {
            signal: abortController.signal,
          }),
          fetchGroupSessions({
            startDate: weekStart,
            endDate: getWeekEnd(weekStart),
            professionalProfileId: profId || undefined,
            signal: abortController.signal,
          }),
        ])

        if (abortController.signal.aborted) return

        if (!appointmentsResponse.ok) {
          if (appointmentsResponse.status === 403) {
            toast.error("Acesso negado")
            router.push("/login")
            return
          }
          throw new Error("Failed to fetch appointments")
        }

        const appointmentsData = await appointmentsResponse.json()

        if (abortController.signal.aborted) return

        setAppointments(appointmentsData.appointments)
        setGroupSessions(groupSessionsData.groupSessions)
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

  // Update appointment duration from session for non-admins
  useEffect(() => {
    if (!isAdmin && session?.user?.appointmentDuration) {
      setAppointmentDuration(session.user.appointmentDuration)
    }
  }, [isAdmin, session?.user?.appointmentDuration])

  // Update appointment duration when professionals data is available (for admins)
  useEffect(() => {
    if (isAdmin && professionals.length > 0 && activeProfessionalProfileId) {
      const prof = professionals.find(p => p.professionalProfile?.id === activeProfessionalProfileId)
      if (prof?.professionalProfile?.appointmentDuration) {
        setAppointmentDuration(prof.professionalProfile.appointmentDuration)
      }
    }
  }, [isAdmin, professionals, activeProfessionalProfileId])

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

      {/* Week change swipe zone (outside the grid) */}
      <SwipeContainer onSwipeLeft={goToNextWeek} onSwipeRight={goToPreviousWeek} className="max-w-6xl mx-auto px-4 pt-4">
        <p className="text-xs text-muted-foreground text-center mb-4 flex items-center justify-center gap-2">
          <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
          Deslize para mudar a semana
          <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
        </p>
      </SwipeContainer>

      {/* Weekly Grid - scrolls horizontally on mobile */}
      <div className="max-w-6xl mx-auto px-4 pb-4">
        <WeeklyGrid
          weekStart={weekStart}
          appointments={appointments}
          groupSessions={groupSessions}
          onAppointmentClick={openEditSheet}
          onGroupSessionClick={openGroupSessionSheet}
          onAlternateWeekClick={handleAlternateWeekClick}
          showProfessional={!selectedProfessionalId && isAdmin}
        />
      </div>

      {/* FAB + menu rendered via portal to escape PageTransition's will-change containing block */}
      {typeof document !== "undefined" && createPortal(
        <>
          <FAB onClick={() => setIsFabMenuOpen(true)} label="Novo" />

          {isFabMenuOpen && (
            <div className="fixed inset-0 z-40">
              <div className="absolute inset-0 bg-black/30" onClick={() => setIsFabMenuOpen(false)} />
              <div className="absolute right-4 bottom-24 z-50 flex flex-col-reverse items-end gap-2">
                {/* Close button */}
                <button
                  onClick={() => setIsFabMenuOpen(false)}
                  className="w-14 h-14 rounded-full bg-muted text-muted-foreground shadow-lg flex items-center justify-center hover:bg-muted/80 transition-colors"
                  aria-label="Fechar menu"
                >
                  <XIcon className="w-6 h-6" />
                </button>

                {/* Menu items */}
                <button
                  onClick={() => handleFabMenuSelect("CONSULTA")}
                  className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <StethoscopeIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Consulta</span>
                </button>

                <button
                  onClick={() => handleFabMenuSelect("TAREFA")}
                  className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <ClipboardListIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Tarefa</span>
                </button>

                <button
                  onClick={() => handleFabMenuSelect("LEMBRETE")}
                  className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                    <BellIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Lembrete</span>
                </button>

                <button
                  onClick={() => handleFabMenuSelect("NOTA")}
                  className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900/30 flex items-center justify-center">
                    <StickyNoteIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Nota</span>
                </button>

                <button
                  onClick={() => handleFabMenuSelect("REUNIAO")}
                  className="flex items-center gap-3 bg-white dark:bg-card rounded-full shadow-lg pl-4 pr-5 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <UsersRoundIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Reuniao</span>
                </button>
              </div>
            </div>
          )}
        </>,
        document.body
      )}

      {/* Create Appointment Sheet */}
      <Sheet isOpen={isCreateSheetOpen} onClose={closeCreateSheet} title="Novo Agendamento">
        <form onSubmit={handleSubmit(onSubmitAppointment)} className="p-4 space-y-6">
          {/* 1. Patient Selection */}
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

          {/* Section header */}
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Detalhes
          </p>

          {/* 2. Date */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-foreground mb-1.5">Data *</label>
            <input id="date" type="text" placeholder="DD/MM/AAAA" {...register("date")} className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors" />
            {errors.date && <p className="text-xs text-destructive mt-1">{errors.date.message}</p>}
          </div>

          {/* Time + Duration + End Time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-1.5">Inicio *</label>
              <input
                id="startTime"
                type="text"
                placeholder="HH:MM"
                pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                {...register("startTime")}
                className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
              />
              {errors.startTime && <p className="text-xs text-destructive mt-1">{errors.startTime.message}</p>}
            </div>
            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-foreground mb-1.5">Duracao</label>
              <input id="duration" type="number" {...register("duration", { setValueAs: (v: string) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v) })} placeholder={`${appointmentDuration}`} min={15} max={480} step={5} className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Fim</label>
              <div className="h-11 px-3.5 rounded-xl border border-input bg-muted/50 text-foreground text-sm flex items-center">
                {calculateEndTime(watch("startTime"), watch("duration") || appointmentDuration) || "—"}
              </div>
            </div>
          </div>

          {/* 3. Appointment Type (Weekly/Biweekly/Monthly/One-time) */}
          <RecurrenceOptions
            appointmentType={appointmentType}
            onAppointmentTypeChange={setAppointmentType}
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

          {/* 4. Professional selector for admin */}
          {isAdmin && (
            <div>
              <label htmlFor="createProfessional" className="block text-sm font-medium text-foreground mb-1.5">Profissional *</label>
              {selectedProfessionalId ? (
                <div className="w-full h-11 px-3.5 rounded-xl border border-input bg-muted text-foreground text-sm flex items-center">
                  {professionals.find(p => p.professionalProfile?.id === selectedProfessionalId)?.name || "Profissional selecionado"}
                </div>
              ) : (
                <select
                  id="createProfessional"
                  value={createProfessionalId}
                  onChange={(e) => setCreateProfessionalId(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
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

          {/* Duration hint */}
          <p className="text-xs text-muted-foreground -mt-2">Duracao padrao: {appointmentDuration} min</p>

          {/* 6. Modality */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Modalidade *</label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="relative cursor-pointer">
                <input type="radio" value="PRESENCIAL" {...register("modality")} className="sr-only peer" />
                <div className="h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-input bg-background text-foreground text-sm font-medium peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary transition-all">
                  <BuildingIcon className="w-4 h-4" />
                  Presencial
                </div>
              </label>
              <label className="relative cursor-pointer">
                <input type="radio" value="ONLINE" {...register("modality")} className="sr-only peer" />
                <div className="h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-input bg-background text-foreground text-sm font-medium peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary transition-all">
                  <VideoIcon className="w-4 h-4" />
                  Online
                </div>
              </label>
            </div>
          </div>

          {/* 7. Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1.5">Observacoes</label>
            <textarea id="notes" rows={3} {...register("notes")} placeholder="Observacoes sobre a consulta..." className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors resize-none" />
          </div>

          {/* API Error Alert */}
          <InlineAlert message={createApiError} onDismiss={() => setCreateApiError(null)} />

          <div className="flex gap-3 pt-4 pb-8">
            <button type="button" onClick={closeCreateSheet} className="flex-1 h-12 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors">Cancelar</button>
            <button type="submit" disabled={isSavingAppointment || !selectedPatient || (isAdmin && !selectedProfessionalId && !createProfessionalId)} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
              {isSavingAppointment ? "Salvando..." : "Criar Agendamento"}
            </button>
          </div>
        </form>
      </Sheet>

      {/* Edit Appointment Sheet */}
      <AppointmentEditor
        isOpen={isEditSheetOpen}
        onClose={closeEditSheet}
        appointment={selectedAppointment}
        form={editForm}
        isUpdating={isUpdatingAppointment}
        onSubmit={onSubmitEdit}
        apiError={editApiError}
        onDismissError={() => setEditApiError(null)}
        canMarkStatus={canMarkStatus(selectedAppointment)}
        onUpdateStatus={handleUpdateStatus}
        isUpdatingStatus={isUpdatingStatus}
        canResendConfirmation={canResendConfirmation(selectedAppointment)}
        onResendConfirmation={handleResendConfirmation}
        isResendingConfirmation={isResendingConfirmation}
        canCancel={canCancelAppointment(selectedAppointment)}
        onCancelClick={() => setIsCancelDialogOpen(true)}
        isDeleteDialogOpen={isDeleteDialogOpen}
        setIsDeleteDialogOpen={setIsDeleteDialogOpen}
        isDeletingAppointment={isDeletingAppointment}
        onDeleteAppointment={handleDeleteAppointment}
        onToggleException={handleToggleException}
        isManagingException={isManagingException}
        onRecurrenceSave={fetchAppointments}
      />

      {/* Cancel Dialog */}
      <CancelDialog
        isOpen={isCancelDialogOpen}
        onClose={() => setIsCancelDialogOpen(false)}
        appointment={selectedAppointment}
        onConfirm={handleCancelAppointment}
      />

      {/* Group Session Sheet */}
      <GroupSessionSheet
        isOpen={isGroupSessionSheetOpen}
        onClose={closeGroupSessionSheet}
        session={selectedGroupSession}
        onStatusUpdated={fetchAppointments}
      />

      {/* Calendar Entry Sheet */}
      <CalendarEntrySheet
        isOpen={isEntrySheetOpen}
        onClose={closeEntrySheet}
        entryType={createEntryType}
        form={entryForm}
        isAdmin={isAdmin}
        professionals={professionals}
        createProfessionalId={entryProfessionalId}
        setCreateProfessionalId={setEntryProfessionalId}
        isProfessionalLocked={isEntryProfessionalLocked}
        selectedProfessionalId={selectedProfessionalId}
        isRecurring={isEntryRecurring}
        setIsRecurring={setIsEntryRecurring}
        recurrenceEndType={entryRecurrenceEndType}
        setRecurrenceEndType={setEntryRecurrenceEndType}
        recurrenceEndDate={entryRecurrenceEndDate}
        setRecurrenceEndDate={setEntryRecurrenceEndDate}
        recurrenceOccurrences={entryRecurrenceOccurrences}
        setRecurrenceOccurrences={setEntryRecurrenceOccurrences}
        apiError={entryApiError}
        onDismissError={clearEntryApiError}
        isSaving={isSavingEntry}
        onSubmit={onSubmitEntry}
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
