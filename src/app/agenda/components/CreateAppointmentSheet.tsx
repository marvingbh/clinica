"use client"

import { UseFormReturn } from "react-hook-form"
import { BuildingIcon, VideoIcon } from "@/shared/components/ui"
import { Sheet } from "./Sheet"
import { PatientSearch } from "./PatientSearch"
import { RecurrenceOptions } from "./RecurrenceOptions"
import { InlineAlert } from "./InlineAlert"
import { TimeInput } from "./TimeInput"
import { DateInput } from "./DateInput"
import { calculateEndTime } from "../lib/utils"
import type { AppointmentFormData, Professional, Patient, RecurrenceEndType } from "../lib/types"
import type { AppointmentType } from "./RecurrenceOptions"

interface CreateAppointmentSheetProps {
  isOpen: boolean
  onClose: () => void
  form: UseFormReturn<AppointmentFormData>
  // Patient search
  patientSearch: string
  onPatientSearchChange: (value: string) => void
  selectedPatient: Patient | null
  onSelectPatient: (patient: Patient) => void
  onClearPatient: () => void
  // Recurrence
  appointmentType: AppointmentType
  onAppointmentTypeChange: (type: AppointmentType) => void
  recurrenceEndType: RecurrenceEndType
  onRecurrenceEndTypeChange: (type: RecurrenceEndType) => void
  recurrenceEndDate: string
  onRecurrenceEndDateChange: (date: string) => void
  recurrenceOccurrences: number
  onRecurrenceOccurrencesChange: (n: number) => void
  // Professional
  isAdmin: boolean
  professionals: Professional[]
  createProfessionalId: string
  onCreateProfessionalIdChange: (id: string) => void
  isProfessionalLocked: boolean
  selectedProfessionalId: string | null
  // Additional professionals
  additionalProfessionalIds: string[]
  onAdditionalProfessionalIdsChange: (ids: string[]) => void
  // Other
  appointmentDuration: number
  apiError: string | null
  onDismissError: () => void
  isSaving: boolean
  onSubmit: (data: AppointmentFormData) => void
}

export function CreateAppointmentSheet({
  isOpen,
  onClose,
  form,
  patientSearch,
  onPatientSearchChange,
  selectedPatient,
  onSelectPatient,
  onClearPatient,
  appointmentType,
  onAppointmentTypeChange,
  recurrenceEndType,
  onRecurrenceEndTypeChange,
  recurrenceEndDate,
  onRecurrenceEndDateChange,
  recurrenceOccurrences,
  onRecurrenceOccurrencesChange,
  isAdmin,
  professionals,
  createProfessionalId,
  onCreateProfessionalIdChange,
  isProfessionalLocked,
  selectedProfessionalId,
  additionalProfessionalIds,
  onAdditionalProfessionalIdsChange,
  appointmentDuration,
  apiError,
  onDismissError,
  isSaving,
  onSubmit,
}: CreateAppointmentSheetProps) {
  const watchedDate = form.watch("date")
  const watchedStartTime = form.watch("startTime")

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Novo Agendamento">
      <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 space-y-6">
        {/* 1. Patient Selection */}
        <PatientSearch
          value={patientSearch}
          onChange={onPatientSearchChange}
          selectedPatient={selectedPatient}
          onSelectPatient={onSelectPatient}
          onClearPatient={onClearPatient}
          error={form.formState.errors.patientId?.message}
        />
        <input type="hidden" {...form.register("patientId")} />

        {/* Section header */}
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          Detalhes
        </p>

        {/* 2. Date */}
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-foreground mb-1.5">Data *</label>
          <DateInput id="date" {...form.register("date")} className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors" />
          {form.formState.errors.date && <p className="text-xs text-destructive mt-1">{form.formState.errors.date.message}</p>}
        </div>

        {/* Time + Duration + End Time */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-1.5">Inicio *</label>
            <TimeInput
              id="startTime"
              placeholder="HH:MM"
              {...form.register("startTime")}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
            />
            {form.formState.errors.startTime && <p className="text-xs text-destructive mt-1">{form.formState.errors.startTime.message}</p>}
          </div>
          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-foreground mb-1.5">Duracao</label>
            <input id="duration" type="number" {...form.register("duration", { setValueAs: (v: string) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v) })} placeholder={`${appointmentDuration}`} min={15} max={480} step={5} className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Fim</label>
            <div className="h-11 px-3.5 rounded-xl border border-input bg-muted/50 text-foreground text-sm flex items-center">
              {calculateEndTime(form.watch("startTime"), form.watch("duration") || appointmentDuration) || "—"}
            </div>
          </div>
        </div>

        {/* 3. Recurrence */}
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
            {isProfessionalLocked ? (
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
                      checked={additionalProfessionalIds.includes(prof.professionalProfile!.id)}
                      onChange={(e) => {
                        const id = prof.professionalProfile!.id
                        if (e.target.checked) {
                          onAdditionalProfessionalIdsChange([...additionalProfessionalIds, id])
                        } else {
                          onAdditionalProfessionalIdsChange(additionalProfessionalIds.filter(x => x !== id))
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
              <input type="radio" value="PRESENCIAL" {...form.register("modality")} className="sr-only peer" />
              <div className="h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-input bg-background text-foreground text-sm font-medium peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary transition-all">
                <BuildingIcon className="w-4 h-4" />
                Presencial
              </div>
            </label>
            <label className="relative cursor-pointer">
              <input type="radio" value="ONLINE" {...form.register("modality")} className="sr-only peer" />
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
          <textarea id="notes" rows={3} {...form.register("notes")} placeholder="Observacoes sobre a consulta..." className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors resize-none" />
        </div>

        {/* API Error Alert */}
        <InlineAlert message={apiError} onDismiss={onDismissError} />

        <div className="flex gap-3 pt-4 pb-8">
          <button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors">Cancelar</button>
          <button type="submit" disabled={isSaving || !selectedPatient || (isAdmin && !isProfessionalLocked && !createProfessionalId)} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
            {isSaving ? "Salvando..." : "Criar Agendamento"}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
