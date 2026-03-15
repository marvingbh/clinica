"use client"

import { Suspense, useCallback, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { SwipeContainer } from "@/shared/components/ui"

import type { Appointment, GroupSession, CalendarEntryType } from "../lib"
import { fetchAppointmentById } from "../services/appointmentService"
import { toDateString, canMarkStatus, canResendConfirmation, getWeekStart } from "../lib/utils"
import {
  AppointmentEditor,
  GroupSessionSheet,
  CalendarEntrySheet,
  CreateAppointmentSheet,
  AgendaFabMenu,
} from "../components"

import { useCalendarEntryCreate, useAppointmentCreate, useAppointmentEdit, useAppointmentActions } from "../hooks"
import { useWeeklyAvailability } from "./hooks/useWeeklyAvailability"
import { useWeeklyData } from "./hooks/useWeeklyData"
import { useAgendaContext } from "../context/AgendaContext"

import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core"
import { snapCenterToCursor } from "@dnd-kit/modifiers"
import { WeeklyGrid, WeeklyHeader } from "./components"
import { useAppointmentDrag } from "../hooks/useAppointmentDrag"
import { RecurrenceMoveDialog } from "../components/RecurrenceMoveDialog"
import { DragGhostCard } from "../components/DragGhostCard"
import { WEEKLY_GRID } from "../lib/grid-config"

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

  // ============================================================================
  // Group Session Sheet
  // ============================================================================

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

  // ============================================================================
  // FAB Menu + Biweekly Handlers
  // ============================================================================

  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false)

  const handleFabMenuSelect = useCallback((type: CalendarEntryType | "CONSULTA") => {
    setIsFabMenuOpen(false)
    if (type === "CONSULTA") { create.openCreateSheet() }
    else { entry.openSheet(type as Exclude<CalendarEntryType, "CONSULTA">) }
  }, [create.openCreateSheet, entry.openSheet])

  const handleAlternateWeekClick = useCallback(async (appointment: Appointment) => {
    const scheduledAt = new Date(appointment.scheduledAt)
    const startTime = `${scheduledAt.getHours().toString().padStart(2, "0")}:${scheduledAt.getMinutes().toString().padStart(2, "0")}`

    if (appointment.alternateWeekInfo?.isAvailable) {
      const alternateDate = new Date(scheduledAt)
      alternateDate.setDate(alternateDate.getDate() + 7)
      create.openCreateSheet(startTime, { date: alternateDate, appointmentType: "BIWEEKLY" })
    } else if (appointment.alternateWeekInfo?.pairedAppointmentId) {
      const paired = await fetchAppointmentById(appointment.alternateWeekInfo.pairedAppointmentId)
      if (paired) edit.openEditSheet(paired)
    }
  }, [create.openCreateSheet, edit.openEditSheet])

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

      <SwipeContainer onSwipeLeft={goToNextWeek} onSwipeRight={goToPreviousWeek} className="max-w-6xl mx-auto px-4 pt-4">
        <p className="text-xs text-muted-foreground text-center mb-4 flex items-center justify-center gap-2">
          <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
          Deslize para mudar a semana
          <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
        </p>
      </SwipeContainer>

      <div className="max-w-6xl mx-auto px-4 pb-4 relative">
        {isDataLoading && (
          <div className="absolute inset-0 bg-background/60 z-20 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card px-4 py-2 rounded-full shadow-sm border border-border">
              <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
              Carregando...
            </div>
          </div>
        )}
        <DndContext
          sensors={drag.sensors}
          collisionDetection={closestCenter}
          onDragStart={drag.handleDragStart}
          onDragMove={drag.handleDragMove}
          onDragEnd={drag.handleDragEnd}
          onDragCancel={drag.handleDragCancel}
          autoScroll={{ threshold: { x: 0.15, y: 0.15 } }}
        >
          <div>
            <WeeklyGrid
              weekStart={weekStart}
              appointments={appointments}
              groupSessions={groupSessions}
              availabilitySlots={weeklyAvailabilitySlots}
              availabilitySlots={weeklyAvailabilitySlots}
              appointmentDuration={appointmentDuration}
              birthdayPatients={birthdayPatients}
              onAppointmentClick={edit.openEditSheet}
              onGroupSessionClick={openGroupSessionSheet}
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
            />
          </div>

          <DragOverlay
            modifiers={[snapCenterToCursor]}
            dropAnimation={{ duration: 200, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }}
            zIndex={50}
          >
            {drag.activeAppointment ? (
              <DragGhostCard appointment={drag.activeAppointment} projectedMinutes={drag.projectedMinutes} />
            ) : null}
          </DragOverlay>
        </DndContext>

        <RecurrenceMoveDialog
          request={drag.recurrenceMoveRequest}
          onMoveThis={drag.handleRecurrenceMoveThis}
          onMoveAllFuture={drag.handleRecurrenceMoveAllFuture}
          onCancel={drag.handleRecurrenceCancel}
          isSubmitting={drag.isUpdating}
        />
      </div>

      <AgendaFabMenu
        isOpen={isFabMenuOpen}
        onOpen={() => setIsFabMenuOpen(true)}
        onClose={() => setIsFabMenuOpen(false)}
        onSelect={handleFabMenuSelect}
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
