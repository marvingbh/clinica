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
  prestadorOpSimpNac: number // 1=optante SN, 2=nao optante. Must match Receita Federal.
  prestadorEmail?: string
  prestadorFone?: string
  // Tomador (from Patient)
  tomadorCpf: string
  tomadorNome: string
  tomadorLogradouro?: string
  tomadorNumero?: string
  tomadorBairro?: string
  tomadorCep?: string
  tomadorCodigoMunicipio?: string // IBGE code of tomador's city (from CEP lookup)
  // Service
  codigoServico: string
  codigoServicoMunicipal?: string // cTribMun - 3 digit municipal code (required by some municipalities like BH)
  codigoNbs?: string // NBS code (e.g., "123019800") — mandatory since 01/2026
  cClassNbs?: string // NBS CClass (e.g., "200029")
  descricao: string
  valor: number
  aliquotaIss: number
  codigoMunicipio: string
}

export const ADN_URLS = {
  production: "https://sefin.nfse.gov.br/SefinNacional",
  sandbox: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
} as const
