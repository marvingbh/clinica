"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  FAB,
  BuildingIcon,
  VideoIcon,
  PlusIcon,
  StethoscopeIcon,
  ClipboardListIcon,
  BellIcon,
  StickyNoteIcon,
  UsersRoundIcon,
  XIcon,
} from "@/shared/components/ui"

import {
  canCancelAppointment,
  canMarkStatus,
  canResendConfirmation,
} from "./lib/utils"

import { toDateString, calculateEndTime } from "./lib/utils"

import {
  Sheet,
  PatientSearch,
  RecurrenceOptions,
  CancelDialog,
  AppointmentEditor,
  AgendaHeader,
  AgendaTimeline,
  AgendaPageSkeleton,
  InlineAlert,
  GroupSessionSheet,
  CalendarEntrySheet,
  TimeInput,
} from "./components"

import type { Appointment, GroupSession, CalendarEntryType } from "./lib/types"

import {
  useDateNavigation,
  useAgendaData,
  useTimeSlots,
  useAppointmentCreate,
  useAppointmentEdit,
  useAppointmentActions,
  useCalendarEntryCreate,
} from "./hooks"

import { fetchAppointmentById } from "./services"
import { createProfessionalColorMap } from "./lib/professional-colors"
import { usePermission } from "@/shared/hooks/usePermission"

export default function AgendaPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)

  const { canRead: canReadOthersAgenda } = usePermission("agenda_others")
  const isAdmin = canReadOthersAgenda
  const currentProfessionalProfileId = session?.user?.professionalProfileId

  // Date navigation
  const {
    selectedDate,
    setSelectedDate,
    showDatePicker,
    setShowDatePicker,
    goToPreviousDay,
    goToNextDay,
    goToToday,
  } = useDateNavigation()

  // Agenda data
  const {
    appointments,
    biweeklyHints,
    birthdayPatients,
    groupSessions,
    availabilityRules,
    availabilityExceptions,
    professionals,
    appointmentDuration,
    selectedProfessionalId,
    setSelectedProfessionalId,
    refetchAppointments,
    isLoadingData,
  } = useAgendaData({
    selectedDate,
    isAdmin,
    currentProfessionalProfileId,
    currentAppointmentDuration: session?.user?.appointmentDuration,
    isAuthenticated: status === "authenticated",
  })

  // Group session sheet state
  const [isGroupSessionSheetOpen, setIsGroupSessionSheetOpen] = useState(false)
  const [selectedGroupSession, setSelectedGroupSession] = useState<GroupSession | null>(null)

  const openGroupSessionSheet = (session: GroupSession) => {
    setSelectedGroupSession(session)
    setIsGroupSessionSheetOpen(true)
  }

  const closeGroupSessionSheet = () => {
    setIsGroupSessionSheetOpen(false)
    setSelectedGroupSession(null)
  }

  // Update selectedGroupSession when groupSessions data refreshes
  useEffect(() => {
    if (selectedGroupSession && groupSessions.length > 0) {
      const updatedSession = groupSessions.find(
        s => s.groupId === selectedGroupSession.groupId && s.scheduledAt === selectedGroupSession.scheduledAt
      )
      if (updatedSession) {
        setSelectedGroupSession(updatedSession)
      }
    }
  }, [groupSessions, selectedGroupSession])

  // Professional color map for consistent coloring (includes both appointment and group session professionals)
  const professionalColorMap = useMemo(() => {
    const professionalIds = [
      ...appointments.map(apt => apt.professionalProfile.id),
      ...groupSessions.map(gs => gs.professionalProfileId),
    ]
    return createProfessionalColorMap(professionalIds)
  }, [appointments, groupSessions])

  // Time slots
  const { slots: timeSlots, fullDayBlock } = useTimeSlots({
    selectedDate,
    availabilityRules,
    availabilityExceptions,
    appointments,
    groupSessions,
    biweeklyHints,
    appointmentDuration,
    isAdmin,
    selectedProfessionalId,
  })

  // Create appointment
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
    createProfessionalId,
    setCreateProfessionalId,
    isProfessionalLocked,
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
    apiError: createApiError,
    clearApiError: clearCreateApiError,
    isSaving: isSavingAppointment,
    onSubmit: onSubmitAppointment,
  } = useAppointmentCreate({
    selectedDate,
    isAdmin,
    selectedProfessionalId,
    professionals,
    onSuccess: refetchAppointments,
  })

  // Edit appointment
  const {
    isEditSheetOpen,
    openEditSheet,
    closeEditSheet,
    selectedAppointment,
    setSelectedAppointment,
    form: editForm,
    editAdditionalProfIds,
    setEditAdditionalProfIds,
    apiError: editApiError,
    clearApiError: clearEditApiError,
    isUpdating: isUpdatingAppointment,
    onSubmit: onSubmitEdit,
  } = useAppointmentEdit({
    appointmentDuration,
    onSuccess: refetchAppointments,
  })

  // Appointment actions
  const {
    isCancelDialogOpen,
    setIsCancelDialogOpen,
    handleCancelAppointment,
    isUpdatingStatus,
    handleUpdateStatus,
    isResendingConfirmation,
    handleResendConfirmation,
    isManagingException,
    handleToggleException,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isDeletingAppointment,
    handleDeleteAppointment,
  } = useAppointmentActions({
    selectedAppointment,
    setSelectedAppointment,
    closeEditSheet,
    onSuccess: refetchAppointments,
  })

  // Calendar entry create
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
    additionalProfessionalIds: entryAdditionalProfIds,
    setAdditionalProfessionalIds: setEntryAdditionalProfIds,
    apiError: entryApiError,
    clearApiError: clearEntryApiError,
    isSaving: isSavingEntry,
    onSubmit: onSubmitEntry,
  } = useCalendarEntryCreate({
    selectedDate,
    isAdmin,
    selectedProfessionalId,
    professionals,
    onSuccess: refetchAppointments,
  })

  // Handle alternate week click (biweekly appointments)
  const handleAlternateWeekClick = useCallback(async (appointment: Appointment) => {
    const scheduledAt = new Date(appointment.scheduledAt)
    const startTime = `${scheduledAt.getHours().toString().padStart(2, "0")}:${scheduledAt.getMinutes().toString().padStart(2, "0")}`

    if (appointment.alternateWeekInfo?.isAvailable) {
      // No one scheduled — open create form pre-filled for the alternate date
      const alternateDate = new Date(scheduledAt)
      alternateDate.setDate(alternateDate.getDate() + 7)
      setSelectedDate(alternateDate)
      setTimeout(() => {
        openCreateSheet(startTime, { date: alternateDate, appointmentType: "BIWEEKLY" })
      }, 100)
    } else if (appointment.alternateWeekInfo?.pairedAppointmentId) {
      // Someone is paired — fetch the paired appointment and open edit sheet
      const paired = await fetchAppointmentById(appointment.alternateWeekInfo.pairedAppointmentId)
      if (paired) {
        openEditSheet(paired)
      }
    }
  }, [setSelectedDate, openCreateSheet, openEditSheet])

  // Handle biweekly hint click — open create sheet pre-filled for biweekly
  const handleBiweeklyHintClick = useCallback((time: string) => {
    openCreateSheet(time, { appointmentType: "BIWEEKLY" })
  }, [openCreateSheet])

  // FAB menu state
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false)

  const handleFabMenuSelect = useCallback((type: CalendarEntryType | "CONSULTA") => {
    setIsFabMenuOpen(false)
    if (type === "CONSULTA") {
      openCreateSheet()
    } else {
      openEntrySheet(type as Exclude<CalendarEntryType, "CONSULTA">)
    }
  }, [openCreateSheet, openEntrySheet])

  // Watch form values for recurrence preview
  const watchedDate = createForm.watch("date")
  const watchedStartTime = createForm.watch("startTime")

  // Auth effect
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }
    if (status === "authenticated") {
      setIsLoading(false)
    }
  }, [status, router])

  // Loading state
  if (status === "loading" || isLoading) {
    return <AgendaPageSkeleton />
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      {/* Header */}
      <AgendaHeader
        selectedDate={selectedDate}
        onDateChange={(date) => {
          setSelectedDate(date)
          setShowDatePicker(false)
        }}
        showDatePicker={showDatePicker}
        onToggleDatePicker={() => setShowDatePicker(!showDatePicker)}
        selectedProfessionalId={selectedProfessionalId}
        onProfessionalChange={setSelectedProfessionalId}
        professionals={professionals}
        isAdmin={isAdmin}
        onGoToPrevious={goToPreviousDay}
        onGoToNext={goToNextDay}
        onGoToToday={goToToday}
      />

      {/* Timeline Content */}
      <AgendaTimeline
        appointments={appointments}
        timeSlots={timeSlots}
        groupSessions={groupSessions}
        birthdayPatients={birthdayPatients}
        fullDayBlock={fullDayBlock}
        selectedDate={toDateString(selectedDate)}
        selectedProfessionalId={selectedProfessionalId}
        isAdmin={isAdmin}
        isLoading={isLoadingData}
        onSlotClick={openCreateSheet}
        onAppointmentClick={openEditSheet}
        onGroupSessionClick={openGroupSessionSheet}
        onAlternateWeekClick={handleAlternateWeekClick}
        onBiweeklyHintClick={handleBiweeklyHintClick}
        onSwipeLeft={goToNextDay}
        onSwipeRight={goToPreviousDay}
        professionalColorMap={professionalColorMap}
      />

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
        <form onSubmit={createForm.handleSubmit(onSubmitAppointment)} className="p-4 space-y-6">
          {/* 1. Patient Selection */}
          <PatientSearch
            value={patientSearch}
            onChange={(v) => {
              setPatientSearch(v)
              if (selectedPatient && v !== selectedPatient.name) {
                handleClearPatient()
              }
            }}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClearPatient={handleClearPatient}
            error={createForm.formState.errors.patientId?.message}
          />
          <input type="hidden" {...createForm.register("patientId")} />

          {/* Section header */}
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Detalhes
          </p>

          {/* 2. Date */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-foreground mb-1.5">Data *</label>
            <input id="date" type="date" {...createForm.register("date")} className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors" />
            {createForm.formState.errors.date && <p className="text-xs text-destructive mt-1">{createForm.formState.errors.date.message}</p>}
          </div>

          {/* Time + Duration + End Time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-1.5">Inicio *</label>
              <TimeInput
                id="startTime"
                placeholder="HH:MM"
                {...createForm.register("startTime")}
                className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
              />
              {createForm.formState.errors.startTime && <p className="text-xs text-destructive mt-1">{createForm.formState.errors.startTime.message}</p>}
            </div>
            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-foreground mb-1.5">Duracao</label>
              <input id="duration" type="number" {...createForm.register("duration", { setValueAs: (v: string) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v) })} placeholder={`${appointmentDuration}`} min={15} max={480} step={5} className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Fim</label>
              <div className="h-11 px-3.5 rounded-xl border border-input bg-muted/50 text-foreground text-sm flex items-center">
                {calculateEndTime(createForm.watch("startTime"), createForm.watch("duration") || appointmentDuration) || "—"}
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
              {isProfessionalLocked ? (
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

          {/* 5. Additional professionals */}
          {professionals.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Profissionais adicionais</label>
              <div className="space-y-2 p-3 rounded-xl border border-input bg-background">
                {professionals
                  .filter(p => {
                    const profId = p.professionalProfile?.id
                    if (!profId) return false
                    const effectivePrimaryId = selectedProfessionalId || createProfessionalId
                    return profId !== effectivePrimaryId
                  })
                  .map(prof => (
                    <label key={prof.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createAdditionalProfIds.includes(prof.professionalProfile!.id)}
                        onChange={(e) => {
                          const id = prof.professionalProfile!.id
                          if (e.target.checked) {
                            setCreateAdditionalProfIds([...createAdditionalProfIds, id])
                          } else {
                            setCreateAdditionalProfIds(createAdditionalProfIds.filter(x => x !== id))
                          }
                        }}
                        className="w-4 h-4 rounded border-input text-primary focus:ring-ring/40"
                      />
                      <span className="text-sm">{prof.name}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}

          {/* Duration hint */}
          <p className="text-xs text-muted-foreground -mt-2">Duracao padrao: {appointmentDuration} min</p>

          {/* 6. Modality */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Modalidade *</label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="relative cursor-pointer">
                <input type="radio" value="PRESENCIAL" {...createForm.register("modality")} className="sr-only peer" />
                <div className="h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-input bg-background text-foreground text-sm font-medium peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary transition-all">
                  <BuildingIcon className="w-4 h-4" />
                  Presencial
                </div>
              </label>
              <label className="relative cursor-pointer">
                <input type="radio" value="ONLINE" {...createForm.register("modality")} className="sr-only peer" />
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
            <textarea id="notes" rows={3} {...createForm.register("notes")} placeholder="Observacoes sobre a consulta..." className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors resize-none" />
          </div>

          {/* API Error Alert */}
          <InlineAlert message={createApiError} onDismiss={clearCreateApiError} />

          <div className="flex gap-3 pt-4 pb-8">
            <button type="button" onClick={closeCreateSheet} className="flex-1 h-12 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors">Cancelar</button>
            <button type="submit" disabled={isSavingAppointment || !selectedPatient || (isAdmin && !isProfessionalLocked && !createProfessionalId)} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
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
        onDismissError={clearEditApiError}
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
        onRecurrenceSave={refetchAppointments}
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
        onStatusUpdated={refetchAppointments}
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
        recurrenceEndType={entryRecurrenceEndType}
        setRecurrenceEndType={setEntryRecurrenceEndType}
        recurrenceEndDate={entryRecurrenceEndDate}
        setRecurrenceEndDate={setEntryRecurrenceEndDate}
        recurrenceOccurrences={entryRecurrenceOccurrences}
        setRecurrenceOccurrences={setEntryRecurrenceOccurrences}
        additionalProfessionalIds={entryAdditionalProfIds}
        setAdditionalProfessionalIds={setEntryAdditionalProfIds}
        apiError={entryApiError}
        onDismissError={clearEntryApiError}
        isSaving={isSavingEntry}
        onSubmit={onSubmitEntry}
      />
    </main>
  )
}
