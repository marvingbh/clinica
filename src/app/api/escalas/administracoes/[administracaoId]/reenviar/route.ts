import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { assertScaleAdministrationInClinic, OwnershipError } from "@/lib/clinic/ownership"
import { canManageScales } from "@/lib/scales"
import { resendScale } from "@/lib/scales/send"
import { getAppBaseUrl } from "@/lib/forms/base-url"
import { hasPatientConsent } from "@/lib/jobs/send-reminders"

const schema = z.object({ channel: z.enum(["WHATSAPP", "EMAIL"]) })

/**
 * POST /api/escalas/administracoes/[administracaoId]/reenviar — re-mint the link
 * for an ENVIADA/EXPIRADA administration (partial answers preserved). Resend is
 * a WRITE clinical action; ADMINs need an override + the treating cut applies.
 */
export const POST = withFeatureAuth(
  { feature: "escalas", minAccess: "WRITE" },
  async (req: NextRequest, { user, access }, params) => {
    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { channel } = parsed.data

    try {
      const admin = await assertScaleAdministrationInClinic(user.clinicId, params.administracaoId)
      if (admin.status === "CONCLUIDA") {
        return NextResponse.json(
          { error: "Esta escala já foi concluída." },
          { status: 409 }
        )
      }

      const patient = await prisma.patient.findFirst({
        where: { id: admin.patientId, clinicId: user.clinicId },
        select: {
          referenceProfessionalId: true,
          consentWhatsApp: true,
          phone: true,
          consentEmail: true,
          email: true,
        },
      })
      if (!patient) throw new OwnershipError()

      const hasAppointment =
        user.professionalProfileId !== null &&
        (await prisma.appointment.count({
          where: {
            clinicId: user.clinicId,
            patientId: admin.patientId,
            professionalProfileId: user.professionalProfileId,
          },
        })) > 0

      const allowed = canManageScales({
        viewerRole: user.role,
        viewerEscalasAccess: access,
        viewerProfessionalProfileId: user.professionalProfileId,
        patientReferenceProfessionalId: patient.referenceProfessionalId,
        viewerHasAppointmentWithPatient: hasAppointment,
      })
      if (!allowed) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
      }

      const consent = hasPatientConsent({
        consentWhatsApp: patient.consentWhatsApp,
        phone: patient.phone,
        consentEmail: patient.consentEmail,
        email: patient.email,
      })
      if (!(channel === "EMAIL" ? consent.email : consent.whatsapp)) {
        return NextResponse.json(
          { error: "Paciente sem consentimento para este canal de contato." },
          { status: 422 }
        )
      }

      const { link } = await resendScale({
        clinicId: user.clinicId,
        administrationId: admin.id,
        channel,
        baseUrl: getAppBaseUrl(),
      })

      await audit.log({
        user,
        action: AuditAction.SCALE_RESENT,
        entityType: "ScaleAdministration",
        entityId: admin.id,
        newValues: { channel },
        request: req,
      })

      return NextResponse.json({ link })
    } catch (e) {
      if (e instanceof OwnershipError) {
        return NextResponse.json({ error: "Administração não encontrada" }, { status: 404 })
      }
      throw e
    }
  }
)
