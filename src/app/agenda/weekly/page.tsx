"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  SwipeContainer,
} from "@/shared/components/ui"

import {
  Professional,
  Appointment,
  CancelType,
  EditAppointmentFormData,
  editAppointmentSchema,
  GroupSession,
  AvailabilityRule,
  AvailabilityException,
  BiweeklyHint,
} from "../lib"

import { fetchGroupSessions } from "../services/groupSessionService"
import { fetchAppointmentById } from "../services/appointmentService"

import {
  DEFAULT_APPOINTMENT_DURATION,
} from "../lib/constants"

import {
  toDateString,
  toLocalDateTime,
  canCancelAppointment,
  canMarkStatus,
  canResendConfirmation,
  getWeekStart,
  getWeekEnd,
} from "../lib/utils"

import {
  CancelDialog,
  AppointmentEditor,
  GroupSessionSheet,
  CalendarEntrySheet,
  CreateAppointmentSheet,
  AgendaFabMenu,
} from "../components"
import type { CalendarEntryType } from "../lib/types"

import { useCalendarEntryCreate, useAppointmentCreate } from "../hooks"
import { useWeeklyAvailability } from "./hooks/useWeeklyAvailability"
import { useAgendaContext } from "../context/AgendaContext"
import { usePermission } from "@/shared/hooks/usePermission"

import { WeeklyGrid, WeeklyHeader } from "./components"

function WeeklyAgendaPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const { selectedDate, setSelectedDate, selectedProfessionalId, setSelectedProfessionalId } = useAgendaContext()

  // Handle URL date parameter on mount
  useEffect(() => {
    const dateParam = searchParams.get("date")
    if (dateParam) {
      setSelectedDate(getWeekStart(new Date(dateParam + "T12:00:00")))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive weekStart from the shared selectedDate
  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate])

  // Core state
  const [isLoading, setIsLoading] = useState(true)
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  // Use session's appointmentDuration for non-admins, default for admins (will be updated when selecting professional)
  const [appointmentDuration, setAppointmentDuration] = useState(
    session?.user?.appointmentDuration || DEFAULT_APPOINTMENT_DURATION
  )

  // Availability data (for showing available slots when a professional is selected)
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([])
  const [availabilityExceptions, setAvailabilityExceptions] = useState<AvailabilityException[]>([])
  const [biweeklyHints, setBiweeklyHints] = useState<BiweeklyHint[]>([])
  const [birthdayPatients, setBirthdayPatients] = useState<{ id: string; name: string; date?: string }[]>([])

  // Group session sheet state
  const [isGroupSessionSheetOpen, setIsGroupSessionSheetOpen] = useState(false)
  const [selectedGroupSession, setSelectedGroupSession] = useState<GroupSession | null>(null)

  // Edit appointment state
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [isUpdatingAppointment, setIsUpdatingAppointment] = useState(false)
  const [editApiError, setEditApiError] = useState<string | null>(null)
  const [editAdditionalProfIds, setEditAdditionalProfIds] = useState<string[]>([])

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

  const editForm = useForm<EditAppointmentFormData>({
    resolver: zodResolver(editAppointmentSchema),
  })

  const { canRead: canReadOthersAgenda } = usePermission("agenda_others")
  const isAdmin = canReadOthersAgenda
  const currentProfessionalProfileId = session?.user?.professionalProfileId
  const activeProfessionalProfileId = isAdmin && selectedProfessionalId
    ? selectedProfessionalId
    : currentProfessionalProfileId

  // ============================================================================
  // Week Navigation
  // ============================================================================

  function goToPreviousWeek() {
    const newDate = new Date(weekStart)
    newDate.setDate(newDate.getDate() - 7)
    setSelectedDate(newDate)
  }

  function goToNextWeek() {
    const newDate = new Date(weekStart)
    newDate.setDate(newDate.getDate() + 7)
    setSelectedDate(newDate)
  }

  function goToToday() {
    setSelectedDate(new Date())
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
  // Create Appointment (shared hook)
  // ============================================================================

  const {
    isCreateSheetOpen,
    openCreateSheet,
    closeCreateSheet,
    form: createForm,
    patientSearch,
    setPatientSearch,
    selectedPatient,
    handleSelectPatient,
    handleClearPatient,
    createProfessionalId: createApptProfessionalId,
    setCreateProfessionalId: setCreateApptProfessionalId,
    isProfessionalLocked: isApptProfessionalLocked,
    appointmentType,
    setAppointmentType,
    recurrenceEndType,
    setRecurrenceEndType,
    recurrenceEndDate,
    setRecurrenceEndDate,
    recurrenceOccurrences,
    setRecurrenceOccurrences,
    additionalProfessionalIds: createAdditionalProfIds,
    setAdditionalProfessionalIds: setCreateAdditionalProfIds,
    appointmentDuration: hookAppointmentDuration,
    apiError: createApiError,
    clearApiError: clearCreateApiError,
    isSaving: isSavingAppointment,
    onSubmit: onSubmitAppointment,
  } = useAppointmentCreate({
    selectedDate: weekStart,
    isAdmin,
    selectedProfessionalId,
    professionals,
    onSuccess: fetchAppointments,
    appointmentDuration,
  })

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
    recurrenceType: entryRecurrenceType,
    setRecurrenceType: setEntryRecurrenceType,
    recurrenceEndType: entryRecurrenceEndType,
    setRecurrenceEndType: setEntryRecurrenceEndType,
    recurrenceEndDate: entryRecurrenceEndDate,
    setRecurrenceEndDate: setEntryRecurrenceEndDate,
    recurrenceOccurrences: entryRecurrenceOccurrences,
    setRecurrenceOccurrences: setEntryRecurrenceOccurrences,
    additionalProfessionalIds: entryAdditionalProfIds,
    setAdditionalProfessionalIds: setEntryAdditionalProfIds,
    selectedPatient: entrySelectedPatient,
    setSelectedPatient: setEntrySelectedPatient,
    patientSearch: entryPatientSearch,
    setPatientSearch: setEntryPatientSearch,
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

  // Handle alternate week click (biweekly appointments)
  const handleAlternateWeekClick = useCallback(async (appointment: Appointment) => {
    const scheduledAt = new Date(appointment.scheduledAt)
    const startTime = `${scheduledAt.getHours().toString().padStart(2, "0")}:${scheduledAt.getMinutes().toString().padStart(2, "0")}`

    if (appointment.alternateWeekInfo?.isAvailable) {
      const alternateDate = new Date(scheduledAt)
      alternateDate.setDate(alternateDate.getDate() + 7)
      openCreateSheet(startTime, { date: alternateDate, appointmentType: "BIWEEKLY" })
    } else if (appointment.alternateWeekInfo?.pairedAppointmentId) {
      const paired = await fetchAppointmentById(appointment.alternateWeekInfo.pairedAppointmentId)
      if (paired) {
        openEditSheet(paired)
      }
    }
  }, [openCreateSheet, openEditSheet])

  const handleFabMenuSelect = useCallback((type: CalendarEntryType | "CONSULTA") => {
    setIsFabMenuOpen(false)
    if (type === "CONSULTA") {
      openCreateSheet()
    } else {
      openEntrySheet(type as Exclude<CalendarEntryType, "CONSULTA">)
    }
  }, [openCreateSheet, openEntrySheet])

  // ============================================================================
  // Edit Appointment
  // ============================================================================

  function openEditSheet(appointment: Appointment) {
    setSelectedAppointment(appointment)
    setEditApiError(null)
    setEditAdditionalProfIds(
      appointment.additionalProfessionals?.map(ap => ap.professionalProfile.id) || []
    )
    const scheduledDate = new Date(appointment.scheduledAt)
    const endDate = new Date(appointment.endAt)
    const durationMinutes = Math.round((endDate.getTime() - scheduledDate.getTime()) / 60000)

    editForm.reset({
      date: toDateString(scheduledDate),
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
        additionalProfessionalIds: editAdditionalProfIds,
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
      setIsDataLoading(true)
      try {
        const startDateStr = toDateString(weekStart)
        const endDateStr = toDateString(getWeekEnd(weekStart))
        const profId = isAdmin && selectedProfessionalId ? selectedProfessionalId : ""

        const params = new URLSearchParams({ startDate: startDateStr, endDate: endDateStr })
        if (profId) params.set("professionalProfileId", profId)

        // Build parallel fetch list: appointments + group sessions always, availability when professional selected
        const fetches: Promise<unknown>[] = [
          fetch(`/api/appointments?${params.toString()}`, {
            signal: abortController.signal,
          }),
          fetchGroupSessions({
            startDate: weekStart,
            endDate: getWeekEnd(weekStart),
            professionalProfileId: profId || undefined,
            signal: abortController.signal,
          }),
        ]

        // Fetch availability rules + exceptions when a specific professional is selected
        const effectiveProfId = profId || (!isAdmin ? activeProfessionalProfileId : "")
        if (effectiveProfId) {
          fetches.push(
            fetch(`/api/availability?professionalProfileId=${effectiveProfId}`, {
              signal: abortController.signal,
            }),
            fetch(`/api/availability/exceptions?professionalProfileId=${effectiveProfId}`, {
              signal: abortController.signal,
            }),
          )
        }

        const results = await Promise.all(fetches)

        if (abortController.signal.aborted) return

        const appointmentsResponse = results[0] as Response
        const groupSessionsData = results[1] as { groupSessions: GroupSession[] }

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
        setBiweeklyHints(appointmentsData.biweeklyHints || [])
        setBirthdayPatients(appointmentsData.birthdayPatients || [])

        // Process availability data if fetched
        if (effectiveProfId && results.length > 2) {
          const rulesResponse = results[2] as Response
          const exceptionsResponse = results[3] as Response

          if (rulesResponse.ok) {
            const rulesData = await rulesResponse.json()
            setAvailabilityRules(rulesData.rules || [])
          } else {
            setAvailabilityRules([])
          }

          if (exceptionsResponse.ok) {
            const exceptionsData = await exceptionsResponse.json()
            setAvailabilityExceptions(exceptionsData.exceptions || [])
          } else {
            setAvailabilityExceptions([])
          }
        } else {
          setAvailabilityRules([])
          setAvailabilityExceptions([])
          setBiweeklyHints([])
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        toast.error("Erro ao carregar agenda")
      } finally {
        setIsDataLoading(false)
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
  // Weekly Availability (available slots for each day)
  // ============================================================================

  const weeklyAvailabilitySlots = useWeeklyAvailability({
    weekStart,
    availabilityRules,
    availabilityExceptions,
    appointments,
    groupSessions,
    biweeklyHints,
    appointmentDuration,
    selectedProfessionalId: activeProfessionalProfileId || "",
  })

  const handleAvailabilitySlotClick = useCallback((date: string, time: string) => {
    openCreateSheet(time, { date: new Date(date + "T12:00:00") })
  }, [openCreateSheet])

  const handleBiweeklyHintClick = useCallback((date: string, time: string) => {
    openCreateSheet(time, { date: new Date(date + "T12:00:00"), appointmentType: "BIWEEKLY" })
  }, [openCreateSheet])

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
      <WeeklyHeader
        weekStart={weekStart}
        professionals={professionals}
        selectedProfessionalId={selectedProfessionalId}
        isAdmin={isAdmin}
        onPreviousWeek={goToPreviousWeek}
        onNextWeek={goToNextWeek}
        onToday={goToToday}
        onSelectProfessional={setSelectedProfessionalId}
      />

      {/* Week change swipe zone (outside the grid) */}
      <SwipeContainer onSwipeLeft={goToNextWeek} onSwipeRight={goToPreviousWeek} className="max-w-6xl mx-auto px-4 pt-4">
        <p className="text-xs text-muted-foreground text-center mb-4 flex items-center justify-center gap-2">
          <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
          Deslize para mudar a semana
          <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
        </p>
      </SwipeContainer>

      {/* Weekly Grid - scrolls horizontally on mobile */}
      <div className="max-w-6xl mx-auto px-4 pb-4 relative">
        {isDataLoading && (
          <div className="absolute inset-0 bg-background/60 z-20 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card px-4 py-2 rounded-full shadow-sm border border-border">
              <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
              Carregando...
            </div>
          </div>
        )}
        <WeeklyGrid
          weekStart={weekStart}
          appointments={appointments}
          groupSessions={groupSessions}
          availabilitySlots={weeklyAvailabilitySlots}
          appointmentDuration={appointmentDuration}
          birthdayPatients={birthdayPatients}
          onAppointmentClick={openEditSheet}
          onGroupSessionClick={openGroupSessionSheet}
          onAlternateWeekClick={handleAlternateWeekClick}
          onAvailabilitySlotClick={handleAvailabilitySlotClick}
          onBiweeklyHintClick={handleBiweeklyHintClick}
          showProfessional={!selectedProfessionalId && isAdmin}
        />
      </div>

      {/* FAB + menu rendered via portal to escape PageTransition's will-change containing block */}
      <AgendaFabMenu
        isOpen={isFabMenuOpen}
        onOpen={() => setIsFabMenuOpen(true)}
        onClose={() => setIsFabMenuOpen(false)}
        onSelect={handleFabMenuSelect}
      />

      {/* Create Appointment Sheet */}
      <CreateAppointmentSheet
        isOpen={isCreateSheetOpen}
        onClose={closeCreateSheet}
        form={createForm}
        patientSearch={patientSearch}
        onPatientSearchChange={setPatientSearch}
        selectedPatient={selectedPatient}
        onSelectPatient={handleSelectPatient}
        onClearPatient={handleClearPatient}
        appointmentType={appointmentType}
        onAppointmentTypeChange={setAppointmentType}
        recurrenceEndType={recurrenceEndType}
        onRecurrenceEndTypeChange={setRecurrenceEndType}
        recurrenceEndDate={recurrenceEndDate}
        onRecurrenceEndDateChange={setRecurrenceEndDate}
        recurrenceOccurrences={recurrenceOccurrences}
        onRecurrenceOccurrencesChange={setRecurrenceOccurrences}
        isAdmin={isAdmin}
        professionals={professionals}
        createProfessionalId={createApptProfessionalId}
        onCreateProfessionalIdChange={setCreateApptProfessionalId}
        isProfessionalLocked={isApptProfessionalLocked}
        selectedProfessionalId={selectedProfessionalId}
        additionalProfessionalIds={createAdditionalProfIds}
        onAdditionalProfessionalIdsChange={setCreateAdditionalProfIds}
        appointmentDuration={hookAppointmentDuration}
        apiError={createApiError}
        onDismissError={clearCreateApiError}
        isSaving={isSavingAppointment}
        onSubmit={onSubmitAppointment}
      />

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
        professionals={professionals}
        editAdditionalProfIds={editAdditionalProfIds}
        setEditAdditionalProfIds={setEditAdditionalProfIds}
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
        professionals={professionals}
        isAdmin={isAdmin}
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
        recurrenceType={entryRecurrenceType}
        setRecurrenceType={setEntryRecurrenceType}
        recurrenceEndType={entryRecurrenceEndType}
        setRecurrenceEndType={setEntryRecurrenceEndType}
        recurrenceEndDate={entryRecurrenceEndDate}
        setRecurrenceEndDate={setEntryRecurrenceEndDate}
        recurrenceOccurrences={entryRecurrenceOccurrences}
        setRecurrenceOccurrences={setEntryRecurrenceOccurrences}
        additionalProfessionalIds={entryAdditionalProfIds}
        setAdditionalProfessionalIds={setEntryAdditionalProfIds}
        selectedPatient={entrySelectedPatient}
        onSelectPatient={(p) => { setEntrySelectedPatient(p); setEntryPatientSearch(p.name) }}
        onClearPatient={() => { setEntrySelectedPatient(null); setEntryPatientSearch("") }}
        patientSearch={entryPatientSearch}
        onPatientSearchChange={setEntryPatientSearch}
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
