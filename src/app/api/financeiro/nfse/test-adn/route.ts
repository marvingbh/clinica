import { NextRequest, NextResponse } from "next/server"
import https from "https"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/bank-reconciliation/encryption"

/**
 * GET /api/financeiro/nfse/test-adn?chave=XXXXX
 * Diagnostic endpoint to test ADN DANFSE connectivity from the server.
 */
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const url = new URL(req.url)
    const chave = url.searchParams.get("chave")
    if (!chave) {
      return NextResponse.json({ error: "chave parameter required" }, { status: 400 })
    }

    const nfseConfig = await prisma.nfseConfig.findFirst({
      where: { clinicId: user.clinicId },
    })
    if (!nfseConfig) {
      return NextResponse.json({ error: "NFS-e config not found" }, { status: 404 })
    }

    const results: Record<string, unknown> = {
      chave,
      useSandbox: nfseConfig.useSandbox,
    }

    // Test 1: Decrypt cert
    try {
      const cert = decrypt(nfseConfig.certificatePem)
      const key = decrypt(nfseConfig.privateKeyPem)
      results.certDecrypted = true
      results.certLength = cert.length
      results.certStartsWith = cert.substring(0, 30)
      results.keyLength = key.length

      // Test 2: ADN DANFSE endpoint
      const adnHost = nfseConfig.useSandbox ? "adn.producaorestrita.nfse.gov.br" : "adn.nfse.gov.br"
      const adnUrl = `https://${adnHost}/danfse/${chave}`
      results.adnUrl = adnUrl

      const agent = new https.Agent({ cert, key })

      const adnResult = await new Promise<{ status: number; contentType: string; bodyPreview: string; bodyLength: number }>((resolve, reject) => {
        const r = https.request(adnUrl, { method: "GET", agent, headers: { Accept: "application/pdf" }, timeout: 10000 }, (res) => {
          const chunks: Buffer[] = []
          res.on("data", (c: Buffer) => chunks.push(c))
          res.on("end", () => {
            const buf = Buffer.concat(chunks)
            resolve({
              status: res.statusCode || 0,
              contentType: res.headers["content-type"] || "unknown",
              bodyLength: buf.length,
              bodyPreview: buf.toString("utf-8").slice(0, 300),
            })
          })
        })
        r.on("error", (e) => reject(e))
        r.on("timeout", () => { r.destroy(); reject(new Error("timeout")) })
        r.end()
      })

      results.adnResponse = adnResult

      // Test 3: Also test SEFIN (for comparison - this one works)
      const sefinHost = nfseConfig.useSandbox ? "sefin.producaorestrita.nfse.gov.br" : "sefin.nfse.gov.br"
      const sefinUrl = `https://${sefinHost}/SefinNacional/nfse/${chave}`

      const sefinResult = await new Promise<{ status: number; contentType: string; bodyPreview: string }>((resolve, reject) => {
        const r = https.request(sefinUrl, { method: "GET", agent, headers: { Accept: "application/json" }, timeout: 10000 }, (res) => {
          const chunks: Buffer[] = []
          res.on("data", (c: Buffer) => chunks.push(c))
          res.on("end", () => {
            const buf = Buffer.concat(chunks)
            resolve({
              status: res.statusCode || 0,
              contentType: res.headers["content-type"] || "unknown",
              bodyPreview: buf.toString("utf-8").slice(0, 300),
            })
          })
        })
        r.on("error", (e) => reject(e))
        r.on("timeout", () => { r.destroy(); reject(new Error("timeout")) })
        r.end()
      })

      results.sefinResponse = sefinResult
    } catch (error) {
      results.certDecrypted = false
      results.error = error instanceof Error ? error.message : String(error)
    }

    return NextResponse.json(results)
  }
)
