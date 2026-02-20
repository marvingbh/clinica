"use client"

import {
  BuildingIcon,
  VideoIcon,
} from "@/shared/components/ui"

import {
  Sheet,
  PatientSearch,
  RecurrenceOptions,
  InlineAlert,
  TimeInput,
} from "../../components"

import { calculateEndTime } from "../../lib/utils"
import type { CreateAppointmentFormProps } from "./types"

export function CreateAppointmentForm({
  isOpen,
  onClose,
  register,
  watch,
  errors,
  onSubmit,
  // Patient search
  patientSearch,
  onPatientSearchChange,
  selectedPatient,
  onSelectPatient,
  onClearPatient,
  // Recurrence
  appointmentType,
  onAppointmentTypeChange,
  recurrenceEndType,
  onRecurrenceEndTypeChange,
  recurrenceOccurrences,
  onRecurrenceOccurrencesChange,
  recurrenceEndDate,
  onRecurrenceEndDateChange,
  watchedDate,
  watchedStartTime,
  // Professional
  isAdmin,
  professionals,
  selectedProfessionalId,
  createProfessionalId,
  onCreateProfessionalIdChange,
  // Additional professionals
  createAdditionalProfIds,
  onCreateAdditionalProfIdsChange,
  // Duration
  appointmentDuration,
  // Saving
  isSaving,
  // API error
  apiError,
  onDismissError,
}: CreateAppointmentFormProps) {
  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Novo Agendamento">
      <form onSubmit={onSubmit} className="p-4 space-y-6">
        {/* 1. Patient Selection */}
        <PatientSearch
          value={patientSearch}
          onChange={(v) => {
            onPatientSearchChange(v)
          }}
          selectedPatient={selectedPatient}
          onSelectPatient={onSelectPatient}
          onClearPatient={onClearPatient}
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
          <input id="date" type="date" {...register("date")} className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors" />
          {errors.date && <p className="text-xs text-destructive mt-1">{errors.date.message}</p>}
        </div>

        {/* Time + Duration + End Time */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-1.5">Inicio *</label>
            <TimeInput
              id="startTime"
              placeholder="HH:MM"
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
              {calculateEndTime(watch("startTime"), watch("duration") || appointmentDuration) || "\u2014"}
            </div>
          </div>
        </div>

        {/* 3. Appointment Type (Weekly/Biweekly/Monthly/One-time) */}
        <RecurrenceOptions
          appointmentType={appointmentType}
          onAppointmentTypeChange={onAppointmentTypeChange}
          recurrenceEndType={recurrenceEndType}
          onRecurrenceEndTypeChange={onRecurrenceEndTypeChange}
          occurrences={recurrenceOccurrences}
          onOccurrencesChange={onRecurrenceOccurrencesChange}
          endDate={recurrenceEndDate}
          onEndDateChange={onRecurrenceEndDateChange}
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
                onChange={(e) => onCreateProfessionalIdChange(e.target.value)}
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
                          onCreateAdditionalProfIdsChange([...createAdditionalProfIds, id])
                        } else {
                          onCreateAdditionalProfIdsChange(createAdditionalProfIds.filter(x => x !== id))
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
        <InlineAlert message={apiError} onDismiss={onDismissError} />

        <div className="flex gap-3 pt-4 pb-8">
          <button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors">Cancelar</button>
          <button type="submit" disabled={isSaving || !selectedPatient || (isAdmin && !selectedProfessionalId && !createProfessionalId)} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
            {isSaving ? "Salvando..." : "Criar Agendamento"}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
