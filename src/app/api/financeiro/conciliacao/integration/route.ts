import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { encrypt } from "@/lib/bank-reconciliation"

const createSchema = z.object({
  clientId: z.string().min(1, "Client ID é obrigatório"),
  clientSecret: z.string().min(1, "Client Secret é obrigatório"),
  certificate: z.string().min(1, "Certificado é obrigatório"),
  privateKey: z.string().min(1, "Chave privada é obrigatória"),
  accountNumber: z.string().optional().nullable(),
})

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const integration = await prisma.bankIntegration.findFirst({
      where: { clinicId: user.clinicId, isActive: true },
      select: {
        id: true,
        provider: true,
        clientId: true,
        accountNumber: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ integration })
  }
)

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { clientId, clientSecret, certificate, privateKey, accountNumber } =
      parsed.data

    const integration = await prisma.bankIntegration.upsert({
      where: {
        clinicId_provider: {
          clinicId: user.clinicId,
          provider: "INTER",
        },
      },
      create: {
        clinicId: user.clinicId,
        provider: "INTER",
        clientId,
        clientSecret: encrypt(clientSecret),
        certificate: encrypt(certificate),
        privateKey: encrypt(privateKey),
        accountNumber: accountNumber || null,
      },
      update: {
        clientId,
        clientSecret: encrypt(clientSecret),
        certificate: encrypt(certificate),
        privateKey: encrypt(privateKey),
        accountNumber: accountNumber || null,
        isActive: true,
      },
      select: {
        id: true,
        provider: true,
        clientId: true,
        accountNumber: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ integration }, { status: 201 })
  }
)
