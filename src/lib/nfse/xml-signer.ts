import { SignedXml } from "xml-crypto"
import * as forge from "node-forge"

// ============================================================================
// signDpsXml — XML digital signature for NFS-e DPS
// ============================================================================

export function signDpsXml(
  dpsXml: string,
  certPem: string,
  keyPem: string
): string {
  // Extract base64 certificate content (without PEM headers) for X509Data
  const certBase64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s/g, "")

  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
    signatureAlgorithm:
      "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  })

  sig.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
  })

  sig.getKeyInfoContent = () =>
    `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`

  sig.computeSignature(dpsXml, {
    location: { reference: "//*[local-name(.)='DPS']", action: "append" },
  })

  return sig.getSignedXml()
}

// ============================================================================
// extractPemFromPfx — Convert A1 certificate (.pfx) to PEM strings
// ============================================================================

export function extractPemFromPfx(
  pfxBuffer: Buffer,
  password: string
): { certPem: string; keyPem: string } {
  const pfxAsn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"))
  const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password)

  const keyBags = pfx.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
  })
  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag })

  const key =
    keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key
  const cert = certBags[forge.pki.oids.certBag]?.[0]?.cert

  if (!key || !cert) {
    throw new Error(
      "Certificado A1 invalido: nao foi possivel extrair chave e certificado"
    )
  }

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(key),
  }
}
