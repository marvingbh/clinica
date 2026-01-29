"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  BottomNavigation,
  FAB,
  BuildingIcon,
  VideoIcon,
} from "@/shared/components/ui"

import {
  canCancelAppointment,
  canMarkStatus,
  canResendConfirmation,
} from "./lib"

import {
  STATUS_LABELS,
  STATUS_COLORS,
} from "./lib/constants"

import { formatPhone, toDateString } from "./lib/utils"

// Format date to Brazilian format (DD/MM/YYYY)
function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split("-")
  return `${day}/${month}/${year}`
}

// Format time to 24h format (HH:mm)
function formatTimeBR(timeStr: string): string {
  return timeStr.slice(0, 5)
}

import {
  Sheet,
  PatientSearch,
  RecurrenceOptions,
  CancelDialog,
  RecurrenceEditSheet,
  RecurrenceIndicator,
  AgendaHeader,
  AgendaTimeline,
  AgendaPageSkeleton,
} from "./components"

import {
  useDateNavigation,
  useAgendaData,
  useTimeSlots,
  useAppointmentCreate,
  useAppointmentEdit,
  useAppointmentActions,
} from "./hooks"

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
    availabilityRules,
    availabilityExceptions,
    professionals,
    appointmentDuration,
    selectedProfessionalId,
    setSelectedProfessionalId,
    refetchAppointments,
  } = useAgendaData({
    selectedDate,
    isAdmin,
    currentProfessionalProfileId,
    isAuthenticated: status === "authenticated",
  })

  // Time slots
  const timeSlots = useTimeSlots({
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
    isRecurrenceEnabled,
    setIsRecurrenceEnabled,
    recurrenceType,
    setRecurrenceType,
    recurrenceEndType,
    setRecurrenceEndType,
    recurrenceEndDate,
    setRecurrenceEndDate,
    recurrenceOccurrences,
    setRecurrenceOccurrences,
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
    isRecurrenceEditSheetOpen,
    setIsRecurrenceEditSheetOpen,
    handleToggleException,
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
    return (
      <>
        <AgendaPageSkeleton />
        <BottomNavigation />
      </>
    )
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
        selectedProfessionalId={selectedProfessionalId}
        isAdmin={isAdmin}
        onSlotClick={openCreateSheet}
        onAppointmentClick={openEditSheet}
        onSwipeLeft={goToNextDay}
        onSwipeRight={goToPreviousDay}
      />

      {/* FAB */}
      <FAB onClick={() => openCreateSheet()} label="Novo agendamento" />

      {/* Create Appointment Sheet */}
      <Sheet isOpen={isCreateSheetOpen} onClose={closeCreateSheet} title="Novo Agendamento">
        <form onSubmit={createForm.handleSubmit(onSubmitAppointment)} className="p-4 space-y-6">
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

          {/* Professional selector for admin */}
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

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-foreground mb-2">Data *</label>
            <input id="date" type="text" placeholder="DD/MM/AAAA" {...createForm.register("date")} className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            {createForm.formState.errors.date && <p className="text-sm text-destructive mt-1">{createForm.formState.errors.date.message}</p>}
          </div>

          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-2">Horario * (HH:mm)</label>
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

          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-foreground mb-2">Duracao (minutos)</label>
            <input id="duration" type="number" {...createForm.register("duration", { setValueAs: (v) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v) })} placeholder={`Padrao: ${appointmentDuration} minutos`} min={15} max={480} step={5} className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <p className="text-xs text-muted-foreground mt-1">Se nao informado, usa a duracao padrao ({appointmentDuration} min)</p>
          </div>

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

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-2">Observacoes</label>
            <textarea id="notes" rows={3} {...createForm.register("notes")} placeholder="Observacoes sobre a consulta..." className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
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
            <button type="submit" disabled={isSavingAppointment || !selectedPatient || (isAdmin && !isProfessionalLocked && !createProfessionalId)} className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
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

            <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="p-4 space-y-6">
              <div>
                <label htmlFor="editDate" className="block text-sm font-medium text-foreground mb-2">Data *</label>
                <input id="editDate" type="text" placeholder="DD/MM/AAAA" {...editForm.register("date")} className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                {editForm.formState.errors.date && <p className="text-sm text-destructive mt-1">{editForm.formState.errors.date.message}</p>}
              </div>

              <div>
                <label htmlFor="editStartTime" className="block text-sm font-medium text-foreground mb-2">Horario * (HH:mm)</label>
                <input
                  id="editStartTime"
                  type="text"
                  placeholder="Ex: 14:30"
                  pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                  {...editForm.register("startTime")}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {editForm.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{editForm.formState.errors.startTime.message}</p>}
              </div>

              <div>
                <label htmlFor="editDuration" className="block text-sm font-medium text-foreground mb-2">Duracao (minutos)</label>
                <input id="editDuration" type="number" {...editForm.register("duration", { setValueAs: (v) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v) })} min={15} max={480} step={5} className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Modalidade *</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="relative flex items-center justify-center cursor-pointer">
                    <input type="radio" value="PRESENCIAL" {...editForm.register("modality")} className="sr-only peer" />
                    <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary">
                      <span className="text-sm font-medium">Presencial</span>
                    </div>
                  </label>
                  <label className="relative flex items-center justify-center cursor-pointer">
                    <input type="radio" value="ONLINE" {...editForm.register("modality")} className="sr-only peer" />
                    <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary">
                      <span className="text-sm font-medium">Online</span>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="editPrice" className="block text-sm font-medium text-foreground mb-2">Valor (R$)</label>
                <input id="editPrice" type="number" step="0.01" {...editForm.register("price", { valueAsNumber: true })} placeholder="0.00" className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              <div>
                <label htmlFor="editNotes" className="block text-sm font-medium text-foreground mb-2">Observacoes</label>
                <textarea id="editNotes" rows={3} {...editForm.register("notes")} className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
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
        onSave={refetchAppointments}
      />

      {/* Bottom Navigation */}
      <BottomNavigation />
    </main>
  )
}
