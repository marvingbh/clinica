import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  buildBaseEmissionData,
  emitSingleNfse,
  type BaseEmissionInvoice,
  type BaseEmissionNfseConfig,
  type AddressOverride,
} from "./emit-single"

// ============================================================================
// Mocks
// ============================================================================

vi.mock("./cep-lookup", () => ({
  lookupIbgeFromCep: vi.fn(),
}))

vi.mock("./dps-builder", () => ({
  buildDpsXml: vi.fn(() => "<DPS>mock-xml</DPS>"),
}))

vi.mock("./xml-signer", () => ({
  signDpsXml: vi.fn(() => "<DPS>signed-xml</DPS>"),
}))

vi.mock("./adn-client", () => ({
  emitNfse: vi.fn(),
}))

vi.mock("./adn-logger", () => ({
  logAdnCall: vi.fn(),
}))

vi.mock("@/lib/bank-reconciliation/encryption", () => ({
  decrypt: vi.fn((val: string) => `decrypted:${val}`),
}))

import { lookupIbgeFromCep } from "./cep-lookup"
import { buildDpsXml } from "./dps-builder"
import { signDpsXml } from "./xml-signer"
import { emitNfse } from "./adn-client"

// ============================================================================
// Fixtures
// ============================================================================

const sampleInvoice: BaseEmissionInvoice = {
  patient: {
    name: "Maria Silva",
    billingResponsibleName: "Joao Silva",
    addressStreet: "Rua das Flores",
    addressNumber: "100",
    addressNeighborhood: "Centro",
    addressZip: "30130000",
  },
  clinic: {
    name: "Clinica Teste",
    email: "contato@clinica.com",
    phone: "31999998888",
  },
}

const sampleNfseConfig: BaseEmissionNfseConfig = {
  cnpj: "11222333000181",
  inscricaoMunicipal: "12345",
  regimeTributario: "3",
  opSimpNac: 1,
  codigoMunicipio: "3106200",
  codigoNbs: "123019800",
  cClassNbs: "200029",
}

// ============================================================================
// buildBaseEmissionData
// ============================================================================

describe("buildBaseEmissionData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(lookupIbgeFromCep).mockResolvedValue("3106200")
  })

  it("maps prestador fields from nfseConfig and clinic", async () => {
    const result = await buildBaseEmissionData(
      sampleInvoice, sampleNfseConfig, "12345678901",
      undefined, undefined, "041601", undefined, 5,
    )
    expect(result.prestadorCnpj).toBe("11222333000181")
    expect(result.prestadorIm).toBe("12345")
    expect(result.prestadorNome).toBe("Clinica Teste")
    expect(result.prestadorRegimeTributario).toBe("3")
    expect(result.prestadorOpSimpNac).toBe(1)
    expect(result.prestadorEmail).toBe("contato@clinica.com")
    expect(result.prestadorFone).toBe("31999998888")
  })

  it("maps tomador fields from patient data", async () => {
    const result = await buildBaseEmissionData(
      sampleInvoice, sampleNfseConfig, "12345678901",
      undefined, undefined, "041601", undefined, 5,
    )
    expect(result.tomadorCpf).toBe("12345678901")
    expect(result.tomadorLogradouro).toBe("Rua das Flores")
    expect(result.tomadorNumero).toBe("100")
    expect(result.tomadorBairro).toBe("Centro")
    expect(result.tomadorCep).toBe("30130000")
  })

  it("uses billingResponsibleName as tomadorNome when available", async () => {
    const result = await buildBaseEmissionData(
      sampleInvoice, sampleNfseConfig, "12345678901",
      undefined, undefined, "041601", undefined, 5,
    )
    expect(result.tomadorNome).toBe("Joao Silva")
  })

  it("uses billingNameFromBody when provided", async () => {
    const result = await buildBaseEmissionData(
      sampleInvoice, sampleNfseConfig, "12345678901",
      "Override Name", undefined, "041601", undefined, 5,
    )
    expect(result.tomadorNome).toBe("Override Name")
  })

  it("falls back to patient.name when no billingResponsibleName", async () => {
    const invoice = {
      ...sampleInvoice,
      patient: { ...sampleInvoice.patient, billingResponsibleName: null },
    }
    const result = await buildBaseEmissionData(
      invoice, sampleNfseConfig, "12345678901",
      undefined, undefined, "041601", undefined, 5,
    )
    expect(result.tomadorNome).toBe("Maria Silva")
  })

  it("calls lookupIbgeFromCep with patient CEP", async () => {
    await buildBaseEmissionData(
      sampleInvoice, sampleNfseConfig, "12345678901",
      undefined, undefined, "041601", undefined, 5,
    )
    expect(lookupIbgeFromCep).toHaveBeenCalledWith("30130000")
  })

  it("throws when CEP lookup returns null", async () => {
    vi.mocked(lookupIbgeFromCep).mockResolvedValue(null)
    await expect(
      buildBaseEmissionData(
        sampleInvoice, sampleNfseConfig, "12345678901",
        undefined, undefined, "041601", undefined, 5,
      ),
    ).rejects.toThrow("Não foi possível resolver o município do CEP 30130000")
  })

  it("skips CEP lookup when no CEP is available", async () => {
    const invoice = {
      ...sampleInvoice,
      patient: { ...sampleInvoice.patient, addressZip: null },
    }
    const result = await buildBaseEmissionData(
      invoice, sampleNfseConfig, "12345678901",
      undefined, undefined, "041601", undefined, 5,
    )
    expect(lookupIbgeFromCep).not.toHaveBeenCalled()
    expect(result.tomadorCodigoMunicipio).toBeUndefined()
  })

  it("uses address override from body when provided", async () => {
    const addressOverride: AddressOverride = {
      street: "Av Brasil",
      number: "500",
      neighborhood: "Savassi",
      zip: "30140071",
    }
    const result = await buildBaseEmissionData(
      sampleInvoice, sampleNfseConfig, "12345678901",
      undefined, addressOverride, "041601", undefined, 5,
    )
    expect(result.tomadorLogradouro).toBe("Av Brasil")
    expect(result.tomadorNumero).toBe("500")
    expect(result.tomadorBairro).toBe("Savassi")
    expect(result.tomadorCep).toBe("30140071")
    expect(lookupIbgeFromCep).toHaveBeenCalledWith("30140071")
  })

  it("passes codigoServicoMunicipal when provided", async () => {
    const result = await buildBaseEmissionData(
      sampleInvoice, sampleNfseConfig, "12345678901",
      undefined, undefined, "041601", "901", 5,
    )
    expect(result.codigoServicoMunicipal).toBe("901")
  })

  it("sets codigoServicoMunicipal to undefined when not provided", async () => {
    const result = await buildBaseEmissionData(
      sampleInvoice, sampleNfseConfig, "12345678901",
      undefined, undefined, "041601", undefined, 5,
    )
    expect(result.codigoServicoMunicipal).toBeUndefined()
  })

  it("maps NBS fields from nfseConfig", async () => {
    const result = await buildBaseEmissionData(
      sampleInvoice, sampleNfseConfig, "12345678901",
      undefined, undefined, "041601", undefined, 5,
    )
    expect(result.codigoNbs).toBe("123019800")
    expect(result.cClassNbs).toBe("200029")
  })

  it("sets NBS fields to undefined when null in config", async () => {
    const config = { ...sampleNfseConfig, codigoNbs: null, cClassNbs: null }
    const result = await buildBaseEmissionData(
      sampleInvoice, config, "12345678901",
      undefined, undefined, "041601", undefined, 5,
    )
    expect(result.codigoNbs).toBeUndefined()
    expect(result.cClassNbs).toBeUndefined()
  })

  it("converts null clinic email/phone to undefined", async () => {
    const invoice = {
      ...sampleInvoice,
      clinic: { name: "Clinica", email: null, phone: null },
    }
    const result = await buildBaseEmissionData(
      invoice, sampleNfseConfig, "12345678901",
      undefined, undefined, "041601", undefined, 5,
    )
    expect(result.prestadorEmail).toBeUndefined()
    expect(result.prestadorFone).toBeUndefined()
  })
})

// ============================================================================
// emitSingleNfse
// ============================================================================

describe("emitSingleNfse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-14T10:00:00Z"))
  })

  const baseParams = {
    emissionData: {
      prestadorCnpj: "11222333000181",
      prestadorIm: "12345",
      prestadorNome: "Clinica Teste",
      prestadorRegimeTributario: "3",
      prestadorOpSimpNac: 1,
      tomadorCpf: "12345678901",
      tomadorNome: "Maria Silva",
      codigoServico: "041601",
      descricao: "Consulta psicologia",
      valor: 250,
      aliquotaIss: 5,
      codigoMunicipio: "3106200",
    },
    nfseConfig: {
      cnpj: "11222333000181",
      codigoMunicipio: "3106200",
      useSandbox: true,
      certificatePem: "encrypted-cert",
      privateKeyPem: "encrypted-key",
    },
    adnConfig: {
      certificatePem: "encrypted-cert",
      privateKeyPem: "encrypted-key",
      useSandbox: true,
      clinicId: "clinic-1",
      invoiceId: "inv-1",
    },
  }

  it("generates a DPS numero from timestamp and counter", async () => {
    vi.mocked(emitNfse).mockResolvedValue({
      nfseNumero: "123",
      chaveAcesso: "chave-abc",
    })

    await emitSingleNfse(baseParams)

    expect(buildDpsXml).toHaveBeenCalledWith(
      baseParams.emissionData,
      expect.objectContaining({
        codigoMunicipio: "3106200",
        tpAmb: 2,
        numero: expect.any(Number),
      }),
    )

    const call = vi.mocked(buildDpsXml).mock.calls[0]
    const numero = (call[1] as { numero: number }).numero
    expect(numero).toBeGreaterThan(0)
  })

  it("decrypts certificate and key before signing", async () => {
    vi.mocked(emitNfse).mockResolvedValue({
      nfseNumero: "123",
      chaveAcesso: "chave-abc",
    })

    await emitSingleNfse(baseParams)

    expect(signDpsXml).toHaveBeenCalledWith(
      "<DPS>mock-xml</DPS>",
      "decrypted:encrypted-cert",
      "decrypted:encrypted-key",
    )
  })

  it("returns success with nfse data when ADN succeeds", async () => {
    vi.mocked(emitNfse).mockResolvedValue({
      nfseNumero: "456",
      chaveAcesso: "chave-xyz",
      codigoVerificacao: "VERIF123",
      nfseXml: "<nfse>xml</nfse>",
    })

    const result = await emitSingleNfse(baseParams)

    expect(result.success).toBe(true)
    expect(result.nfseNumero).toBe("456")
    expect(result.chaveAcesso).toBe("chave-xyz")
    expect(result.codigoVerificacao).toBe("VERIF123")
    expect(result.nfseXml).toBe("<nfse>xml</nfse>")
    expect(result.error).toBeUndefined()
  })

  it("returns failure with error when ADN returns error", async () => {
    vi.mocked(emitNfse).mockResolvedValue({
      error: "[E001] CPF invalido",
    })

    const result = await emitSingleNfse(baseParams)

    expect(result.success).toBe(false)
    expect(result.error).toBe("[E001] CPF invalido")
    expect(result.nfseNumero).toBeUndefined()
  })

  it("uses tpAmb=1 for production config", async () => {
    vi.mocked(emitNfse).mockResolvedValue({ nfseNumero: "1" })

    const prodParams = {
      ...baseParams,
      nfseConfig: { ...baseParams.nfseConfig, useSandbox: false },
    }
    await emitSingleNfse(prodParams)

    expect(buildDpsXml).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tpAmb: 1 }),
    )
  })

  it("passes signed XML to emitNfse", async () => {
    vi.mocked(emitNfse).mockResolvedValue({ nfseNumero: "1" })

    await emitSingleNfse(baseParams)

    expect(emitNfse).toHaveBeenCalledWith(
      "<DPS>signed-xml</DPS>",
      baseParams.adnConfig,
    )
  })

  it("coerces undefined nfseNumero/chaveAcesso to null on success", async () => {
    vi.mocked(emitNfse).mockResolvedValue({})

    const result = await emitSingleNfse(baseParams)

    expect(result.success).toBe(true)
    expect(result.nfseNumero).toBeNull()
    expect(result.chaveAcesso).toBeNull()
    expect(result.codigoVerificacao).toBeNull()
    expect(result.nfseXml).toBeNull()
  })
})
