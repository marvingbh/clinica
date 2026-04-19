const REGIME_OPTIONS = [
  { value: "1", label: "MEI" },
  { value: "2", label: "Simples Nacional" },
  { value: "3", label: "Lucro Presumido" },
  { value: "4", label: "Lucro Real" },
]

export interface NfseConfigSummaryData {
  cnpj: string
  inscricaoMunicipal: string
  codigoMunicipio: string
  regimeTributario: string
  codigoServico: string
  codigoServicoMunicipal?: string | null
  opSimpNac: number
  nfseTaxPercentage?: number | null
  professionalCrp?: string | null
  cnae?: string | null
  codigoNbs?: string | null
  cClassNbs?: string | null
  aliquotaIss: number
  descricaoServico?: string | null
  useSandbox: boolean
  hasCertificate: boolean
}

function maskCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "").padEnd(14, "0")
  return `${d.slice(0, 2)}.***.***/****-${d.slice(12, 14)}`
}

function regimeLabel(value: string): string {
  return REGIME_OPTIONS.find((r) => r.value === value)?.label ?? value
}

interface Props {
  config: NfseConfigSummaryData
  onEdit: () => void
  onDelete: () => void
  isDeleting: boolean
}

export default function NfseConfigSummary({ config, onEdit, onDelete, isDeleting }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
            config.useSandbox
              ? "bg-yellow-100 text-yellow-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {config.useSandbox ? "Sandbox" : "Producao"}
        </span>
        {config.hasCertificate && (
          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            Certificado A1 instalado
          </span>
        )}
      </div>

      <ul className="text-sm text-muted-foreground space-y-1">
        <li>
          <span className="font-medium text-foreground">CNPJ:</span> {maskCnpj(config.cnpj)}
        </li>
        <li>
          <span className="font-medium text-foreground">Municipio:</span> {config.codigoMunicipio}
        </li>
        <li>
          <span className="font-medium text-foreground">Servico:</span> {config.codigoServico}
        </li>
        <li>
          <span className="font-medium text-foreground">Aliquota ISS:</span> {config.aliquotaIss}%
        </li>
        <li>
          <span className="font-medium text-foreground">Regime:</span>{" "}
          {regimeLabel(config.regimeTributario)}
        </li>
      </ul>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="h-10 px-4 rounded-md border border-destructive text-destructive text-sm font-medium hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isDeleting ? "Removendo..." : "Remover"}
        </button>
      </div>
    </div>
  )
}
