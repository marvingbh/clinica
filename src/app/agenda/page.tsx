"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

import {
  canCancelAppointment,
  canMarkStatus,
  canResendConfirmation,
  toDateString,
} from "./lib/utils"

import {
  CancelDialog,
  AppointmentEditor,
  AgendaHeader,
  AgendaTimeline,
  AgendaPageSkeleton,
  GroupSessionSheet,
  CalendarEntrySheet,
  AgendaFabMenu,
  CreateAppointmentSheet,
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

  const openGroupSessionSheet = (gs: GroupSession) => {
    setSelectedGroupSession(gs)
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
      const alternateDate = new Date(scheduledAt)
      alternateDate.setDate(alternateDate.getDate() + 7)
      setSelectedDate(alternateDate)
      setTimeout(() => {
        openCreateSheet(startTime, { date: alternateDate, appointmentType: "BIWEEKLY" })
      }, 100)
    } else if (appointment.alternateWeekInfo?.pairedAppointmentId) {
      const paired = await fetchAppointmentById(appointment.alternateWeekInfo.pairedAppointmentId)
      if (paired) {
        openEditSheet(paired)
      }
    }
  }, [setSelectedDate, openCreateSheet, openEditSheet])

  // Handle biweekly hint click
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

      <AgendaFabMenu
        isOpen={isFabMenuOpen}
        onOpen={() => setIsFabMenuOpen(true)}
        onClose={() => setIsFabMenuOpen(false)}
        onSelect={handleFabMenuSelect}
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

      <CancelDialog
        isOpen={isCancelDialogOpen}
        onClose={() => setIsCancelDialogOpen(false)}
        appointment={selectedAppointment}
        onConfirm={handleCancelAppointment}
      />

      <GroupSessionSheet
        isOpen={isGroupSessionSheetOpen}
        onClose={closeGroupSessionSheet}
        session={selectedGroupSession}
        onStatusUpdated={refetchAppointments}
        professionals={professionals}
        isAdmin={isAdmin}
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
        apiError={entryApiError}
        onDismissError={clearEntryApiError}
        isSaving={isSavingEntry}
        onSubmit={onSubmitEntry}
      />
    </main>
  )
}
