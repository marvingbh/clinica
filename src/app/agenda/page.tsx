"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  FAB,
  BuildingIcon,
  VideoIcon,
} from "@/shared/components/ui"

import {
  canCancelAppointment,
  canMarkStatus,
  canResendConfirmation,
} from "./lib/utils"

import { toDateString } from "./lib/utils"

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
} from "./components"

import type { GroupSession } from "./lib/types"

import {
  useDateNavigation,
  useAgendaData,
  useTimeSlots,
  useAppointmentCreate,
  useAppointmentEdit,
  useAppointmentActions,
} from "./hooks"

import { createProfessionalColorMap } from "./lib/professional-colors"

export default function AgendaPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)

  const isAdmin = session?.user?.role === "ADMIN"
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

  // Professional color map for consistent coloring
  const professionalColorMap = useMemo(() => {
    const professionalIds = appointments.map(apt => apt.professionalProfile.id)
    return createProfessionalColorMap(professionalIds)
  }, [appointments])

  // Time slots
  const { slots: timeSlots, fullDayBlock } = useTimeSlots({
    selectedDate,
    availabilityRules,
    availabilityExceptions,
    appointments,
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
        timeSlots={timeSlots}
        groupSessions={groupSessions}
        fullDayBlock={fullDayBlock}
        selectedDate={toDateString(selectedDate)}
        selectedProfessionalId={selectedProfessionalId}
        isAdmin={isAdmin}
        isLoading={isLoadingData}
        onSlotClick={openCreateSheet}
        onAppointmentClick={openEditSheet}
        onGroupSessionClick={openGroupSessionSheet}
        onSwipeLeft={goToNextDay}
        onSwipeRight={goToPreviousDay}
        professionalColorMap={professionalColorMap}
      />

      {/* FAB */}
      <FAB onClick={() => openCreateSheet()} label="Novo agendamento" />

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

          {/* 2. Date + Time (same row) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-foreground mb-2">Data *</label>
              <input id="date" type="text" placeholder="DD/MM/AAAA" {...createForm.register("date")} className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              {createForm.formState.errors.date && <p className="text-sm text-destructive mt-1">{createForm.formState.errors.date.message}</p>}
            </div>
            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-2">Horario *</label>
              <input
                id="startTime"
                type="text"
                placeholder="Ex: 14:30"
                pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                {...createForm.register("startTime")}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {createForm.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{createForm.formState.errors.startTime.message}</p>}
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
              <label htmlFor="createProfessional" className="block text-sm font-medium text-foreground mb-2">Profissional *</label>
              {isProfessionalLocked ? (
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

          {/* 5. Duration */}
          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-foreground mb-2">Duracao (minutos)</label>
            <input id="duration" type="number" {...createForm.register("duration", { setValueAs: (v) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v) })} placeholder={`Padrao: ${appointmentDuration} minutos`} min={15} max={480} step={5} className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <p className="text-xs text-muted-foreground mt-1">Se nao informado, usa a duracao padrao ({appointmentDuration} min)</p>
          </div>

          {/* 6. Modality */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Modalidade *</label>
            <div className="grid grid-cols-2 gap-3">
              <label className="relative flex items-center justify-center cursor-pointer">
                <input type="radio" value="PRESENCIAL" {...createForm.register("modality")} className="sr-only peer" />
                <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary">
                  <BuildingIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">Presencial</span>
                </div>
              </label>
              <label className="relative flex items-center justify-center cursor-pointer">
                <input type="radio" value="ONLINE" {...createForm.register("modality")} className="sr-only peer" />
                <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary">
                  <VideoIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">Online</span>
                </div>
              </label>
            </div>
          </div>

          {/* 7. Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-2">Observacoes</label>
            <textarea id="notes" rows={3} {...createForm.register("notes")} placeholder="Observacoes sobre a consulta..." className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

          {/* API Error Alert */}
          <InlineAlert message={createApiError} onDismiss={clearCreateApiError} />

          <div className="flex gap-3 pt-4 pb-8">
            <button type="button" onClick={closeCreateSheet} className="flex-1 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={isSavingAppointment || !selectedPatient || (isAdmin && !isProfessionalLocked && !createProfessionalId)} className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
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
      />
    </main>
  )
}
