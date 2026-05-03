"use client"

import { Suspense, useCallback, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { SwipeContainer } from "@/shared/components/ui"

import type { Appointment } from "../lib"
import { canMarkStatus, canResendConfirmation, getWeekStart, getWeekDays, toDateString } from "../lib/utils"
import {
  AppointmentEditor, GroupSessionSheet, CalendarEntrySheet,
  CreateAppointmentSheet, AgendaFabMenu,
} from "../components"
import { BulkCancelDialog } from "../components/BulkCancelDialog"
import { CreateGroupSessionSheet } from "../components/CreateGroupSessionSheet"
import { AgendaDndWrapper } from "../components/AgendaDndWrapper"

import {
  useCalendarEntryCreate, useAppointmentCreate, useAppointmentEdit,
  useAppointmentActions, useGroupSessionSheet, useFabMenu, useBiweeklyHandlers,
} from "../hooks"
import { useWeeklyAvailability } from "./hooks/useWeeklyAvailability"
import { useWeeklyData } from "./hooks/useWeeklyData"
import { useAgendaContext } from "../context/AgendaContext"
import { usePermission } from "@/shared/hooks"

import { WeeklyGrid, WeeklyHeader } from "./components"
import { TodosStrip } from "../components/todos"
import { createProfessionalColorMap } from "../lib/professional-colors"
import { useAppointmentDrag } from "../hooks/useAppointmentDrag"
import { WEEKLY_GRID } from "../lib/grid-config"
import { AgendaPrintView } from "../components/AgendaPrintView"

function WeeklyAgendaPageContent() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const { selectedDate, setSelectedDate } = useAgendaContext()

  // Handle URL date parameter on mount
  const initialDate = searchParams.get("date")
  if (initialDate && selectedDate.toISOString().slice(0, 10) !== initialDate) {
    // Will be handled by effect below
  }

  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate])

  // ============================================================================
  // Data (extracted hook — replaces ~300 lines of inline state + fetching)
  // ============================================================================

  const data = useWeeklyData(weekStart)
  const {
    isAdmin, canWriteAgenda, selectedProfessionalId, setSelectedProfessionalId,
    activeProfessionalProfileId, appointments, setAppointments, groupSessions,
    professionals, appointmentDuration, availabilityRules, availabilityExceptions,
    biweeklyHints, birthdayPatients, isLoading, isDataLoading, refetchAppointments,
  } = data

  const { canWrite: canWriteOthersAgenda } = usePermission("agenda_others")
  const currentProfessionalProfileId = session?.user?.professionalProfileId

  // ============================================================================
  // Week Navigation
  // ============================================================================

  function goToPreviousWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setSelectedDate(d)
  }
  function goToNextWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setSelectedDate(d)
  }
  function goToToday() { setSelectedDate(new Date()) }

  // ============================================================================
  // Drag-and-Drop
  // ============================================================================

  const isDndEnabled = canWriteAgenda && !!selectedProfessionalId

  const handleAppointmentMoved = useCallback((updated: Appointment) => {
    setAppointments(prev => prev.map(apt => apt.id === updated.id ? updated : apt))
  }, [setAppointments])

  const drag = useAppointmentDrag({
    appointments,
    gridConfig: WEEKLY_GRID,
    canWriteAgenda: isDndEnabled,
    onAppointmentMoved: handleAppointmentMoved,
    onBulkChange: refetchAppointments,
  })

  // ============================================================================
  // Edit Appointment (shared hook — replaces ~70 lines of inline logic)
  // ============================================================================

  const edit = useAppointmentEdit({
    appointmentDuration,
    onSuccess: refetchAppointments,
  })

  // ============================================================================
  // Appointment Actions (shared hook — replaces ~140 lines of inline logic)
  // ============================================================================

  const actions = useAppointmentActions({
    selectedAppointment: edit.selectedAppointment,
    setSelectedAppointment: edit.setSelectedAppointment,
    closeEditSheet: edit.closeEditSheet,
    onSuccess: refetchAppointments,
  })

  // ============================================================================
  // Create Appointment
  // ============================================================================

  const create = useAppointmentCreate({
    selectedDate: weekStart,
    isAdmin,
    selectedProfessionalId,
    professionals,
    onSuccess: refetchAppointments,
    appointmentDuration,
  })

  // ============================================================================
  // Calendar Entry Create (non-CONSULTA types)
  // ============================================================================

  const entry = useCalendarEntryCreate({
    selectedDate: weekStart,
    isAdmin,
    selectedProfessionalId,
    professionals,
    onSuccess: refetchAppointments,
  })

  // Professional color map for legend
  const professionalColorMap = useMemo(() => {
    const ids = appointments.map(apt => apt.professionalProfile.id)
    return createProfessionalColorMap(ids)
  }, [appointments])

  // Map of professional profile id → display name (used by the print legend)
  const professionalNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of professionals) {
      if (p.professionalProfile?.id) map.set(p.professionalProfile.id, p.name)
    }
    return map
  }, [professionals])

  // Shared hooks
  const groupSheet = useGroupSessionSheet(groupSessions)
  const [isGroupSessionSheetOpen, setIsGroupSessionSheetOpen] = useState(false)
  const openGroupSessionSheet = useCallback(() => setIsGroupSessionSheetOpen(true), [])
  const closeGroupSessionSheet = useCallback(() => setIsGroupSessionSheetOpen(false), [])
  const fabMenu = useFabMenu(create.openCreateSheet, entry.openSheet, openGroupSessionSheet)

  // Bulk cancel dialog
  const [isBulkCancelOpen, setIsBulkCancelOpen] = useState(false)
  const openBulkCancel = useCallback(() => setIsBulkCancelOpen(true), [])
  const closeBulkCancel = useCallback(() => setIsBulkCancelOpen(false), [])
  const { handleAlternateWeekClick } = useBiweeklyHandlers(create.openCreateSheet, edit.openEditSheet)

  const handleAvailabilitySlotClick = useCallback((date: string, time: string) => {
    create.openCreateSheet(time, { date: new Date(date + "T12:00:00") })
  }, [create.openCreateSheet])

  const handleBiweeklyHintClick = useCallback((date: string, time: string) => {
    create.openCreateSheet(time, { date: new Date(date + "T12:00:00"), appointmentType: "BIWEEKLY" })
  }, [create.openCreateSheet])

  // ============================================================================
  // Availability Slots
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

  // ============================================================================
  // Render
  // ============================================================================

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background pb-20 agenda-print-root">
        <div className="max-w-[1320px] mx-auto px-4 md:px-6 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-1/3" />
            <div className="h-[600px] bg-muted rounded" />
          </div>
        </div>
      </main>
    )
  }

  const printCaption = isAdmin
    ? selectedProfessionalId
      ? `Profissional: ${professionals.find(p => p.professionalProfile?.id === selectedProfessionalId)?.name ?? ""}`
      : "Todos os profissionais"
    : undefined

  const showProfessionalLegend = isAdmin && !selectedProfessionalId

  return (
    <main className="min-h-screen bg-background pb-20 agenda-print-root">
      <AgendaPrintView
        mode="weekly"
        refDate={weekStart}
        weekStart={weekStart}
        appointments={appointments}
        groupSessions={groupSessions}
        caption={printCaption}
        professionalColorMap={showProfessionalLegend ? professionalColorMap : undefined}
        professionalNames={showProfessionalLegend ? professionalNames : undefined}
      />
      <div className="agenda-screen-only contents">
      <WeeklyHeader
        weekStart={weekStart}
        professionals={professionals}
        selectedProfessionalId={selectedProfessionalId}
        isAdmin={isAdmin}
        onPreviousWeek={goToPreviousWeek}
        onNextWeek={goToNextWeek}
        onToday={goToToday}
        onSelectProfessional={setSelectedProfessionalId}
        professionalColorMap={professionalColorMap}
        onBulkCancel={canWriteAgenda ? openBulkCancel : undefined}
      />

      <SwipeContainer onSwipeLeft={goToNextWeek} onSwipeRight={goToPreviousWeek} className="max-w-[1320px] mx-auto px-4 md:px-6 pt-4">
        <p className="text-xs text-muted-foreground text-center mb-4 flex items-center justify-center gap-2">
          <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
          Deslize para mudar a semana
          <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
        </p>
      </SwipeContainer>

      <div className="max-w-[1320px] mx-auto px-4 md:px-6 pb-4 relative">
        {isDataLoading && (
          <div className="absolute inset-0 bg-background/60 z-20 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card px-4 py-2 rounded-full shadow-sm border border-border">
              <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
              Carregando...
            </div>
          </div>
        )}
        <AgendaDndWrapper drag={drag} autoScrollThreshold={{ x: 0.15, y: 0.15 }}>
          <WeeklyGrid
            weekStart={weekStart}
            appointments={appointments}
            groupSessions={groupSessions}
            availabilitySlots={weeklyAvailabilitySlots}
            appointmentDuration={appointmentDuration}
            birthdayPatients={birthdayPatients}
            onAppointmentClick={edit.openEditSheet}
            onGroupSessionClick={groupSheet.open}
            onAlternateWeekClick={handleAlternateWeekClick}
            onAvailabilitySlotClick={handleAvailabilitySlotClick}
            onBiweeklyHintClick={handleBiweeklyHintClick}
            showProfessional={!selectedProfessionalId && isAdmin}
            canWriteAgenda={isDndEnabled}
            isDragging={drag.isDragging}
            projectedMinutes={drag.projectedMinutes}
            projectedDate={drag.projectedDate}
            overlappingIds={drag.overlappingIds}
            activeAppointmentId={drag.activeAppointment?.id}
            todosRow={
              <TodosStrip
                days={getWeekDays(weekStart).map(toDateString)}
                selectedProfessionalId={selectedProfessionalId}
                layout="row"
                professionalColorMap={professionalColorMap}
              />
            }
          />
        </AgendaDndWrapper>
      </div>

      <AgendaFabMenu
        isOpen={fabMenu.isOpen}
        onOpen={fabMenu.open}
        onClose={fabMenu.close}
        onSelect={fabMenu.handleSelect}
      />

      <CreateAppointmentSheet
        isOpen={create.isCreateSheetOpen}
        onClose={create.closeCreateSheet}
        form={create.form}
        patientSearch={create.patientSearch}
        onPatientSearchChange={create.setPatientSearch}
        selectedPatient={create.selectedPatient}
        onSelectPatient={create.handleSelectPatient}
        onClearPatient={create.handleClearPatient}
        appointmentType={create.appointmentType}
        onAppointmentTypeChange={create.setAppointmentType}
        recurrenceEndType={create.recurrenceEndType}
        onRecurrenceEndTypeChange={create.setRecurrenceEndType}
        recurrenceEndDate={create.recurrenceEndDate}
        onRecurrenceEndDateChange={create.setRecurrenceEndDate}
        recurrenceOccurrences={create.recurrenceOccurrences}
        onRecurrenceOccurrencesChange={create.setRecurrenceOccurrences}
        isAdmin={isAdmin}
        professionals={professionals}
        createProfessionalId={create.createProfessionalId}
        onCreateProfessionalIdChange={create.setCreateProfessionalId}
        isProfessionalLocked={create.isProfessionalLocked}
        selectedProfessionalId={selectedProfessionalId}
        additionalProfessionalIds={create.additionalProfessionalIds}
        onAdditionalProfessionalIdsChange={create.setAdditionalProfessionalIds}
        appointmentDuration={create.appointmentDuration}
        apiError={create.apiError}
        onDismissError={create.clearApiError}
        availabilityWarning={create.availabilityWarning}
        onConfirmAvailabilityOverride={create.onConfirmAvailabilityOverride}
        onDismissAvailabilityWarning={create.clearAvailabilityWarning}
        isSaving={create.isSaving}
        onSubmit={create.onSubmit}
      />

      <AppointmentEditor
        isOpen={edit.isEditSheetOpen}
        onClose={edit.closeEditSheet}
        appointment={edit.selectedAppointment}
        form={edit.form}
        isUpdating={edit.isUpdating}
        onSubmit={edit.onSubmit}
        apiError={edit.apiError}
        onDismissError={edit.clearApiError}
        canMarkStatus={canMarkStatus(edit.selectedAppointment)}
        onUpdateStatus={actions.handleUpdateStatus}
        isUpdatingStatus={actions.isUpdatingStatus}
        canResendConfirmation={canResendConfirmation(edit.selectedAppointment)}
        onResendConfirmation={actions.handleResendConfirmation}
        isResendingConfirmation={actions.isResendingConfirmation}
        isDeleteDialogOpen={actions.isDeleteDialogOpen}
        setIsDeleteDialogOpen={actions.setIsDeleteDialogOpen}
        isDeletingAppointment={actions.isDeletingAppointment}
        onDeleteAppointment={actions.handleDeleteAppointment}
        onToggleException={actions.handleToggleException}
        isManagingException={actions.isManagingException}
        onRecurrenceSave={refetchAppointments}
        professionals={professionals}
        editAdditionalProfIds={edit.editAdditionalProfIds}
        setEditAdditionalProfIds={edit.setEditAdditionalProfIds}
        onAttendingProfChange={edit.setEditAttendingProfId}
        editAttendingProfId={edit.editAttendingProfId}
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
        createProfessionalId={create.createProfessionalId}
        onCreateProfessionalIdChange={create.setCreateProfessionalId}
        isProfessionalLocked={create.isProfessionalLocked}
        selectedProfessionalId={selectedProfessionalId}
        additionalProfessionalIds={create.additionalProfessionalIds}
        onAdditionalProfessionalIdsChange={create.setAdditionalProfessionalIds}
        appointmentDuration={appointmentDuration}
        onCreated={refetchAppointments}
      />

      <CalendarEntrySheet
        isOpen={entry.isSheetOpen}
        onClose={entry.closeSheet}
        entryType={entry.entryType}
        form={entry.form}
        isAdmin={isAdmin}
        professionals={professionals}
        createProfessionalId={entry.createProfessionalId}
        setCreateProfessionalId={entry.setCreateProfessionalId}
        isProfessionalLocked={entry.isProfessionalLocked}
        selectedProfessionalId={selectedProfessionalId}
        isRecurring={entry.isRecurring}
        setIsRecurring={entry.setIsRecurring}
        recurrenceType={entry.recurrenceType}
        setRecurrenceType={entry.setRecurrenceType}
        recurrenceEndType={entry.recurrenceEndType}
        setRecurrenceEndType={entry.setRecurrenceEndType}
        recurrenceEndDate={entry.recurrenceEndDate}
        setRecurrenceEndDate={entry.setRecurrenceEndDate}
        recurrenceOccurrences={entry.recurrenceOccurrences}
        setRecurrenceOccurrences={entry.setRecurrenceOccurrences}
        additionalProfessionalIds={entry.additionalProfessionalIds}
        setAdditionalProfessionalIds={entry.setAdditionalProfessionalIds}
        selectedPatient={entry.selectedPatient}
        onSelectPatient={(p) => { entry.setSelectedPatient(p); entry.setPatientSearch(p.name) }}
        onClearPatient={() => { entry.setSelectedPatient(null); entry.setPatientSearch("") }}
        patientSearch={entry.patientSearch}
        onPatientSearchChange={entry.setPatientSearch}
        apiError={entry.apiError}
        onDismissError={entry.clearApiError}
        availabilityWarning={entry.availabilityWarning}
        onConfirmAvailabilityOverride={entry.onConfirmAvailabilityOverride}
        onDismissAvailabilityWarning={entry.clearAvailabilityWarning}
        isSaving={entry.isSaving}
        onSubmit={entry.onSubmit}
      />

      <BulkCancelDialog
        isOpen={isBulkCancelOpen}
        onClose={closeBulkCancel}
        onSuccess={refetchAppointments}
        initialDate={weekStart}
        professionals={professionals}
        canManageOthers={canWriteOthersAgenda}
        userProfessionalId={currentProfessionalProfileId ?? null}
        selectedProfessionalId={selectedProfessionalId}
      />
      </div>
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
