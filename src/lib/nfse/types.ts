export type NfseStatus = "PENDENTE" | "EMITIDA" | "CANCELADA" | "ERRO"

export interface NfseConfigData {
  cnpj: string
  inscricaoMunicipal: string
  codigoMunicipio: string
  regimeTributario: string
  codigoServico: string
  cnae?: string
  codigoNbs?: string
  aliquotaIss: number
  descricaoServico?: string
  useSandbox: boolean
}

export interface NfseEmissionData {
  // Prestador (from NfseConfig + Clinic)
  prestadorCnpj: string
  prestadorIm: string
  prestadorNome: string
  prestadorRegimeTributario: string // 1=MEI, 2=SN, 3=LP, 4=LR
  prestadorEmail?: string
  prestadorFone?: string
  // Tomador (from Patient)
  tomadorCpf: string
  tomadorNome: string
  tomadorLogradouro?: string
  tomadorNumero?: string
  tomadorBairro?: string
  tomadorCep?: string
  // Service
  codigoServico: string
  descricao: string
  valor: number
  aliquotaIss: number
  codigoMunicipio: string
}

export const ADN_URLS = {
  production: "https://sefin.nfse.gov.br/SefinNacional",
  sandbox: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
} as const
