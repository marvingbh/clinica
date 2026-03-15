import { describe, it, expect } from "vitest"
import * as forge from "node-forge"
import { signDpsXml, extractPemFromPfx } from "./xml-signer"

// ============================================================================
// Helpers: Generate self-signed cert + key for testing
// ============================================================================

function generateTestCertAndKey(): { certPem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = "01"
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + 1
  )
  const attrs = [{ name: "commonName", value: "Test Clinic" }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  }
}

function generateTestPfx(password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = "01"
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + 1
  )
  const attrs = [{ name: "commonName", value: "Test Clinic PFX" }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  const pfxAsn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, password)
  const pfxDer = forge.asn1.toDer(pfxAsn1).getBytes()
  return Buffer.from(pfxDer, "binary")
}

const sampleDpsXml = `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infDPS Id="DPS3550308211222333000181NFS1">
    <tpAmb>2</tpAmb>
    <dhEmi>2026-03-15T14:30:00-03:00</dhEmi>
    <verAplic>CLINICA1.0</verAplic>
    <prest>
      <CNPJ>11222333000181</CNPJ>
      <IM>12345</IM>
    </prest>
    <toma>
      <CPF>12345678901</CPF>
      <xNome>Maria da Silva Santos</xNome>
    </toma>
    <serv>
      <cServ>
        <cTribNac>01.01</cTribNac>
        <xDescServ>Consulta de psicologia clinica</xDescServ>
      </cServ>
      <locPrest>
        <cLocPrestacao>3550308</cLocPrestacao>
      </locPrest>
    </serv>
    <valores>
      <vServPrest>
        <vServ>250.00</vServ>
      </vServPrest>
      <trib>
        <tribMun>
          <tribISSQN>1</tribISSQN>
          <cPaisResult>1058</cPaisResult>
          <tpRetISSQN>1</tpRetISSQN>
          <vBC>250.00</vBC>
          <pAliqAplic>5.00</pAliqAplic>
          <vISSQN>12.50</vISSQN>
        </tribMun>
      </trib>
    </valores>
  </infDPS>
</DPS>`

// ============================================================================
// signDpsXml
// ============================================================================

describe("signDpsXml", () => {
  const { certPem, keyPem } = generateTestCertAndKey()

  it("produces signed XML containing Signature element", () => {
    const signed = signDpsXml(sampleDpsXml, certPem, keyPem)
    expect(signed).toContain("<Signature")
    expect(signed).toContain("</Signature>")
  })

  it("contains SignedInfo with correct algorithms", () => {
    const signed = signDpsXml(sampleDpsXml, certPem, keyPem)
    expect(signed).toContain("http://www.w3.org/2001/10/xml-exc-c14n#")
    expect(signed).toContain(
      "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
    )
  })

  it("contains Reference with sha256 digest", () => {
    const signed = signDpsXml(sampleDpsXml, certPem, keyPem)
    expect(signed).toContain("http://www.w3.org/2001/04/xmlenc#sha256")
    expect(signed).toContain("<DigestValue>")
  })

  it("contains enveloped-signature transform", () => {
    const signed = signDpsXml(sampleDpsXml, certPem, keyPem)
    expect(signed).toContain(
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature"
    )
  })

  it("Signature is inside DPS element", () => {
    const signed = signDpsXml(sampleDpsXml, certPem, keyPem)
    const dpsStart = signed.indexOf("<DPS")
    const dpsEnd = signed.indexOf("</DPS>")
    const sigStart = signed.indexOf("<Signature")
    expect(sigStart).toBeGreaterThan(dpsStart)
    expect(sigStart).toBeLessThan(dpsEnd)
  })

  it("preserves original infDPS content", () => {
    const signed = signDpsXml(sampleDpsXml, certPem, keyPem)
    expect(signed).toContain("<CNPJ>11222333000181</CNPJ>")
    expect(signed).toContain("<CPF>12345678901</CPF>")
    expect(signed).toContain("<vServ>250.00</vServ>")
  })

  it("contains X509Certificate in KeyInfo", () => {
    const signed = signDpsXml(sampleDpsXml, certPem, keyPem)
    expect(signed).toContain("<X509Certificate>")
    expect(signed).toContain("</X509Certificate>")
  })
})

// ============================================================================
// extractPemFromPfx
// ============================================================================

describe("extractPemFromPfx", () => {
  it("extracts certPem and keyPem from valid PFX", () => {
    const password = "test123"
    const pfxBuffer = generateTestPfx(password)
    const result = extractPemFromPfx(pfxBuffer, password)

    expect(result.certPem).toContain("-----BEGIN CERTIFICATE-----")
    expect(result.certPem).toContain("-----END CERTIFICATE-----")
    expect(result.keyPem).toContain("-----BEGIN RSA PRIVATE KEY-----")
    expect(result.keyPem).toContain("-----END RSA PRIVATE KEY-----")
  })

  it("throws on wrong password", () => {
    const pfxBuffer = generateTestPfx("correct")
    expect(() => extractPemFromPfx(pfxBuffer, "wrong")).toThrow()
  })

  it("throws on invalid buffer", () => {
    const invalidBuffer = Buffer.from("not a pfx file")
    expect(() => extractPemFromPfx(invalidBuffer, "any")).toThrow()
  })
})
