"use client"

import { UseFormRegister, FieldErrors } from "react-hook-form"
import { TimeInput } from "@/app/agenda/components"
import { GroupFormData, Professional, TherapyGroup } from "./types"
import { DAY_OF_WEEK_LABELS } from "./constants"

interface GroupFormProps {
  register: UseFormRegister<GroupFormData>
  errors: FieldErrors<GroupFormData>
  professionals: Professional[]
  additionalProfessionalIds: string[]
  editingGroup: TherapyGroup | null
  isSaving: boolean
  onSubmit: () => void
  onCancel: () => void
  onAdditionalProfessionalToggle: (profId: string) => void
}

export function GroupForm({
  register,
  errors,
  professionals,
  additionalProfessionalIds,
  editingGroup,
  isSaving,
  onSubmit,
  onCancel,
  onAdditionalProfessionalToggle,
}: GroupFormProps) {
  return (
    <>
      <h2 className="text-xl font-semibold text-foreground mb-6">
        {editingGroup ? "Editar Grupo" : "Novo Grupo"}
      </h2>

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
            Nome do Grupo *
          </label>
          <input
            id="name"
            type="text"
            {...register("name")}
            placeholder="Ex: Grupo de Ansiedade - Quinta"
            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {errors.name && (
            <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="professionalProfileId" className="block text-sm font-medium text-foreground mb-2">
            Profissional *
          </label>
          <select
            id="professionalProfileId"
            {...register("professionalProfileId")}
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
          {errors.professionalProfileId && (
            <p className="text-sm text-destructive mt-1">{errors.professionalProfileId.message}</p>
          )}
        </div>

        {/* Additional Professionals */}
        {professionals.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Profissionais adicionais
            </label>
            <div className="space-y-2 p-3 rounded-xl border border-input bg-background">
              {professionals
                .filter(p => {
                  const formProfId = editingGroup
                    ? editingGroup.professionalProfile.id
                    : undefined
                  return p.professionalProfile?.id && p.professionalProfile.id !== formProfId
                })
                .map(prof => (
                  <label key={prof.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={additionalProfessionalIds.includes(prof.professionalProfile!.id)}
                      onChange={() => onAdditionalProfessionalToggle(prof.professionalProfile!.id)}
                      className="w-4 h-4 rounded border-input text-primary focus:ring-ring/40"
                    />
                    <span className="text-sm">{prof.name}</span>
                  </label>
                ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="dayOfWeek" className="block text-sm font-medium text-foreground mb-2">
              Dia da Semana *
            </label>
            <select
              id="dayOfWeek"
              {...register("dayOfWeek", { valueAsNumber: true })}
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {DAY_OF_WEEK_LABELS.map((label, index) => (
                <option key={index} value={index}>{label}</option>
              ))}
            </select>
            {errors.dayOfWeek && (
              <p className="text-sm text-destructive mt-1">{errors.dayOfWeek.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-2">
              Horário *
            </label>
            <TimeInput
              id="startTime"
              placeholder="Ex: 14:00"
              {...register("startTime")}
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.startTime && (
              <p className="text-sm text-destructive mt-1">{errors.startTime.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-foreground mb-2">
              Duração (minutos) *
            </label>
            <input
              id="duration"
              type="number"
              {...register("duration", { valueAsNumber: true })}
              min={15}
              max={480}
              step={5}
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.duration && (
              <p className="text-sm text-destructive mt-1">{errors.duration.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="recurrenceType" className="block text-sm font-medium text-foreground mb-2">
              Recorrência *
            </label>
            <select
              id="recurrenceType"
              {...register("recurrenceType")}
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="WEEKLY">Semanal</option>
              <option value="BIWEEKLY">Quinzenal</option>
              <option value="MONTHLY">Mensal</option>
            </select>
            {errors.recurrenceType && (
              <p className="text-sm text-destructive mt-1">{errors.recurrenceType.message}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving
              ? "Salvando..."
              : editingGroup
              ? "Salvar alterações"
              : "Criar grupo"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted"
          >
            Cancelar
          </button>
        </div>
      </form>
    </>
  )
}
