"use client"

import { UseFormReturn } from "react-hook-form"
import { Sheet } from "./Sheet"
import { InlineAlert } from "./InlineAlert"
import { TimeInput } from "./TimeInput"
import { DateInput } from "./DateInput"
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_COLORS } from "../lib/constants"
import { calculateEndTime } from "../lib/utils"
import type { CalendarEntryFormData, CalendarEntryType, RecurrenceEndType, Professional } from "../lib/types"

type EntryType = Exclude<CalendarEntryType, "CONSULTA">

interface CalendarEntrySheetProps {
  isOpen: boolean
  onClose: () => void
  entryType: EntryType
  form: UseFormReturn<CalendarEntryFormData>
  // Professional selection (admin)
  isAdmin: boolean
  professionals: Professional[]
  createProfessionalId: string
  setCreateProfessionalId: (id: string) => void
  isProfessionalLocked: boolean
  selectedProfessionalId: string
  // Recurrence
  isRecurring: boolean
  setIsRecurring: (value: boolean) => void
  recurrenceType: "WEEKLY" | "BIWEEKLY"
  setRecurrenceType: (type: "WEEKLY" | "BIWEEKLY") => void
  recurrenceEndType: RecurrenceEndType
  setRecurrenceEndType: (type: RecurrenceEndType) => void
  recurrenceEndDate: string
  setRecurrenceEndDate: (date: string) => void
  recurrenceOccurrences: number
  setRecurrenceOccurrences: (occurrences: number) => void
  // Additional professionals (REUNIAO only)
  additionalProfessionalIds: string[]
  setAdditionalProfessionalIds: (ids: string[]) => void
  // State
  apiError: string | null
  onDismissError: () => void
  isSaving: boolean
  onSubmit: (data: CalendarEntryFormData) => Promise<void>
}

export function CalendarEntrySheet({
  isOpen,
  onClose,
  entryType,
  form,
  isAdmin,
  professionals,
  createProfessionalId,
  setCreateProfessionalId,
  isProfessionalLocked,
  selectedProfessionalId,
  isRecurring,
  setIsRecurring,
  recurrenceType,
  setRecurrenceType,
  recurrenceEndType,
  setRecurrenceEndType,
  recurrenceEndDate,
  setRecurrenceEndDate,
  recurrenceOccurrences,
  setRecurrenceOccurrences,
  additionalProfessionalIds,
  setAdditionalProfessionalIds,
  apiError,
  onDismissError,
  isSaving,
  onSubmit,
}: CalendarEntrySheetProps) {
  const typeLabel = ENTRY_TYPE_LABELS[entryType] || entryType
  const colors = ENTRY_TYPE_COLORS[entryType]

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={`Nova ${typeLabel}`}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 space-y-5">
        {/* Type badge */}
        {colors && (
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
              {typeLabel}
            </span>
          </div>
        )}

        {/* 1. Title */}
        <div>
          <label htmlFor="entry-title" className="block text-sm font-medium text-foreground mb-1.5">Titulo *</label>
          <input
            id="entry-title"
            type="text"
            placeholder={`Nome da ${typeLabel.toLowerCase()}...`}
            {...form.register("title")}
            className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
          />
          {form.formState.errors.title && (
            <p className="text-xs text-destructive mt-1">{form.formState.errors.title.message}</p>
          )}
        </div>

        {/* Section header */}
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          Detalhes
        </p>

        {/* 2. Date */}
        <div>
          <label htmlFor="entry-date" className="block text-sm font-medium text-foreground mb-1.5">Data *</label>
          <DateInput
            id="entry-date"
            {...form.register("date")}
            className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
          />
          {form.formState.errors.date && (
            <p className="text-xs text-destructive mt-1">{form.formState.errors.date.message}</p>
          )}
        </div>

        {/* Time + Duration + End Time */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="entry-time" className="block text-sm font-medium text-foreground mb-1.5">Inicio *</label>
            <TimeInput
              id="entry-time"
              placeholder="HH:MM"
              {...form.register("startTime")}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
            />
            {form.formState.errors.startTime && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.startTime.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="entry-duration" className="block text-sm font-medium text-foreground mb-1.5">Duracao</label>
            <input
              id="entry-duration"
              type="number"
              {...form.register("duration", {
                setValueAs: (v: string) => v === "" || v === null || v === undefined || isNaN(Number(v)) ? undefined : Number(v),
              })}
              min={5}
              max={480}
              step={5}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Fim</label>
            <div className="h-11 px-3.5 rounded-xl border border-input bg-muted/50 text-foreground text-sm flex items-center">
              {calculateEndTime(form.watch("startTime"), form.watch("duration")) || "—"}
            </div>
          </div>
        </div>

        {/* 4. Recurrence toggle */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-5 h-5 rounded-md border-input text-primary focus:ring-ring/40 transition-colors"
              />
            </div>
            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Repetir</span>
          </label>

          {isRecurring && (
            <div className="mt-3 pl-8 space-y-3">
              {/* Frequency selector */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setRecurrenceType("WEEKLY")}
                  className={`h-9 px-2 rounded-lg text-xs font-medium border transition-all ${
                    recurrenceType === "WEEKLY"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  onClick={() => setRecurrenceType("BIWEEKLY")}
                  className={`h-9 px-2 rounded-lg text-xs font-medium border transition-all ${
                    recurrenceType === "BIWEEKLY"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  Quinzenal
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recurrenceEnd"
                    checked={recurrenceEndType === "INDEFINITE"}
                    onChange={() => setRecurrenceEndType("INDEFINITE")}
                    className="w-4 h-4 text-primary focus:ring-ring/40"
                  />
                  <span className="text-sm text-foreground">Sem data de termino</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recurrenceEnd"
                    checked={recurrenceEndType === "BY_OCCURRENCES"}
                    onChange={() => setRecurrenceEndType("BY_OCCURRENCES")}
                    className="w-4 h-4 text-primary focus:ring-ring/40"
                  />
                  <span className="text-sm text-foreground">Numero de ocorrencias</span>
                </label>
                {recurrenceEndType === "BY_OCCURRENCES" && (
                  <input
                    type="number"
                    value={recurrenceOccurrences}
                    onChange={(e) => setRecurrenceOccurrences(Number(e.target.value))}
                    min={2}
                    max={52}
                    className="ml-6 w-24 h-10 px-3 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
                  />
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recurrenceEnd"
                    checked={recurrenceEndType === "BY_DATE"}
                    onChange={() => setRecurrenceEndType("BY_DATE")}
                    className="w-4 h-4 text-primary focus:ring-ring/40"
                  />
                  <span className="text-sm text-foreground">Ate uma data</span>
                </label>
                {recurrenceEndType === "BY_DATE" && (
                  <DateInput
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    className="ml-6 w-40 h-10 px-3 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5. Professional selector (admin) */}
        {isAdmin && (
          <div>
            <label htmlFor="entry-professional" className="block text-sm font-medium text-foreground mb-1.5">Profissional *</label>
            {isProfessionalLocked ? (
              <div className="w-full h-11 px-3.5 rounded-xl border border-input bg-muted text-foreground text-sm flex items-center">
                {professionals.find(p => p.professionalProfile?.id === selectedProfessionalId)?.name || "Profissional selecionado"}
              </div>
            ) : (
              <select
                id="entry-professional"
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

        {/* 6. Additional professionals (REUNIAO only) */}
        {entryType === "REUNIAO" && professionals.length > 1 && (
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
                          setAdditionalProfessionalIds([...additionalProfessionalIds, id])
                        } else {
                          setAdditionalProfessionalIds(additionalProfessionalIds.filter(x => x !== id))
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

        {/* 7. Notes */}
        <div>
          <label htmlFor="entry-notes" className="block text-sm font-medium text-foreground mb-1.5">Observacoes</label>
          <textarea
            id="entry-notes"
            rows={3}
            {...form.register("notes")}
            placeholder="Observacoes..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors resize-none"
          />
        </div>

        {/* API Error */}
        <InlineAlert message={apiError} onDismiss={onDismissError} />

        <div className="flex gap-3 pt-4 pb-8">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving || (isAdmin && !isProfessionalLocked && !createProfessionalId)}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSaving ? "Salvando..." : `Criar ${typeLabel}`}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
