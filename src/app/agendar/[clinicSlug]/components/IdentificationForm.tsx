"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Input, Button } from "@/shared/components/ui"
import { isValidPhone, PHONE_ERROR_MESSAGE, formatPhoneInput } from "@/lib/phone"
import type { IdentificationData } from "./types"

const schema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo").max(120, "Nome muito longo"),
  phone: z.string().refine(isValidPhone, PHONE_ERROR_MESSAGE),
  email: z.string().email("E-mail inválido"),
  cpf: z.string().optional(),
  consent: z.literal(true, { message: "É necessário aceitar o termo de consentimento" }),
  website: z.string().max(0).optional(),
})

const CONSENT_TEXT =
  "Autorizo o contato por WhatsApp e e-mail para confirmações e lembretes de sessões, conforme a Política de Privacidade."

export function IdentificationForm({
  isSubmitting,
  onSubmit,
}: {
  isSubmitting: boolean
  onSubmit: (data: IdentificationData) => void
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { consent: false as unknown as true, website: "" },
  })

  const phone = watch("phone") ?? ""

  return (
    <form className="space-y-4" onSubmit={handleSubmit((d) => onSubmit(d as IdentificationData))}>
      <Input label="Nome completo" {...register("name")} error={errors.name?.message} />
      <Input
        label="Telefone"
        inputMode="tel"
        value={phone}
        onChange={(e) => setValue("phone", formatPhoneInput(e.target.value), { shouldValidate: false })}
        error={errors.phone?.message}
      />
      <Input label="E-mail" type="email" inputMode="email" {...register("email")} error={errors.email?.message} />
      <Input label="CPF (opcional)" inputMode="numeric" {...register("cpf")} error={errors.cpf?.message} />

      {/* Honeypot — visually hidden from humans. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        {...register("website")}
      />

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" className="mt-1" {...register("consent")} />
        <span>{CONSENT_TEXT}</span>
      </label>
      {errors.consent && <p className="text-sm text-destructive">{errors.consent.message}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting} loading={isSubmitting}>
        Confirmar agendamento
      </Button>
    </form>
  )
}
