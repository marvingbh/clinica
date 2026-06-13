"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { X } from "lucide-react"
import {
  CATEGORY_LABELS,
  CATEGORY_VALUES,
  type PatientDocumentCategoryString,
} from "@/lib/patient-documents"
import type { DocumentDTO } from "./helpers"

const schema = z.object({
  category: z.enum(CATEGORY_VALUES as [string, ...string[]]),
  description: z.string().max(500).optional(),
  sharedWithPatient: z.boolean(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  patientId: string
  document: DocumentDTO
  onSaved: () => void
  onClose: () => void
}

export function DocumentEditModal({ patientId, document, onSaved, onClose }: Props) {
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: document.category,
      description: document.description ?? "",
      sharedWithPatient: document.sharedWithPatient,
    },
  })

  async function onSubmit(values: FormValues) {
    const res = await fetch(`/api/patients/${patientId}/documents/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: values.category as PatientDocumentCategoryString,
        description: values.description?.trim() ? values.description.trim() : null,
        sharedWithPatient: values.sharedWithPatient,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? "Falha ao atualizar.")
      return
    }
    toast.success("Documento atualizado")
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        onClick={(e) => e.stopPropagation()}
        className="bg-background rounded-lg shadow-lg w-full max-w-md p-4 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Editar documento</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-muted" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-sm block">
          <span className="text-muted-foreground block mb-1">Categoria</span>
          <select {...register("category")} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
            {CATEGORY_VALUES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm block">
          <span className="text-muted-foreground block mb-1">Descrição</span>
          <input
            type="text"
            maxLength={500}
            {...register("description")}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("sharedWithPatient")} />
          Compartilhar com paciente
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-input text-sm hover:bg-muted">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={formState.isSubmitting}
            className="h-9 px-3 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}
