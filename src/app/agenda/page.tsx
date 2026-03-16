"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

import { canMarkStatus, canResendConfirmation, toDateString } from "./lib/utils"
import {
  AppointmentEditor, AgendaHeader, AgendaTimeline, AgendaPageSkeleton,
  GroupSessionSheet, CalendarEntrySheet, AgendaFabMenu, CreateAppointmentSheet,
} from "./components"
import { CreateGroupSessionSheet } from "./components/CreateGroupSessionSheet"
import { AgendaDndWrapper } from "./components/AgendaDndWrapper"
import type { Appointment } from "./lib/types"
import {
  useDateNavigation, useAgendaData, useTimeSlots,
  useAppointmentCreate, useAppointmentEdit, useAppointmentActions,
  useCalendarEntryCreate, useGroupSessionSheet, useFabMenu, useBiweeklyHandlers,
} from "./hooks"
import { createProfessionalColorMap } from "./lib/professional-colors"
import { usePermission } from "@/shared/hooks/usePermission"
import { useAppointmentDrag } from "./hooks/useAppointmentDrag"
import { DAILY_GRID_BASE } from "./lib/grid-config"

export default function AgendaPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)

  const { canRead: canReadOthersAgenda } = usePermission("agenda_others")
  const { canWrite: canWriteAgenda } = usePermission("agenda_own")
  const isAdmin = canReadOthersAgenda
  const currentProfessionalProfileId = session?.user?.professionalProfileId

  // Date navigation
  const {
    selectedDate,
    setSelectedDate,
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

  // Group session sheet (shared hook)
  const groupSheet = useGroupSessionSheet(groupSessions)

  // Professional color map for consistent coloring
  const professionalColorMap = useMemo(() => {
    const professionalIds = [
      ...appointments.map(apt => apt.professionalProfile.id),
      ...groupSessions.map(gs => gs.professionalProfileId),
    ]
    return createProfessionalColorMap(professionalIds)
  }, [appointments, groupSessions])

  // Drag-and-drop: only in single-professional view with write permission
  const isDndEnabled = canWriteAgenda && !!selectedProfessionalId

  const handleDailyAppointmentMoved = useCallback((updated: Appointment) => {
    // Apply PATCH response locally, then defer full refetch for consistency
    refetchAppointments()
  }, [refetchAppointments])

  const drag = useAppointmentDrag({
    appointments,
    gridConfig: DAILY_GRID_BASE,
    canWriteAgenda: isDndEnabled,
    onAppointmentMoved: handleDailyAppointmentMoved,
    onBulkChange: refetchAppointments,
  })

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
    availabilityWarning: createAvailabilityWarning,
    onConfirmAvailabilityOverride: onConfirmCreateAvailabilityOverride,
    clearAvailabilityWarning: clearCreateAvailabilityWarning,
    isSaving: isSavingAppointment,
    onSubmit: onSubmitAppointment,
  } = useAppointmentCreate({
    selectedDate,
    isAdmin,
    selectedProfessionalId,
    professionals,
    onSuccess: refetchAppointments,
    appointmentDuration,
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
    availabilityWarning: entryAvailabilityWarning,
    onConfirmAvailabilityOverride: onConfirmEntryAvailabilityOverride,
    clearAvailabilityWarning: clearEntryAvailabilityWarning,
    isSaving: isSavingEntry,
    onSubmit: onSubmitEntry,
  } = useCalendarEntryCreate({
    selectedDate,
    isAdmin,
    selectedProfessionalId,
    professionals,
    onSuccess: refetchAppointments,
  })

  // Shared hooks
  const { handleAlternateWeekClick } = useBiweeklyHandlers(openCreateSheet, openEditSheet)
  const handleBiweeklyHintClick = useCallback((time: string) => {
    openCreateSheet(time, { appointmentType: "BIWEEKLY" })
  }, [openCreateSheet])
  const [isGroupSessionSheetOpen, setIsGroupSessionSheetOpen] = useState(false)
  const openGroupSessionSheet = useCallback(() => setIsGroupSessionSheetOpen(true), [])
  const closeGroupSessionSheet = useCallback(() => setIsGroupSessionSheetOpen(false), [])
  const fabMenu = useFabMenu(openCreateSheet, openEntrySheet, openGroupSessionSheet)

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

  if (status === "loading" || isLoading) {
    return <AgendaPageSkeleton />
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      <AgendaHeader
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        selectedProfessionalId={selectedProfessionalId}
        onProfessionalChange={setSelectedProfessionalId}
        professionals={professionals}
        isAdmin={isAdmin}
        onGoToPrevious={goToPreviousDay}
        onGoToNext={goToNextDay}
        onGoToToday={goToToday}
      />

      <AgendaDndWrapper drag={drag}>
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
          onGroupSessionClick={groupSheet.open}
          onAlternateWeekClick={handleAlternateWeekClick}
          onBiweeklyHintClick={handleBiweeklyHintClick}
          onSwipeLeft={goToNextDay}
          onSwipeRight={goToPreviousDay}
          professionalColorMap={professionalColorMap}
          canWriteAgenda={isDndEnabled}
          isDragging={drag.isDragging}
          projectedMinutes={drag.projectedMinutes}
          overlappingIds={drag.overlappingIds}
          activeAppointmentId={drag.activeAppointment?.id}
        />
      </AgendaDndWrapper>

      <AgendaFabMenu
        isOpen={fabMenu.isOpen}
        onOpen={fabMenu.open}
        onClose={fabMenu.close}
        onSelect={fabMenu.handleSelect}
      />

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
        createProfessionalId={createProfessionalId}
        onCreateProfessionalIdChange={setCreateProfessionalId}
        isProfessionalLocked={isProfessionalLocked}
        selectedProfessionalId={selectedProfessionalId}
        additionalProfessionalIds={createAdditionalProfIds}
        onAdditionalProfessionalIdsChange={setCreateAdditionalProfIds}
        appointmentDuration={appointmentDuration}
        apiError={createApiError}
        onDismissError={clearCreateApiError}
        availabilityWarning={createAvailabilityWarning}
        onConfirmAvailabilityOverride={onConfirmCreateAvailabilityOverride}
        onDismissAvailabilityWarning={clearCreateAvailabilityWarning}
        isSaving={isSavingAppointment}
        onSubmit={onSubmitAppointment}
      />

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

      <GroupSessionSheet
        isOpen={groupSheet.isOpen}
        onClose={groupSheet.close}
        session={groupSheet.selectedSession}
        onStatusUpdated={refetchAppointments}
        professionals={professionals}
        isAdmin={isAdmin}
      />

      <CreateGroupSessionSheet
        isOpen={isGroupSessionSheetOpen}
        onClose={closeGroupSessionSheet}
        isAdmin={isAdmin}
        professionals={professionals}
        createProfessionalId={createProfessionalId}
        onCreateProfessionalIdChange={setCreateProfessionalId}
        isProfessionalLocked={isProfessionalLocked}
        selectedProfessionalId={selectedProfessionalId}
        additionalProfessionalIds={createAdditionalProfIds}
        onAdditionalProfessionalIdsChange={setCreateAdditionalProfIds}
        appointmentDuration={appointmentDuration}
        onCreated={refetchAppointments}
      />

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
        availabilityWarning={entryAvailabilityWarning}
        onConfirmAvailabilityOverride={onConfirmEntryAvailabilityOverride}
        onDismissAvailabilityWarning={clearEntryAvailabilityWarning}
        isSaving={isSavingEntry}
        onSubmit={onSubmitEntry}
      />
    </main>
  )
}
