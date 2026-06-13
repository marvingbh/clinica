import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import { audit, AuditAction } from "@/lib/rbac/audit"
import {
  generateSigningToken,
  hashSigningToken,
  computeExpiry,
  sha256Hex,
  isValidCpf,
  normalizeCpf,
  toEnvelopeListItem,
  emptyEvidence,
  markSent,
} from "@/lib/assinaturas"
import { sendSigningLink } from "@/lib/assinaturas/service"
import { canAccessPatientSignatures, envelopeListScope } from "./_lib/scope"
import type { Prisma } from "@prisma/client"

const signerSchema = z.object({
  name: z.string().min(2, "Nome obrigatório").max(200),
  cpf: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.enum(["PACIENTE", "RESPONSAVEL"]),
  channel: z.enum(["EMAIL", "WHATSAPP"]).optional(),
})

const bodySchema = z.object({
  documentId: z.string().min(1),
  signers: z.array(signerSchema).min(1, "Inclua ao menos um signatário").max(5),
  expiryDays: z.number().int().positive().max(365).optional(),
})

function isMinor(birthDate: Date | null, now: Date): boolean {
  if (!birthDate) return false
  const age = (now.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return age < 18
}

export const POST = withFeatureAuth(
  { feature: "assinaturas", minAccess: "WRITE" },
  async (req: NextRequest, { user }: { user: AuthUser }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { documentId, signers, expiryDays } = parsed.data

    const doc = await prisma.generatedDocument.findFirst({
      where: { id: documentId, clinicId: user.clinicId },
      select: {
        id: true, title: true, patientId: true, pdfData: true,
        patient: { select: { birthDate: true, referenceProfessionalId: true } },
        clinic: { select: { name: true, timezone: true } },
      },
    })
    if (!doc || !doc.pdfData) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
    }
    if (!(await canAccessPatientSignatures(user, doc.patientId))) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 })
    }

    const now = new Date()
    if (isMinor(doc.patient.birthDate, now) && signers[0].role !== "RESPONSAVEL") {
      return NextResponse.json(
        { error: "Para paciente menor de idade, o primeiro signatário deve ser o responsável." },
        { status: 400 }
      )
    }

    // Validate each signer: at least one contact; valid CPF if provided.
    for (const s of signers) {
      const hasContact = (s.email && s.email.length > 0) || (s.phone && s.phone.length > 0)
      if (!hasContact) {
        return NextResponse.json(
          { error: "Cadastre um e-mail ou telefone com consentimento para enviar." },
          { status: 400 }
        )
      }
      if (s.cpf && s.cpf.length > 0 && !isValidCpf(s.cpf)) {
        return NextResponse.json({ error: `CPF inválido para ${s.name}.` }, { status: 400 })
      }
    }

    const originalSha256 = sha256Hex(new Uint8Array(doc.pdfData))
    const expiresAt = computeExpiry(now, expiryDays)
    const firstToken = generateSigningToken()

    const envelope = await prisma.$transaction(async (tx) => {
      const env = await tx.signatureEnvelope.create({
        data: {
          clinicId: user.clinicId,
          documentId: doc.id,
          patientId: doc.patientId,
          requestedByUserId: user.id,
          status: "EM_ANDAMENTO",
          originalSha256,
        },
      })
      for (let i = 0; i < signers.length; i++) {
        const s = signers[i]
        const token = i === 0 ? firstToken : generateSigningToken()
        await tx.signatureRequest.create({
          data: {
            clinicId: user.clinicId,
            envelopeId: env.id,
            signerName: s.name,
            signerCpf: s.cpf && s.cpf.length > 0 ? normalizeCpf(s.cpf) : null,
            signerEmail: s.email && s.email.length > 0 ? s.email : null,
            signerPhone: s.phone && s.phone.length > 0 ? s.phone : null,
            role: s.role,
            signingOrder: i + 1,
            status: "PENDENTE",
            tokenHash: hashSigningToken(token),
            expiresAt,
            otpChannel: s.channel ?? (s.email ? "EMAIL" : "WHATSAPP"),
            evidence: emptyEvidence(originalSha256) as unknown as Prisma.InputJsonValue,
          },
        })
      }
      return env
    })

    // Send the link to the first signer only (sequential signing).
    const first = signers[0]
    const sentChannel = await sendSigningLink({
      clinicId: user.clinicId,
      clinicName: doc.clinic.name,
      patientId: doc.patientId,
      signer: {
        signerName: first.name,
        signerEmail: first.email && first.email.length > 0 ? first.email : null,
        signerPhone: first.phone && first.phone.length > 0 ? first.phone : null,
        otpChannel: (first.channel ?? null) as "EMAIL" | "WHATSAPP" | null,
      },
      token: firstToken,
      documentTitle: doc.title,
      expiresAt,
      tz: doc.clinic.timezone,
    })
    if (sentChannel) {
      const firstReq = await prisma.signatureRequest.findFirst({
        where: { envelopeId: envelope.id, signingOrder: 1 },
        select: { id: true, evidence: true },
      })
      if (firstReq) {
        const ev = markSent(emptyEvidence(originalSha256), now, sentChannel)
        await prisma.signatureRequest.update({
          where: { id: firstReq.id },
          data: { linkSentAt: now, otpChannel: sentChannel, evidence: ev as unknown as Prisma.InputJsonValue },
        })
      }
    }

    await audit.log({
      user,
      action: AuditAction.SIGNATURE_REQUEST_SENT,
      entityType: "SignatureEnvelope",
      entityId: envelope.id,
      newValues: { documentId: doc.id, patientId: doc.patientId, signers: signers.length },
      request: req,
    }).catch(() => {})

    const requests = await prisma.signatureRequest.findMany({ where: { envelopeId: envelope.id } })
    return NextResponse.json({ envelope: toEnvelopeListItem(envelope, requests) }, { status: 201 })
  }
)

export const GET = withFeatureAuth(
  { feature: "assinaturas", minAccess: "READ" },
  async (req: NextRequest, { user }: { user: AuthUser }) => {
    const sp = new URL(req.url).searchParams
    const patientId = sp.get("patientId")
    const status = sp.get("status")
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1)
    const limit = 50

    const where = {
      ...envelopeListScope(user),
      ...(patientId ? { patientId } : {}),
      ...(status ? { status: status as never } : {}),
    } as Prisma.SignatureEnvelopeWhereInput

    const envelopes = await prisma.signatureEnvelope.findMany({
      where,
      // Never select signedPdf in the list.
      select: {
        id: true, status: true, documentId: true, patientId: true,
        verificationCode: true, signedSha256: true, originalSha256: true,
        countersignedAt: true, completedAt: true, createdAt: true,
        requests: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    })

    return NextResponse.json({
      envelopes: envelopes.map((e) => toEnvelopeListItem(e, e.requests)),
    })
  }
)
