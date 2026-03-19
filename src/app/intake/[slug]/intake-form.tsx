"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { DatePickerInput } from "@/shared/components/ui/date-picker-input"

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
  "w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors text-sm"
const labelClass = "block text-sm font-medium text-foreground mb-1.5"

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

function SectionCard({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-card border border-border rounded-xl p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground tracking-wide uppercase">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

export function IntakeForm({ onSubmit, isSubmitting, errorMessage }: IntakeFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
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
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-5">
      {errorMessage && (
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20">
          {errorMessage}
        </div>
      )}

      {/* ── Section 1: Dados da Crianca ── */}
      <SectionCard title="Dados da Crianca / Adolescente">
        <div>
          <label htmlFor="childName" className={labelClass}>
            Nome completo <span className="text-destructive">*</span>
          </label>
          <input
            id="childName"
            type="text"
            className={inputClass}
            {...register("childName", { required: "Nome obrigatorio" })}
          />
          <FieldError message={errors.childName?.message} />
        </div>

        <div>
          <label htmlFor="childBirthDate" className={labelClass}>
            Data de nascimento <span className="text-destructive">*</span>
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
          <FieldError message={errors.childBirthDate?.message} />
        </div>

        <div>
          <label htmlFor="schoolName" className={labelClass}>Escola</label>
          <input
            id="schoolName"
            type="text"
            className={inputClass}
            placeholder="Nome da escola"
            {...register("schoolName")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="schoolUnit" className={labelClass}>Unidade</label>
            <input id="schoolUnit" type="text" className={inputClass} {...register("schoolUnit")} />
          </div>
          <div>
            <label htmlFor="schoolShift" className={labelClass}>Turno</label>
            <select id="schoolShift" className={inputClass} {...register("schoolShift")}>
              <option value="">Selecione</option>
              <option value="Manha">Manha</option>
              <option value="Tarde">Tarde</option>
              <option value="Integral">Integral</option>
            </select>
          </div>
        </div>
      </SectionCard>

      {/* ── Section 2: Pais ── */}
      <SectionCard title="Dados dos Pais">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="fatherName" className={labelClass}>Nome do pai</label>
            <input id="fatherName" type="text" className={inputClass} {...register("fatherName")} />
          </div>
          <div>
            <label htmlFor="fatherPhone" className={labelClass}>Telefone do pai (WhatsApp)</label>
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="motherName" className={labelClass}>Nome da mae</label>
            <input id="motherName" type="text" className={inputClass} {...register("motherName")} />
          </div>
          <div>
            <label htmlFor="motherPhone" className={labelClass}>Telefone da mae (WhatsApp)</label>
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
        </div>
      </SectionCard>

      {/* ── Section 3: Responsavel financeiro ── */}
      <SectionCard
        title="Responsavel Financeiro"
        description="Preencha com as informacoes de quem vai declarar o imposto de renda. Caso queira as notas em nome da crianca, preencha com os dados dela."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="guardianName" className={labelClass}>
              Nome completo <span className="text-destructive">*</span>
            </label>
            <input
              id="guardianName"
              type="text"
              className={inputClass}
              {...register("guardianName", { required: "Nome do responsavel obrigatorio" })}
            />
            <FieldError message={errors.guardianName?.message} />
          </div>
          <div>
            <label htmlFor="guardianCpfCnpj" className={labelClass}>
              CPF/CNPJ <span className="text-destructive">*</span>
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
                  onChange={(e) => field.onChange(formatCpfCnpj(e.target.value))}
                />
              )}
            />
            <FieldError message={errors.guardianCpfCnpj?.message} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" className={labelClass}>
              Telefone <span className="text-destructive">*</span>
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
            <FieldError message={errors.phone?.message} />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>
              E-mail <span className="text-destructive">*</span>
            </label>
            <input
              id="email"
              type="email"
              className={inputClass}
              placeholder="email@exemplo.com"
              {...register("email", { required: "Email obrigatorio" })}
            />
            <FieldError message={errors.email?.message} />
          </div>
        </div>

        <div className="pt-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Endereco</p>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="addressZip" className={labelClass}>
                  CEP <span className="text-destructive">*</span>
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
                  <p className="text-xs text-muted-foreground mt-1">Buscando...</p>
                )}
                <FieldError message={errors.addressZip?.message} />
              </div>
              <div className="col-span-2">
                <label htmlFor="addressStreet" className={labelClass}>
                  Rua / Logradouro <span className="text-destructive">*</span>
                </label>
                <input
                  id="addressStreet"
                  type="text"
                  className={inputClass}
                  {...register("addressStreet", { required: "Endereco obrigatorio" })}
                />
                <FieldError message={errors.addressStreet?.message} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="addressNumber" className={labelClass}>Numero</label>
                <input id="addressNumber" type="text" className={inputClass} {...register("addressNumber")} />
              </div>
              <div className="col-span-2">
                <label htmlFor="addressNeighborhood" className={labelClass}>Bairro</label>
                <input id="addressNeighborhood" type="text" className={inputClass} {...register("addressNeighborhood")} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label htmlFor="addressCity" className={labelClass}>Cidade</label>
                <input id="addressCity" type="text" className={inputClass} {...register("addressCity")} />
              </div>
              <div>
                <label htmlFor="addressState" className={labelClass}>UF</label>
                <input id="addressState" type="text" className={inputClass} maxLength={2} {...register("addressState")} />
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Section 4: Autorizacoes ── */}
      <SectionCard title="Autorizacoes">
        <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border border-input bg-background hover:border-ring/50 transition-colors">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            {...register("consentPhotoVideo")}
          />
          <span className="text-sm text-foreground leading-relaxed">
            Autorizo o uso de fotos e/ou videos da minha crianca, de forma respeitosa e
            responsavel, nas redes sociais da clinica.
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border border-input bg-background hover:border-ring/50 transition-colors">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            {...register("consentSessionRecording")}
          />
          <div className="text-sm text-foreground leading-relaxed">
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
      </SectionCard>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
      >
        {isSubmitting ? "Enviando..." : "Enviar Ficha de Cadastro"}
      </button>
    </form>
  )
}
