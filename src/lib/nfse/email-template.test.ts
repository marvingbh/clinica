import { describe, it, expect } from "vitest"
import { buildNfseEmailHtml } from "./email-template"

const baseData = {
  recipientName: "Maria da Silva",
  nfseNumero: "12345",
  clinicName: "Clínica Vida",
  emissionDate: "15/03/2026",
  valor: "R$ 250,00",
  descricao: "Serviços de psicologia clínica",
  codigoVerificacao: "ABC123",
  clinicPhone: "(31) 3333-4444",
  clinicEmail: "contato@clinicavida.com.br",
  clinicAddress: "Rua das Flores, 123 - Belo Horizonte, MG",
}

describe("buildNfseEmailHtml", () => {
  it("includes all NFS-e details", () => {
    const html = buildNfseEmailHtml(baseData)

    expect(html).toContain("Maria da Silva")
    expect(html).toContain("12345")
    expect(html).toContain("Clínica Vida")
    expect(html).toContain("15/03/2026")
    expect(html).toContain("R$ 250,00")
    expect(html).toContain("Serviços de psicologia clínica")
    expect(html).toContain("ABC123")
    expect(html).toContain("ABC123")
  })

  it("includes clinic contact info in footer", () => {
    const html = buildNfseEmailHtml(baseData)

    expect(html).toContain("(31) 3333-4444")
    expect(html).toContain("contato@clinicavida.com.br")
    expect(html).toContain("Rua das Flores")
  })

  it("omits verification block when codigoVerificacao is null", () => {
    const html = buildNfseEmailHtml({ ...baseData, codigoVerificacao: null })

    expect(html).not.toContain("Verificação")
  })

  it("returns valid HTML structure", () => {
    const html = buildNfseEmailHtml(baseData)

    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("</html>")
    expect(html).toContain('lang="pt-BR"')
  })
})
