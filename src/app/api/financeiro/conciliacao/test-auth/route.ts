import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { fetchStatements } from "@/lib/bank-reconciliation"
import type { InterConfig } from "@/lib/bank-reconciliation"

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const integration = await prisma.bankIntegration.findFirst({
      where: { clinicId: user.clinicId, isActive: true },
    })

    if (!integration) {
      return NextResponse.json(
        { error: "Integração bancária não configurada. Salve primeiro." },
        { status: 400 }
      )
    }

    const config: InterConfig = {
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      certificate: integration.certificate,
      privateKey: integration.privateKey,
    }

    // Try to fetch a 1-day range just to validate credentials
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const formatDate = (d: Date) => d.toISOString().split("T")[0]

    try {
      await fetchStatements(config, formatDate(yesterday), formatDate(today))
      return NextResponse.json({ success: true, message: "Autenticação bem-sucedida!" })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido"
      return NextResponse.json({ error: `Falha na autenticação: ${message}` }, { status: 502 })
    }
  }
)
