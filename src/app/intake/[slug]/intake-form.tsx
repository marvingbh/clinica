"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { DatePickerInput } from "@/shared/components/ui/date-picker-input"
import { isValidCpfCnpj } from "@/lib/intake"

interface IntakeFormData {
  childName: string
  childBirthDate: string
  schoolName: string
  schoolUnit: string
  schoolShift: string
  fatherName: string
  fatherPhone: string
  motherName: string
  motherPhone: string
  guardianName: string
  guardianCpfCnpj: string
  phone: string
  email: string
  addressZip: string
  addressStreet: string
  addressNumber: string
  addressNeighborhood: string
  addressCity: string
  addressState: string
  consentPhotoVideo: boolean
  consentSessionRecording: boolean
}

interface IntakeFormProps {
  onSubmit: (data: Record<string, unknown>) => void
  isSubmitting: boolean
  errorMessage: string
}

const inputClass =
  "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (digits.length <= 11) {
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
  }
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`
}

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

function brDateToIso(value: string): string {
  const parts = value.split("/")
  if (parts.length !== 3) return ""
  return `${parts[2]}-${parts[1]}-${parts[0]}`
}

export function IntakeForm({ onSubmit, isSubmitting, errorMessage }: IntakeFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<IntakeFormData>({
    defaultValues: {
      consentPhotoVideo: false,
      consentSessionRecording: false,
    },
  })

  const [cepLoading, setCepLoading] = useState(false)

  async function handleCepBlur(cep: string) {
    const digits = cep.replace(/\D/g, "")
    if (digits.length !== 8) return

    setCepLoading(true)
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await response.json()
      if (!data.erro) {
        setValue("addressStreet", data.logradouro || "")
        setValue("addressNeighborhood", data.bairro || "")
        setValue("addressCity", data.localidade || "")
        setValue("addressState", data.uf || "")
      }
    } catch {
      // ViaCEP unavailable — user fills manually
    } finally {
      setCepLoading(false)
    }
  }

  function onFormSubmit(data: IntakeFormData) {
    onSubmit({
      ...data,
      childBirthDate: brDateToIso(data.childBirthDate),
      phone: data.phone.replace(/\D/g, ""),
      guardianCpfCnpj: data.guardianCpfCnpj.replace(/\D/g, ""),
      addressZip: data.addressZip.replace(/\D/g, ""),
      motherPhone: data.motherPhone ? data.motherPhone.replace(/\D/g, "") : "",
      fatherPhone: data.fatherPhone ? data.fatherPhone.replace(/\D/g, "") : "",
    })
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-8">
      {errorMessage && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {errorMessage}
        </div>
      )}

      {/* ── Section 1: Dados da Crianca ── */}
      <section className="space-y-4">
        <div>
          <label htmlFor="childName" className="block text-sm text-muted-foreground mb-1">
            Nome completo da crianca/adolescente *
          </label>
          <input
            id="childName"
            type="text"
            className={inputClass}
            {...register("childName", { required: "Nome obrigatorio" })}
          />
          {errors.childName && (
            <p className="text-sm text-destructive mt-1">{errors.childName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="childBirthDate" className="block text-sm text-muted-foreground mb-1">
            Data de nascimento da crianca/adolescente *
          </label>
          <Controller
            name="childBirthDate"
            control={control}
            rules={{ required: "Data de nascimento obrigatoria" }}
            render={({ field }) => (
              <DatePickerInput
                id="childBirthDate"
                value={field.value || ""}
                onChange={field.onChange}
              />
            )}
          />
          {errors.childBirthDate && (
            <p className="text-sm text-destructive mt-1">{errors.childBirthDate.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="schoolName" className="block text-sm text-muted-foreground mb-1">
            Nome da escola e unidade (caso tenha)
          </label>
          <input
            id="schoolName"
            type="text"
            className={inputClass}
            {...register("schoolName")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="schoolUnit" className="block text-sm text-muted-foreground mb-1">
              Unidade
            </label>
            <input
              id="schoolUnit"
              type="text"
              className={inputClass}
              {...register("schoolUnit")}
            />
          </div>
          <div>
            <label htmlFor="schoolShift" className="block text-sm text-muted-foreground mb-1">
              Turno em que estuda
            </label>
            <select id="schoolShift" className={inputClass} {...register("schoolShift")}>
              <option value="">Selecione</option>
              <option value="Manha">Manha</option>
              <option value="Tarde">Tarde</option>
              <option value="Integral">Integral</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="fatherName" className="block text-sm text-muted-foreground mb-1">
            Nome do pai
          </label>
          <input
            id="fatherName"
            type="text"
            className={inputClass}
            {...register("fatherName")}
          />
        </div>

        <div>
          <label htmlFor="fatherPhone" className="block text-sm text-muted-foreground mb-1">
            Telefone do pai (WhatsApp)
          </label>
          <Controller
            name="fatherPhone"
            control={control}
            render={({ field }) => (
              <input
                id="fatherPhone"
                type="text"
                inputMode="tel"
                className={inputClass}
                placeholder="(00) 00000-0000"
                value={field.value || ""}
                onChange={(e) => field.onChange(formatPhone(e.target.value))}
              />
            )}
          />
        </div>

        <div>
          <label htmlFor="motherName" className="block text-sm text-muted-foreground mb-1">
            Nome da mae
          </label>
          <input
            id="motherName"
            type="text"
            className={inputClass}
            {...register("motherName")}
          />
        </div>

        <div>
          <label htmlFor="motherPhone" className="block text-sm text-muted-foreground mb-1">
            Telefone da mae (WhatsApp)
          </label>
          <Controller
            name="motherPhone"
            control={control}
            render={({ field }) => (
              <input
                id="motherPhone"
                type="text"
                inputMode="tel"
                className={inputClass}
                placeholder="(00) 00000-0000"
                value={field.value || ""}
                onChange={(e) => field.onChange(formatPhone(e.target.value))}
              />
            )}
          />
        </div>
      </section>

      {/* ── Section 2: Responsavel financeiro ── */}
      <section className="space-y-4">
        <div className="border-t border-border pt-6">
          <h2 className="text-base font-semibold text-foreground">Responsavel financeiro</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Preencha com as informacoes de quem vai declarar o imposto de renda. Caso queira
            as notas em nome da crianca, preencha com os dados dela.
          </p>
        </div>

        <div>
          <label htmlFor="guardianName" className="block text-sm text-muted-foreground mb-1">
            Nome do responsavel financeiro *
          </label>
          <input
            id="guardianName"
            type="text"
            className={inputClass}
            {...register("guardianName", { required: "Nome do responsavel obrigatorio" })}
          />
          {errors.guardianName && (
            <p className="text-sm text-destructive mt-1">{errors.guardianName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="guardianCpfCnpj" className="block text-sm text-muted-foreground mb-1">
            CPF/CNPJ *
          </label>
          <Controller
            name="guardianCpfCnpj"
            control={control}
            rules={{ required: "CPF/CNPJ obrigatorio" }}
            render={({ field }) => (
              <input
                id="guardianCpfCnpj"
                type="text"
                inputMode="numeric"
                className={inputClass}
                placeholder="000.000.000-00"
                value={field.value || ""}
                onChange={(e) => {
                  field.onChange(formatCpfCnpj(e.target.value))
                  if (errors.guardianCpfCnpj) clearErrors("guardianCpfCnpj")
                }}
                onBlur={() => {
                  const digits = (field.value || "").replace(/\D/g, "")
                  if (digits.length >= 11 && !isValidCpfCnpj(digits)) {
                    setError("guardianCpfCnpj", { message: "CPF/CNPJ invalido" })
                  }
                }}
              />
            )}
          />
          {errors.guardianCpfCnpj && (
            <p className="text-sm text-destructive mt-1">{errors.guardianCpfCnpj.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm text-muted-foreground mb-1">
            Telefone *
          </label>
          <Controller
            name="phone"
            control={control}
            rules={{ required: "Telefone obrigatorio" }}
            render={({ field }) => (
              <input
                id="phone"
                type="text"
                inputMode="tel"
                className={inputClass}
                placeholder="(00) 00000-0000"
                value={field.value || ""}
                onChange={(e) => field.onChange(formatPhone(e.target.value))}
              />
            )}
          />
          {errors.phone && (
            <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm text-muted-foreground mb-1">
            E-mail *
          </label>
          <input
            id="email"
            type="email"
            className={inputClass}
            placeholder="email@exemplo.com"
            {...register("email", { required: "Email obrigatorio" })}
          />
          {errors.email && (
            <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="addressZip" className="block text-sm text-muted-foreground mb-1">
            CEP *
          </label>
          <Controller
            name="addressZip"
            control={control}
            rules={{ required: "CEP obrigatorio" }}
            render={({ field }) => (
              <input
                id="addressZip"
                type="text"
                inputMode="numeric"
                className={inputClass}
                placeholder="00000-000"
                value={field.value || ""}
                onChange={(e) => field.onChange(formatCep(e.target.value))}
                onBlur={() => handleCepBlur(field.value || "")}
              />
            )}
          />
          {cepLoading && (
            <p className="text-sm text-muted-foreground mt-1">Buscando endereco...</p>
          )}
          {errors.addressZip && (
            <p className="text-sm text-destructive mt-1">{errors.addressZip.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="addressStreet" className="block text-sm text-muted-foreground mb-1">
            Endereco *
          </label>
          <input
            id="addressStreet"
            type="text"
            className={inputClass}
            placeholder="Rua, Avenida, etc."
            {...register("addressStreet", { required: "Endereco obrigatorio" })}
          />
          {errors.addressStreet && (
            <p className="text-sm text-destructive mt-1">{errors.addressStreet.message}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="addressNumber" className="block text-sm text-muted-foreground mb-1">
              Numero
            </label>
            <input id="addressNumber" type="text" className={inputClass} {...register("addressNumber")} />
          </div>
          <div className="col-span-2">
            <label htmlFor="addressNeighborhood" className="block text-sm text-muted-foreground mb-1">
              Bairro
            </label>
            <input id="addressNeighborhood" type="text" className={inputClass} {...register("addressNeighborhood")} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label htmlFor="addressCity" className="block text-sm text-muted-foreground mb-1">
              Cidade
            </label>
            <input id="addressCity" type="text" className={inputClass} {...register("addressCity")} />
          </div>
          <div>
            <label htmlFor="addressState" className="block text-sm text-muted-foreground mb-1">
              UF
            </label>
            <input id="addressState" type="text" className={inputClass} maxLength={2} {...register("addressState")} />
          </div>
        </div>
      </section>

      {/* ── Section 3: Autorizacoes ── */}
      <section className="space-y-4">
        <div className="border-t border-border pt-6">
          <h2 className="text-base font-semibold text-foreground">Autorizacoes</h2>
        </div>

        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-md border border-input hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-input"
            {...register("consentSessionRecording")}
          />
          <div className="text-sm text-foreground">
            <p>
              Autorizo e declaro estar ciente da possibilidade de gravacao das sessoes
              psicologicas, com a finalidade de supervisao da equipe e garantia da seguranca
              do menor durante os atendimentos.
            </p>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              Tal pratica e amparada pelo Codigo de Etica Profissional do Psicologo (Art. 9)
              e tem como principio fundamental o respeito ao sigilo profissional. Declaro, ainda,
              que apenas a psicologa responsavel tera acesso as gravacoes, comprometendo-se,
              em conformidade com o Estatuto da Crianca e do Adolescente, a zelar pela
              confidencialidade e protecao integral desse material.
            </p>
          </div>
        </label>
      </section>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-12 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Enviando..." : "Enviar Ficha de Cadastro"}
      </button>
    </form>
  )
}
