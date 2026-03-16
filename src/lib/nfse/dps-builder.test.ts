import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { buildDpsXml } from "./dps-builder"
import type { NfseEmissionData } from "./types"

const sampleData: NfseEmissionData = {
  prestadorCnpj: "11222333000181",
  prestadorIm: "12345",
  prestadorNome: "Test Clinic",
  prestadorRegimeTributario: "3", // Lucro Presumido
  prestadorOpSimpNac: 1, // Nao Optante
  tomadorCpf: "12345678901",
  tomadorNome: "Maria da Silva Santos",
  tomadorLogradouro: "Rua das Flores",
  tomadorNumero: "100",
  tomadorBairro: "Centro",
  tomadorCep: "30130000",
  codigoServico: "041601",
  descricao: "Consulta de psicologia clinica",
  valor: 250.0,
  aliquotaIss: 5,
  codigoMunicipio: "3550308",
}

const defaultConfig = {
  codigoMunicipio: "3550308",
  serie: "1",
  numero: 1,
  tpAmb: 2 as const,
}

describe("buildDpsXml", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-15T14:30:00-03:00"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("produces valid XML with correct namespace and version", () => {
    const xml = buildDpsXml(sampleData, defaultConfig)
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('xmlns="http://www.sped.fazenda.gov.br/nfse"')
    expect(xml).toContain('versao="1.00"')
  })

  it("contains infDPS with correct 45-char Id attribute", () => {
    const xml = buildDpsXml(sampleData, defaultConfig)
    // DPS(3) + mun(7) + tipo(1) + CNPJ(14) + serie(5) + numero(15) = 45
    const expectedId = "DPS355030821122233300018100001000000000000001"
    expect(expectedId).toHaveLength(45)
    expect(xml).toContain(`Id="${expectedId}"`)
  })

  it("contains required DPS header fields in correct order", () => {
    const xml = buildDpsXml(sampleData, defaultConfig)
    expect(xml).toContain("<tpAmb>2</tpAmb>")
    expect(xml).toContain("<verAplic>CLINICA1.0</verAplic>")
    expect(xml).toContain("<serie>1</serie>")
    expect(xml).toContain("<nDPS>1</nDPS>")
    expect(xml).toContain("<dCompet>2026-03-01</dCompet>")
    expect(xml).toContain("<tpEmit>1</tpEmit>")
    expect(xml).toContain("<cLocEmi>3550308</cLocEmi>")
  })

  it("contains prest with CNPJ and regTrib (no xNome when tpEmit=1)", () => {
    const xml = buildDpsXml(sampleData, defaultConfig)
    expect(xml).toContain("<CNPJ>11222333000181</CNPJ>")
    expect(xml).not.toContain("<xNome>Test Clinic</xNome>")
    expect(xml).toContain("<opSimpNac>1</opSimpNac>") // Nao Optante
    expect(xml).toContain("<regEspTrib>0</regEspTrib>")
  })

  it("sets opSimpNac=3 for ME/EPP", () => {
    const snData = { ...sampleData, prestadorOpSimpNac: 3 }
    const xml = buildDpsXml(snData, defaultConfig)
    expect(xml).toContain("<opSimpNac>3</opSimpNac>")
  })

  it("contains toma with CPF, xNome, and address", () => {
    const xml = buildDpsXml(sampleData, defaultConfig)
    expect(xml).toContain("<CPF>12345678901</CPF>")
    expect(xml).toContain("<xNome>Maria da Silva Santos</xNome>")
    expect(xml).toContain("<xLgr>Rua das Flores</xLgr>")
    expect(xml).toContain("<nro>100</nro>")
    expect(xml).toContain("<xBairro>Centro</xBairro>")
    expect(xml).toContain("<CEP>30130000</CEP>")
  })

  it("uses fallback address when not provided", () => {
    const noAddr = { ...sampleData, tomadorLogradouro: undefined, tomadorNumero: undefined, tomadorBairro: undefined }
    const xml = buildDpsXml(noAddr, defaultConfig)
    expect(xml).toContain("<xLgr>Nao informado</xLgr>")
    expect(xml).toContain("<nro>SN</nro>")
    expect(xml).toContain("<xBairro>Nao informado</xBairro>")
  })

  it("truncates xNome to 40 characters", () => {
    const longName = { ...sampleData, tomadorNome: "A".repeat(50) }
    const xml = buildDpsXml(longName, defaultConfig)
    expect(xml).toContain(`<xNome>${"A".repeat(40)}</xNome>`)
  })

  it("contains serv with locPrest before cServ", () => {
    const xml = buildDpsXml(sampleData, defaultConfig)
    expect(xml).toContain("<cLocPrestacao>3550308</cLocPrestacao>")
    expect(xml).toContain("<cTribNac>041601</cTribNac>")
    const locPrestIdx = xml.indexOf("locPrest")
    const cServIdx = xml.indexOf("cServ")
    expect(locPrestIdx).toBeLessThan(cServIdx)
  })

  it("strips non-digits from cTribNac", () => {
    const dotted = { ...sampleData, codigoServico: "04.16.01" }
    const xml = buildDpsXml(dotted, defaultConfig)
    expect(xml).toContain("<cTribNac>041601</cTribNac>")
  })

  it("contains valores with vServ formatted to 2 decimal places", () => {
    const xml = buildDpsXml(sampleData, defaultConfig)
    expect(xml).toContain("<vServ>250.00</vServ>")
  })

  it("contains trib without pAliq for Nao Optante (opSimpNac=1)", () => {
    const xml = buildDpsXml(sampleData, defaultConfig)
    expect(xml).toContain("<tribISSQN>1</tribISSQN>")
    expect(xml).toContain("<tpRetISSQN>1</tpRetISSQN>")
    expect(xml).not.toContain("<pAliq>")
    expect(xml).not.toContain("<cPaisResult>")
    expect(xml).toContain("<vTotTribFed>0.00</vTotTribFed>")
  })

  it("includes pAliq and indTotTrib for SN optante (opSimpNac=3)", () => {
    const snData = { ...sampleData, prestadorOpSimpNac: 3 }
    const xml = buildDpsXml(snData, defaultConfig)
    expect(xml).toContain("<pAliq>5.00</pAliq>")
    expect(xml).toContain("<indTotTrib>0</indTotTrib>")
  })

  it("dhEmi is in ISO 8601 format with timezone -03:00", () => {
    const xml = buildDpsXml(sampleData, defaultConfig)
    expect(xml).toContain("<dhEmi>2026-03-15T14:30:00-03:00</dhEmi>")
  })

  it("uses tpAmb=1 for production", () => {
    const xml = buildDpsXml(sampleData, { ...defaultConfig, tpAmb: 1 })
    expect(xml).toContain("<tpAmb>1</tpAmb>")
  })

  it("pads numero in Id correctly", () => {
    const xml = buildDpsXml(sampleData, { ...defaultConfig, numero: 42 })
    expect(xml).toContain("00001000000000000042")
  })

  it("handles long service descriptions by truncating to 2000 chars", () => {
    const longDesc = { ...sampleData, descricao: "A".repeat(2500) }
    const xml = buildDpsXml(longDesc, defaultConfig)
    expect(xml).toContain(`<xDescServ>${"A".repeat(2000)}</xDescServ>`)
  })
})
