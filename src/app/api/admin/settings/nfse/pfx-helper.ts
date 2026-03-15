import forge from "node-forge"

export interface PemPair {
  certificate: string
  privateKey: string
}

/**
 * Extracts PEM-encoded certificate and private key from a PFX/P12 buffer.
 * Used to process uploaded A1 digital certificates for NFS-e signing.
 */
export function extractPemFromPfx(pfxBuffer: Buffer, password: string): PemPair {
  const asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"))
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password)

  // Extract certificate
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
  const certBag = certBags[forge.pki.oids.certBag]
  if (!certBag || certBag.length === 0 || !certBag[0].cert) {
    throw new Error("Certificado não encontrado no arquivo PFX")
  }
  const certificate = forge.pki.certificateToPem(certBag[0].cert)

  // Extract private key
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]
  if (!keyBag || keyBag.length === 0 || !keyBag[0].key) {
    throw new Error("Chave privada não encontrada no arquivo PFX")
  }
  const privateKey = forge.pki.privateKeyToPem(keyBag[0].key)

  return { certificate, privateKey }
}
