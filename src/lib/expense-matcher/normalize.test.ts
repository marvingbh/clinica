import { describe, it, expect } from "vitest"
import { normalizeDescription } from "./normalize"

describe("normalizeDescription", () => {
  it("strips PIX prefix", () => {
    expect(normalizeDescription("PIX ENVIO COPEL ENERGIA")).toBe("copel energia")
    expect(normalizeDescription("PIX RECEBIDO JOAO SILVA")).toBe("joao silva")
    expect(normalizeDescription("PIX FORNECEDOR ABC")).toBe("fornecedor abc")
  })

  it("strips TED prefix", () => {
    expect(normalizeDescription("TED ENVIADA EMPRESA XYZ")).toBe("empresa xyz")
    expect(normalizeDescription("TED RECEBIDA CLIENTE")).toBe("cliente")
  })

  it("strips payment prefixes", () => {
    expect(normalizeDescription("PGTO LUZ COPEL")).toBe("luz copel")
    expect(normalizeDescription("DEBITO AUTOMATICO INTERNET")).toBe("internet")
  })

  it("removes trailing reference numbers", () => {
    expect(normalizeDescription("COPEL ENERGIA 123456")).toBe("copel energia")
    expect(normalizeDescription("NET VIRTUA 98765432")).toBe("net virtua")
  })

  it("keeps short numbers (less than 4 digits)", () => {
    expect(normalizeDescription("ALUGUEL APT 42")).toBe("aluguel apt 42")
  })

  it("collapses multiple spaces", () => {
    expect(normalizeDescription("  FORNECEDOR   ABC  ")).toBe("fornecedor abc")
  })

  it("lowercases everything", () => {
    expect(normalizeDescription("CPFL PAULISTA")).toBe("cpfl paulista")
  })
})
