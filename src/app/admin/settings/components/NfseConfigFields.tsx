import { useRef, useState } from "react"
import type { UseFormRegister, FieldErrors } from "react-hook-form"
import type { NfseConfigFormData } from "@/lib/nfse/validation"

const REGIME_OPTIONS = [
  { value: "1", label: "MEI" },
  { value: "2", label: "Simples Nacional" },
  { value: "3", label: "Lucro Presumido" },
  { value: "4", label: "Lucro Real" },
]

const inputClass =
  "w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"

const labelClass = "block text-sm font-medium text-foreground mb-2"

interface Props {
  register: UseFormRegister<NfseConfigFormData>
  errors: FieldErrors<NfseConfigFormData>
  hasCertificate: boolean
  certFile: File | null
  onCertFileChange: (file: File | null) => void
  certPassword: string
  onCertPasswordChange: (password: string) => void
  isNewConfig: boolean
  currentNbs?: string
  currentCClassNbs?: string
  onNbsChange?: (nbs: string, cClass: string) => void
}

export default function NfseConfigFields({
  register,
  errors,
  hasCertificate,
  certFile,
  onCertFileChange,
  certPassword,
  onCertPasswordChange,
  isNewConfig,
  currentNbs,
  currentCClassNbs,
  onNbsChange,
}: Props) {
  const certRef = useRef<HTMLInputElement>(null)
  const [, setLocalTrigger] = useState(0)

  return (
    <>
      {/* Fiscal data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>CNPJ *</label>
          <input {...register("cnpj")} placeholder="00.000.000/0000-00" className={inputClass} />
          {errors.cnpj && <p className="text-sm text-destructive mt-1">{errors.cnpj.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Inscricao Municipal *</label>
          <input {...register("inscricaoMunicipal")} className={inputClass} />
          {errors.inscricaoMunicipal && (
            <p className="text-sm text-destructive mt-1">{errors.inscricaoMunicipal.message}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>Codigo Municipio (IBGE) *</label>
          <input
            {...register("codigoMunicipio")}
            placeholder="0000000"
            maxLength={7}
            className={inputClass}
          />
          {errors.codigoMunicipio && (
            <p className="text-sm text-destructive mt-1">{errors.codigoMunicipio.message}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>Regime Tributario *</label>
          <select {...register("regimeTributario")} className={inputClass}>
            {REGIME_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {errors.regimeTributario && (
            <p className="text-sm text-destructive mt-1">{errors.regimeTributario.message}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>Optante Simples Nacional (ADN)</label>
          <select {...register("opSimpNac", { valueAsNumber: true })} className={inputClass}>
            <option value={1}>Nao Optante (Lucro Presumido / Lucro Real)</option>
            <option value={2}>MEI</option>
            <option value={3}>ME/EPP (Simples Nacional)</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Deve corresponder ao cadastro na Receita Federal. Se o ADN rejeitar, ajuste aqui.
          </p>
        </div>
      </div>

      {/* Service defaults */}
      <div className="border-t border-border pt-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Servico Padrao</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Codigo Nacional (cTribNac) *</label>
            <input {...register("codigoServico")} placeholder="041601" className={inputClass} />
            <p className="text-xs text-muted-foreground mt-1">6 digitos (ex: 041601 = Psicologia)</p>
            {errors.codigoServico && (
              <p className="text-sm text-destructive mt-1">{errors.codigoServico.message}</p>
            )}
          </div>
          <div>
            <label className={labelClass}>Codigo Municipal (cTribMun)</label>
            <input {...register("codigoServicoMunicipal")} placeholder="001" className={inputClass} />
            <p className="text-xs text-muted-foreground mt-1">3 digitos. Obrigatorio para BH e outros municipios.</p>
          </div>
          <div>
            <label className={labelClass}>Aliquota ISS (%) *</label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              {...register("aliquotaIss", { valueAsNumber: true })}
              className={inputClass}
            />
            {errors.aliquotaIss && (
              <p className="text-sm text-destructive mt-1">{errors.aliquotaIss.message}</p>
            )}
          </div>
          <div>
            <label className={labelClass}>CNAE</label>
            <input {...register("cnae")} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Servico NBS</label>
            <select
              value={currentNbs && currentCClassNbs ? `${currentNbs}_${currentCClassNbs}` : "_"}
              onChange={(e) => {
                const [nbs, cc] = e.target.value.split("_")
                if (onNbsChange && nbs) onNbsChange(nbs, cc)
              }}
              className={inputClass}
            >
              <option value="_">Selecione o servico NBS</option>
              <option value="123019800_200029">123019800 | 200029 - Servicos de psicologia (Saude humana LC 214/2025)</option>
              <option value="123019800_000001">123019800 | 000001 - Servicos de psicologia (Tributado integralmente IBS/CBS)</option>
              <option value="112021000_000001">112021000 | 000001 - Pesquisa e desenvolvimento em psicologia</option>
              <option value="123012200_200029">123012200 | 200029 - Servicos medicos especializados (LC 214/2025)</option>
              <option value="123019900_200029">123019900 | 200029 - Outros servicos de saude humana (LC 214/2025)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Codigo NBS</label>
            <input {...register("codigoNbs")} placeholder="123019800" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>CClass NBS</label>
            <input {...register("cClassNbs")} placeholder="200029" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>CRP do Profissional</label>
            <input {...register("professionalCrp")} placeholder="CRP04/23853" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Percentual Total de Impostos (%)</label>
            <input type="number" step="0.01" min={0} max={100} {...register("nfseTaxPercentage", { valueAsNumber: true })} placeholder="14.33" className={inputClass} />
            <p className="text-xs text-muted-foreground mt-1">Lei 12.741/2012. Aparece na descricao da NFS-e.</p>
          </div>
        </div>
        <div>
          <label className={labelClass}>Modelo de Descricao da NFS-e</label>
          <textarea
            {...register("descricaoServico")}
            rows={4}
            placeholder={"Referente a consultas em psicoterapia de {{relacao}} {{paciente}}, nos dias {{dias}} de {{mes}} de {{ano}}, pela psicóloga {{profissional}} {{registro}}. Cada sessão com valor unitário de {{valor_sessao}}{{impostos}}"}
            className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {"Variaveis: {{paciente}}, {{relacao}}, {{profissional}}, {{registro}}, {{dias}}, {{mes}}, {{ano}}, {{valor_sessao}}, {{sessoes}}, {{impostos}}. Deixe vazio para usar o padrao."}
          </p>
        </div>
      </div>

      {/* Certificate */}
      <div className="border-t border-border pt-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Certificado Digital A1</h3>
        {hasCertificate && !certFile && (
          <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5">
            <span className="inline-block w-4 h-4 rounded-full bg-green-500 text-white text-[10px] leading-none text-center">
              &#10003;
            </span>
            Certificado A1 instalado
          </p>
        )}
        <div className="flex items-center gap-3">
          <input
            ref={certRef}
            type="file"
            accept=".pfx,.p12"
            className="hidden"
            onChange={(e) => {
              onCertFileChange(e.target.files?.[0] ?? null)
              setLocalTrigger((n) => n + 1)
            }}
          />
          <button
            type="button"
            onClick={() => certRef.current?.click()}
            className="h-10 px-4 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            {certFile
              ? certFile.name
              : hasCertificate
                ? "Substituir certificado"
                : "Selecionar arquivo (.pfx/.p12)"}
          </button>
        </div>
        {(certFile || isNewConfig) && (
          <div className="max-w-xs">
            <label className={labelClass}>Senha do Certificado *</label>
            <input
              type="password"
              value={certPassword}
              onChange={(e) => onCertPasswordChange(e.target.value)}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {/* Sandbox toggle */}
      <div className="border-t border-border pt-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" {...register("useSandbox")} className="mt-1" />
          <div>
            <span className="text-sm font-medium text-foreground">
              Usar ambiente de teste (sandbox)
            </span>
            <p className="text-xs text-muted-foreground">
              Notas emitidas no sandbox nao tem validade fiscal.
            </p>
          </div>
        </label>
      </div>
    </>
  )
}
