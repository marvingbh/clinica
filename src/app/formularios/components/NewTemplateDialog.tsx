"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

const schema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(120),
  description: z.string().trim().max(500).optional(),
})

type FormValues = z.infer<typeof schema>

interface NewTemplateDialogProps {
  onClose: () => void
  onCreate: (name: string, description: string) => Promise<void>
}

/** Modal to create a blank form template. */
export function NewTemplateDialog({ onClose, onCreate }: NewTemplateDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-semibold text-ink-900">Novo formulário</h2>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={handleSubmit((v) => onCreate(v.name, v.description ?? ""))}
        >
          <div>
            <label className="block text-[13px] font-medium text-ink-700">Nome</label>
            <input
              {...register("name")}
              autoFocus
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-[14px] outline-none focus:border-ink-400"
              placeholder="Anamnese adulto"
            />
            {errors.name && <p className="text-[12px] text-red-500 mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-medium text-ink-700">Descrição (opcional)</label>
            <input
              {...register("description")}
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-[14px] outline-none focus:border-ink-400"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-ink-200 px-3 py-2 text-[13px]">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-ink-900 text-white px-3 py-2 text-[13px] font-medium disabled:opacity-50"
            >
              Criar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
