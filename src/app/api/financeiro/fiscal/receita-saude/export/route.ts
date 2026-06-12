import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { OwnershipError, assertProfessionalInClinic } from "@/lib/clinic/ownership"
import { audit, AuditAction } from "@/lib/rbac/audit"
import {
  loadReciboData,
  yearWindow,
  buildReciboBatchFile,
  buildReciboBatchFileName,
  type ReciboRow,
  type ExportableRecibo,
} from "@/lib/fiscal"

const schema = z.object({
  professionalProfileId: z.string().min(1),
  paymentKeys: z.array(z.string().min(1)).min(1, "Selecione ao menos um pagamento"),
  year: z.number().int().min(2020).max(2100).optional(),
})

function toExportable(row: ReciboRow): ExportableRecibo {
  return {
    paymentKey: row.paymentKey,
    paymentDate: row.paymentDate!,
    amount: row.amount,
    beneficiaryCpf: row.beneficiary.cpf!,
    beneficiaryName: row.beneficiary.name,
    beneficiaryBirthDate: row.beneficiary.birthDate!,
    payerCpf: row.payer.cpf!,
    payerName: row.payer.name,
  }
}

/** POST — generate a Receita Saúde batch file + persist the emission rows. */
export const POST = withFeatureAuth(
  { feature: "fiscal", minAccess: "WRITE" },
  async (req, { user }) => {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { professionalProfileId, paymentKeys } = parsed.data

    // PROFESSIONAL may only export their own batch.
    if (user.role === "PROFESSIONAL" && professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("Você só pode exportar os seus próprios recibos.")
    }

    try {
      await assertProfessionalInClinic(user.clinicId, professionalProfileId)
    } catch (e) {
      if (e instanceof OwnershipError) {
        return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
      }
      throw e
    }

    // Recompute rows server-side for the whole year (the keys must be a subset).
    const { from, to } = yearWindow(parsed.data.year ?? new Date().getFullYear())
    const { rows, professionals } = await loadReciboData(prisma, {
      clinicId: user.clinicId,
      from,
      to,
      professionalProfileId,
    })

    const selected = rows.filter((r) => paymentKeys.includes(r.paymentKey))
    if (selected.length === 0) {
      return NextResponse.json({ error: "Nenhum pagamento válido selecionado" }, { status: 422 })
    }
    const blocked = selected.filter((r) => r.blockers.length > 0 || r.fullyRefunded)
    if (blocked.length > 0) {
      return NextResponse.json(
        { error: "Há pagamentos bloqueados na seleção", blockers: blocked.map((r) => r.paymentKey) },
        { status: 422 }
      )
    }

    const prof = professionals.get(professionalProfileId)!
    const issuer = { cpf: prof.cpf!, crp: prof.crp!, name: prof.name }
    const fileContent = buildReciboBatchFile(selected.map(toExportable), issuer)
    const fileName = buildReciboBatchFileName(issuer, new Date())
    const totalAmount = selected.reduce((s, r) => s + r.amount, 0)

    const batchId = await prisma.$transaction(async (tx) => {
      const batch = await tx.reciboSaudeBatch.create({
        data: {
          clinicId: user.clinicId,
          professionalProfileId,
          generatedByUserId: user.id,
          fileName,
          fileContent,
          itemCount: selected.length,
          totalAmount,
        },
      })
      for (const row of selected) {
        await tx.reciboSaudeEmission.upsert({
          where: { clinicId_paymentKey: { clinicId: user.clinicId, paymentKey: row.paymentKey } },
          create: {
            clinicId: user.clinicId,
            batchId: batch.id,
            professionalProfileId,
            patientId: row.patientId,
            invoiceId: row.invoiceId,
            reconciliationLinkId: row.reconciliationLinkId,
            paymentKey: row.paymentKey,
            paymentDate: row.paymentDate!,
            amount: row.amount,
            beneficiaryCpf: row.beneficiary.cpf!,
            beneficiaryName: row.beneficiary.name,
            beneficiaryBirthDate: row.beneficiary.birthDate!,
            payerCpf: row.payer.cpf!,
            payerName: row.payer.name,
            status: "EXPORTADO",
          },
          update: {
            batchId: batch.id,
            status: "EXPORTADO",
            reciboNumero: null,
            erro: null,
            emitidoAt: null,
            canceladoAt: null,
            paymentDate: row.paymentDate!,
            amount: row.amount,
          },
        })
      }
      return batch.id
    })

    await audit.log({
      user,
      action: AuditAction.RECIBO_SAUDE_BATCH_EXPORTED,
      entityType: "ReciboSaudeBatch",
      entityId: batchId,
      newValues: { itemCount: selected.length, totalAmount, professionalProfileId },
      request: req,
    })

    return NextResponse.json({ batchId, fileName, fileContent })
  }
)
