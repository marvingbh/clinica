import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import type { TabProps } from "../types"
import { patchSettings } from "../types"

const schema = z.object({
  defaultSessionDuration: z.number().int().min(15, "Mínimo 15 minutos").max(180, "Máximo 180 minutos"),
  minAdvanceBooking: z.number().int().min(0, "Mínimo 0 horas").max(168, "Máximo 168 horas"),
  reminderHours: z.string(),
})

type FormValues = z.infer<typeof schema>

const inputClass =
  "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
const labelClass = "block text-sm font-medium text-foreground mb-2"

export default function SchedulingTab({ settings, onUpdate }: TabProps) {
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      defaultSessionDuration: settings.defaultSessionDuration,
      minAdvanceBooking: settings.minAdvanceBooking,
      reminderHours: settings.reminderHours.join(", "),
    },
  })

  async function onSubmit(data: FormValues) {
    const reminderHours = data.reminderHours
      .split(",")
      .map((h) => parseInt(h.trim(), 10))
      .filter((h) => !isNaN(h) && h >= 0 && h <= 168)

    if (reminderHours.length === 0) {
      toast.error("Informe pelo menos um horário de lembrete válido")
      return
    }

    setIsSaving(true)
    try {
      const updated = await patchSettings({
        defaultSessionDuration: data.defaultSessionDuration,
        minAdvanceBooking: data.minAdvanceBooking,
        reminderHours,
      })
      onUpdate(updated)
      reset(data)
      toast.success("Configurações da agenda salvas")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-5">
      <div>
        <label className={labelClass}>Duração Padrão da Sessão (minutos) *</label>
        <input
          type="number"
          min={15}
          max={180}
          {...register("defaultSessionDuration", { valueAsNumber: true })}
          className={inputClass}
        />
        {errors.defaultSessionDuration && (
          <p className="text-sm text-destructive mt-1">{errors.defaultSessionDuration.message}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">Tempo padrão para novos agendamentos (15-180 minutos)</p>
      </div>
      <div>
        <label className={labelClass}>Antecedência Mínima para Agendamento (horas) *</label>
        <input
          type="number"
          min={0}
          max={168}
          {...register("minAdvanceBooking", { valueAsNumber: true })}
          className={inputClass}
        />
        {errors.minAdvanceBooking && (
          <p className="text-sm text-destructive mt-1">{errors.minAdvanceBooking.message}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">Tempo mínimo de antecedência (0-168 horas)</p>
      </div>
      <div>
        <label className={labelClass}>Horários de Lembrete (horas antes) *</label>
        <input {...register("reminderHours")} placeholder="24, 2" className={inputClass} />
        {errors.reminderHours && (
          <p className="text-sm text-destructive mt-1">{errors.reminderHours.message}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Horas antes da consulta para enviar lembretes, separados por vírgula (ex: 24, 2)
        </p>
      </div>
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={isSaving || !isDirty}
          className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {isSaving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  )
}
