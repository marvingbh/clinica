import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac/audit"
import { parseReciboResultFile, FiscalParseError } from "@/lib/fiscal"

const schema = z.object({ fileContent: z.string().min(1) })

/**
 * POST — upload the RFB result file. Marks each emission EMITIDO (+ número) or
 * ERRO (+ mensagem). Idempotent: re-uploading the same file converges to the
 * same state. Lines are matched to emissions by the embedded paymentKey.
 */
export const POST = withFeatureAuth(
  { feature: "fiscal", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const batch = await prisma.reciboSaudeBatch.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      select: { id: true, professionalProfileId: true },
    })
    if (!batch) return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    if (user.role === "PROFESSIONAL" && batch.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("Lote de outro profissional.")
    }

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Arquivo de resultado obrigatório" }, { status: 400 })
    }

    let lines
    try {
      lines = parseReciboResultFile(parsed.data.fileContent)
    } catch (e) {
      if (e instanceof FiscalParseError) {
        return NextResponse.json({ error: e.message }, { status: 422 })
      }
      throw e
    }

    let emitted = 0
    let errored = 0
    for (const line of lines) {
      if (!line.paymentKey) continue
      const data =
        line.outcome === "EMITIDO"
          ? {
              status: "EMITIDO" as const,
              reciboNumero: line.reciboNumero ?? null,
              erro: null,
              emitidoAt: new Date(),
            }
          : { status: "ERRO" as const, erro: line.message ?? "Erro RFB", reciboNumero: null }

      const res = await prisma.reciboSaudeEmission.updateMany({
        where: { clinicId: user.clinicId, batchId: batch.id, paymentKey: line.paymentKey },
        data,
      })
      if (res.count > 0) {
        if (line.outcome === "EMITIDO") emitted += res.count
        else errored += res.count
      }
    }

    await prisma.reciboSaudeBatch.update({
      where: { id: batch.id },
      data: { resultFileContent: parsed.data.fileContent, resultUploadedAt: new Date() },
    })

    await audit.log({
      user,
      action: AuditAction.RECIBO_SAUDE_RESULT_IMPORTED,
      entityType: "ReciboSaudeBatch",
      entityId: batch.id,
      newValues: { emitted, errored },
      request: req,
    })

    return NextResponse.json({ emitted, errored })
  }
)
