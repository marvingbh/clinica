import { describe, it, expect } from "vitest"
import { buildDanfseData, type InvoiceWithNfse } from "./danfse-data-builder"

function makeInvoice(overrides: Partial<InvoiceWithNfse> = {}): InvoiceWithNfse {
  return {
    nfseNumero: "12345",
    nfseChaveAcesso: "NFSe12345678901234567890123456789012345678901234567890",
    nfseCodigoVerificacao: "ABC123",
    nfseEmitidaAt: new Date(2026, 2, 16, 10, 0),
    nfseDescricao: "Consultas de psicoterapia referentes a marco/2026",
    nfseAliquotaIss: 5.0,
    nfseCodigoServico: "041601",
    nfseXml: null,
    totalAmount: 800.0,
    patient: {
      name: "Maria Silva",
      billingResponsibleName: null,
      billingCpf: null,
      cpf: "12345678901",
      addressStreet: "Rua das Flores",
      addressNumber: "123",
      addressNeighborhood: "Centro",
      addressCity: "Belo Horizonte",
      addressState: "MG",
      addressZip: "30130000",
    },
    clinic: {
      name: "Clinica Exemplo LTDA",
      phone: "(31) 3333-4444",
      email: "contato@clinica.com",
      address: "Av. Afonso Pena, 1000",
      nfseConfig: {
        cnpj: "12345678000195",
        inscricaoMunicipal: "12345",
        codigoMunicipio: "3106200",
        codigoServico: "041601",
        cnae: "8650006",
        aliquotaIss: 5.0,
      },
    },
    ...overrides,
  }
}

describe("buildDanfseData", () => {
  it("returns null when chaveAcesso is missing", () => {
    const result = buildDanfseData(makeInvoice({ nfseChaveAcesso: null }))
    expect(result).toBeNull()
  })

  it("returns null when nfseConfig is missing", () => {
    const invoice = makeInvoice()
    invoice.clinic.nfseConfig = null
    expect(buildDanfseData(invoice)).toBeNull()
  })

  it("builds all fields from DB data (no XML)", () => {
    const result = buildDanfseData(makeInvoice())!
    expect(result).not.toBeNull()

    // Header
    expect(result.nfseNumero).toBe("12345")
    expect(result.codigoVerificacao).toBe("ABC123")
    expect(result.dataEmissao).toBe("16/03/2026 10:00")

    // Prestador
    expect(result.prestadorRazaoSocial).toBe("Clinica Exemplo LTDA")
    expect(result.prestadorCnpj).toBe("12.345.678/0001-95")
    expect(result.prestadorInscricaoMunicipal).toBe("12345")
    expect(result.prestadorMunicipioUf).toBe("Belo Horizonte - MG")

    // Tomador
    expect(result.tomadorNome).toBe("Maria Silva")
    expect(result.tomadorCpfCnpj).toBe("123.456.789-01")
    expect(result.tomadorEndereco).toBe("Rua das Flores, 123")
    expect(result.tomadorBairro).toBe("Centro")
    expect(result.tomadorCep).toBe("30130-000")
    expect(result.tomadorMunicipioUf).toBe("Belo Horizonte - MG")

    // Service
    expect(result.descricao).toBe("Consultas de psicoterapia referentes a marco/2026")
    expect(result.valorTotal).toBe("R$ 800,00")

    // Tax
    expect(result.aliquotaIss).toBe("5,00")
    expect(result.valorIss).toBe("R$ 40,00")

    // Activity
    expect(result.cnae).toBe("8650006")
    expect(result.cTribNac).toBe("041601")

    // Verification URL
    expect(result.verificacaoUrl).toContain("nfse.gov.br/ConsultaPublica")
    expect(result.verificacaoUrl).toContain("NFSe12345678901234567890")
  })

  it("uses billingResponsibleName when present", () => {
    const invoice = makeInvoice()
    invoice.patient.billingResponsibleName = "Joao Silva"
    const result = buildDanfseData(invoice)!
    expect(result.tomadorNome).toBe("Joao Silva")
  })

  it("uses billingCpf over patient CPF when present", () => {
    const invoice = makeInvoice()
    invoice.patient.billingCpf = "98765432100"
    const result = buildDanfseData(invoice)!
    expect(result.tomadorCpfCnpj).toBe("987.654.321-00")
  })

  it("extracts fields from XML when available", () => {
    const xml = `<NFSe><nNFSe>99999</nNFSe><cVerif>XYZ789</cVerif><dhEmi>2026-03-15T09:00:00-03:00</dhEmi></NFSe>`
    const result = buildDanfseData(makeInvoice({ nfseXml: xml }))!
    expect(result.nfseNumero).toBe("99999")
    expect(result.codigoVerificacao).toBe("XYZ789")
  })

  it("calculates ISS value correctly", () => {
    const result = buildDanfseData(makeInvoice({ totalAmount: 1000, nfseAliquotaIss: 2.5 }))!
    expect(result.valorIss).toBe("R$ 25,00")
    expect(result.aliquotaIss).toBe("2,50")
  })

  it("handles missing optional address fields gracefully", () => {
    const invoice = makeInvoice()
    invoice.patient.addressStreet = null
    invoice.patient.addressNumber = null
    invoice.patient.addressNeighborhood = null
    invoice.patient.addressZip = null
    invoice.patient.addressCity = null
    invoice.patient.addressState = null
    const result = buildDanfseData(invoice)!
    expect(result.tomadorEndereco).toBe("")
    expect(result.tomadorBairro).toBe("")
    expect(result.tomadorCep).toBe("")
    expect(result.tomadorMunicipioUf).toBe("")
  })
})
