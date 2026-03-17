/**
 * Builds DanfseData from an invoice with its relations,
 * extracting NFS-e fields from both stored DB columns and the XML.
 */
import { formatCnpj, formatCpf, formatBRL, formatDateTimeBR, formatCep } from "./danfse-format"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DanfseData {
  // Header
  nfseNumero: string
  dataEmissao: string // DD/MM/YYYY HH:mm
  chaveAcesso: string
  codigoVerificacao: string

  // Prestador
  prestadorRazaoSocial: string
  prestadorCnpj: string // formatted
  prestadorEndereco: string
  prestadorBairro: string
  prestadorCep: string // formatted
  prestadorInscricaoMunicipal: string
  prestadorMunicipioUf: string
  prestadorTelefone: string
  prestadorEmail: string

  // Tomador
  tomadorNome: string
  tomadorEndereco: string
  tomadorBairro: string
  tomadorCep: string // formatted
  tomadorCpfCnpj: string // formatted
  tomadorMunicipioUf: string

  // Servico
  descricao: string
  valorLiquido: string // formatted BRL
  valorTotal: string // formatted BRL

  // Atividade
  cnae: string
  cnaeDescricao: string
  cTribNac: string

  // Tributos
  baseCalculo: string // formatted BRL
  aliquotaIss: string // e.g. "5,00"
  valorIss: string // formatted BRL

  // Verification
  verificacaoUrl: string
  qrCodeDataUri?: string // Base64 PNG data URI for QR code

  // Environment
  isSandbox: boolean
}

/** Shape of the invoice with relations needed for DANFSE generation. */
export interface InvoiceWithNfse {
  nfseNumero: string | null
  nfseChaveAcesso: string | null
  nfseCodigoVerificacao: string | null
  nfseEmitidaAt: Date | null
  nfseDescricao: string | null
  nfseAliquotaIss: unknown | null // Prisma Decimal
  nfseCodigoServico: string | null
  nfseXml: string | null
  totalAmount: unknown // Prisma Decimal
  patient: {
    name: string
    billingResponsibleName: string | null
    billingCpf: string | null
    cpf: string | null
    addressStreet: string | null
    addressNumber: string | null
    addressNeighborhood: string | null
    addressCity: string | null
    addressState: string | null
    addressZip: string | null
  }
  clinic: {
    name: string
    phone: string | null
    email: string | null
    address: string | null
    nfseConfig: {
      cnpj: string
      inscricaoMunicipal: string
      codigoMunicipio: string
      codigoServico: string
      cnae: string | null
      aliquotaIss: unknown // Prisma Decimal
      useSandbox?: boolean
    } | null
  }
}

// ---------------------------------------------------------------------------
// XML field extraction helper
// ---------------------------------------------------------------------------

function extractXmlField(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`)
  const match = xml.match(regex)
  return match?.[1] ?? ""
}

// ---------------------------------------------------------------------------
// Municipality lookup (IBGE code -> name)
// ---------------------------------------------------------------------------

const KNOWN_MUNICIPALITIES: Record<string, string> = {
  "3106200": "Belo Horizonte - MG",
  "3550308": "São Paulo - SP",
  "3304557": "Rio de Janeiro - RJ",
  "4106902": "Curitiba - PR",
  "4314902": "Porto Alegre - RS",
  "5300108": "Brasília - DF",
  "2927408": "Salvador - BA",
  "2611606": "Recife - PE",
  "2304400": "Fortaleza - CE",
  "1302603": "Manaus - AM",
}

function municipioLabel(codigoMunicipio: string, city?: string | null, state?: string | null): string {
  if (city && state) return `${city} - ${state}`
  return KNOWN_MUNICIPALITIES[codigoMunicipio] || codigoMunicipio
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildDanfseData(invoice: InvoiceWithNfse): DanfseData | null {
  if (!invoice.nfseChaveAcesso || !invoice.clinic.nfseConfig) return null

  const config = invoice.clinic.nfseConfig
  const xml = invoice.nfseXml || ""
  const hasXml = xml.length > 0

  const totalAmount = Number(invoice.totalAmount)
  const aliquotaIss = Number(invoice.nfseAliquotaIss ?? config.aliquotaIss)
  const valorIss = totalAmount * (aliquotaIss / 100)

  // Extract from XML if available, otherwise fall back to DB fields
  const nfseNumero = (hasXml ? extractXmlField(xml, "nNFSe") : null) || invoice.nfseNumero || ""
  const codigoVerificacao = (hasXml ? extractXmlField(xml, "cVerif") : null)
    || invoice.nfseCodigoVerificacao
    || `NFS${invoice.nfseChaveAcesso}` // Construct from chaveAcesso if not available

  const emissionDate = invoice.nfseEmitidaAt
    ? formatDateTimeBR(invoice.nfseEmitidaAt)
    : hasXml
      ? formatDateTimeBR(extractXmlField(xml, "dhEmi") || new Date().toISOString())
      : ""

  // Tomador info
  const effectiveCpf = invoice.patient.billingCpf || invoice.patient.cpf || ""
  const tomadorNome = invoice.patient.billingResponsibleName || invoice.patient.name
  const tomadorStreet = invoice.patient.addressStreet || ""
  const tomadorNumber = invoice.patient.addressNumber || ""
  const tomadorEndereco = tomadorNumber ? `${tomadorStreet}, ${tomadorNumber}` : tomadorStreet

  // Prestador address: parse from clinic.address or use config fields
  const prestadorAddress = invoice.clinic.address || ""

  // CNAE: from config or from XML
  const cnae = config.cnae || (hasXml ? extractXmlField(xml, "CNAE") : "") || ""
  const cnaeDescricao = hasXml ? extractXmlField(xml, "xDescCNAE") : ""

  const cTribNac = invoice.nfseCodigoServico || config.codigoServico || ""

  return {
    nfseNumero,
    dataEmissao: emissionDate,
    chaveAcesso: invoice.nfseChaveAcesso,
    codigoVerificacao,

    prestadorRazaoSocial: invoice.clinic.name,
    prestadorCnpj: formatCnpj(config.cnpj),
    prestadorEndereco: prestadorAddress,
    prestadorBairro: "",
    prestadorCep: "",
    prestadorInscricaoMunicipal: config.inscricaoMunicipal,
    prestadorMunicipioUf: municipioLabel(config.codigoMunicipio),
    prestadorTelefone: invoice.clinic.phone || "",
    prestadorEmail: invoice.clinic.email || "",

    tomadorNome,
    tomadorEndereco,
    tomadorBairro: invoice.patient.addressNeighborhood || "",
    tomadorCep: invoice.patient.addressZip ? formatCep(invoice.patient.addressZip) : "",
    tomadorCpfCnpj: effectiveCpf.length > 11 ? formatCnpj(effectiveCpf) : formatCpf(effectiveCpf),
    tomadorMunicipioUf: municipioLabel(
      "",
      invoice.patient.addressCity,
      invoice.patient.addressState
    ),

    descricao: invoice.nfseDescricao || "",
    valorLiquido: formatBRL(totalAmount),
    valorTotal: formatBRL(totalAmount),

    cnae,
    cnaeDescricao,
    cTribNac,

    baseCalculo: formatBRL(totalAmount),
    aliquotaIss: aliquotaIss.toFixed(2).replace(".", ","),
    valorIss: formatBRL(valorIss),

    verificacaoUrl: `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${invoice.nfseChaveAcesso}`,

    isSandbox: config.useSandbox ?? false,
  }
}
