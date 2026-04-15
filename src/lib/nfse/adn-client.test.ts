import { describe, it, expect, vi, beforeEach } from "vitest"

// ============================================================================
// Mocks
// ============================================================================

vi.mock("@/lib/bank-reconciliation/encryption", () => ({
  decrypt: vi.fn((val: string) => `decrypted:${val}`),
}))

vi.mock("./adn-logger", () => ({
  logAdnCall: vi.fn(),
}))

// Mock https module to prevent real network calls
vi.mock("https", () => {
  // Must be a real class so `new https.Agent(...)` works
  class MockAgent {}
  return {
    default: {
      Agent: MockAgent,
      request: vi.fn(),
    },
    Agent: MockAgent,
    request: vi.fn(),
  }
})

import https from "https"
import { gzipSync } from "zlib"
import { emitNfse, consultaNfse, type AdnConfig } from "./adn-client"
import { logAdnCall } from "./adn-logger"

// ============================================================================
// Helpers
// ============================================================================

const baseConfig: AdnConfig = {
  certificatePem: "encrypted-cert",
  privateKeyPem: "encrypted-key",
  useSandbox: true,
  clinicId: "clinic-1",
  invoiceId: "inv-1",
}

/** Simulate an https.request that resolves with the given status and JSON body. */
function mockHttpsRequest(statusCode: number, body: Record<string, unknown>) {
  vi.mocked(https.request).mockImplementation((_url, _opts, callback) => {
    const responseBody = JSON.stringify(body)
    const res = {
      statusCode,
      on: vi.fn((event: string, handler: (chunk?: string) => void) => {
        if (event === "data") handler(responseBody)
        if (event === "end") handler()
      }),
    }
    if (callback) (callback as (res: unknown) => void)(res)
    return {
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    } as unknown as ReturnType<typeof https.request>
  })
}

/** Simulate an https.request that rejects with an error. */
function mockHttpsRequestError(errorMessage: string) {
  vi.mocked(https.request).mockImplementation((_url, _opts, _callback) => {
    const req = {
      on: vi.fn((event: string, handler: (err: Error) => void) => {
        if (event === "error") {
          setTimeout(() => handler(new Error(errorMessage)), 0)
        }
      }),
      write: vi.fn(),
      end: vi.fn(),
    }
    return req as unknown as ReturnType<typeof https.request>
  })
}

// ============================================================================
// extractAdnError (tested indirectly via emitNfse error paths)
// ============================================================================

describe("extractAdnError via emitNfse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("extracts ListaMensagemRetorno errors with Codigo and Mensagem", async () => {
    mockHttpsRequest(400, {
      ListaMensagemRetorno: [
        { Codigo: "E001", Mensagem: "CPF invalido", Correcao: "Verifique o CPF" },
      ],
    })

    const result = await emitNfse("<xml/>", baseConfig)

    expect(result.error).toBe("[E001] CPF invalido — Verifique o CPF")
    expect(result.statusCode).toBe(400)
  })

  it("joins multiple ListaMensagemRetorno entries with semicolon", async () => {
    mockHttpsRequest(422, {
      ListaMensagemRetorno: [
        { Codigo: "E001", Mensagem: "CPF invalido" },
        { Codigo: "E002", Mensagem: "CNPJ invalido" },
      ],
    })

    const result = await emitNfse("<xml/>", baseConfig)

    expect(result.error).toBe("[E001] CPF invalido; [E002] CNPJ invalido")
  })

  it("uses fallback '?' for missing Codigo", async () => {
    mockHttpsRequest(400, {
      ListaMensagemRetorno: [
        { Mensagem: "Erro generico" },
      ],
    })

    const result = await emitNfse("<xml/>", baseConfig)

    expect(result.error).toBe("[?] Erro generico")
  })

  it("uses 'Erro desconhecido' for missing Mensagem", async () => {
    mockHttpsRequest(400, {
      ListaMensagemRetorno: [
        { Codigo: "X99" },
      ],
    })

    const result = await emitNfse("<xml/>", baseConfig)

    expect(result.error).toBe("[X99] Erro desconhecido")
  })

  it("extracts message field when no ListaMensagemRetorno", async () => {
    mockHttpsRequest(500, { message: "Internal server error" })

    const result = await emitNfse("<xml/>", baseConfig)

    expect(result.error).toBe("Internal server error")
  })

  it("extracts error field when no message or ListaMensagemRetorno", async () => {
    mockHttpsRequest(503, { error: "Service unavailable" })

    const result = await emitNfse("<xml/>", baseConfig)

    expect(result.error).toBe("Service unavailable")
  })

  it("falls back to HTTP status + JSON when no known error format", async () => {
    mockHttpsRequest(502, { unknownField: "something" })

    const result = await emitNfse("<xml/>", baseConfig)

    expect(result.error).toContain("HTTP 502")
    expect(result.error).toContain("unknownField")
  })
})

// ============================================================================
// emitNfse — success path + XML parsing
// ============================================================================

describe("emitNfse success path", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("extracts nNFSe from nfseXml response", async () => {
    const nfseXml = '<NFSe><nNFSe>789</nNFSe><cVerif>ABC123</cVerif></NFSe>'
    const gzipped = gzipSync(Buffer.from(nfseXml, "utf-8"))
    const nfseXmlGZipB64 = gzipped.toString("base64")

    mockHttpsRequest(200, {
      chaveAcesso: "chave-abc",
      nfseXmlGZipB64,
    })

    const result = await emitNfse("<signed-xml/>", baseConfig)

    expect(result.nfseNumero).toBe("789")
    expect(result.chaveAcesso).toBe("chave-abc")
    expect(result.codigoVerificacao).toBe("ABC123")
    expect(result.nfseXml).toContain("<nNFSe>789</nNFSe>")
    expect(result.error).toBeUndefined()
  })

  it("uses idDps as chaveAcesso fallback", async () => {
    mockHttpsRequest(200, { idDps: "idDps-fallback" })

    const result = await emitNfse("<xml/>", baseConfig)

    expect(result.chaveAcesso).toBe("idDps-fallback")
  })

  it("handles response without nfseXmlGZipB64 gracefully", async () => {
    mockHttpsRequest(200, { chaveAcesso: "chave-only" })

    const result = await emitNfse("<xml/>", baseConfig)

    expect(result.chaveAcesso).toBe("chave-only")
    expect(result.nfseNumero).toBeUndefined()
    expect(result.nfseXml).toBeUndefined()
    expect(result.codigoVerificacao).toBeUndefined()
  })

  it("handles corrupted gzip data without crashing", async () => {
    mockHttpsRequest(200, {
      chaveAcesso: "chave-bad-gzip",
      nfseXmlGZipB64: "not-valid-base64-gzip",
    })

    const result = await emitNfse("<xml/>", baseConfig)

    // Should not crash — proceeds with chaveAcesso only
    expect(result.chaveAcesso).toBe("chave-bad-gzip")
    expect(result.nfseNumero).toBeUndefined()
  })

  it("logs ADN call on success", async () => {
    mockHttpsRequest(200, { chaveAcesso: "chave-ok" })

    await emitNfse("<xml/>", baseConfig)

    expect(logAdnCall).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: "clinic-1",
        invoiceId: "inv-1",
        operation: "emit",
        method: "POST",
        statusCode: 200,
      }),
    )
  })
})

// ============================================================================
// emitNfse — sandbox vs production URL
// ============================================================================

describe("emitNfse URL selection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses sandbox URL when useSandbox is true", async () => {
    mockHttpsRequest(200, { chaveAcesso: "c1" })

    await emitNfse("<xml/>", { ...baseConfig, useSandbox: true })

    const calledUrl = vi.mocked(https.request).mock.calls[0][0] as string
    expect(calledUrl).toContain("producaorestrita")
  })

  it("uses production URL when useSandbox is false", async () => {
    mockHttpsRequest(200, { chaveAcesso: "c1" })

    await emitNfse("<xml/>", { ...baseConfig, useSandbox: false })

    const calledUrl = vi.mocked(https.request).mock.calls[0][0] as string
    expect(calledUrl).not.toContain("producaorestrita")
    expect(calledUrl).toContain("sefin.nfse.gov.br")
  })
})
