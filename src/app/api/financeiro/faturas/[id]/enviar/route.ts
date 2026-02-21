import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const POST = withAuth(
  { resource: "invoice", action: "update" },
  async (req: NextRequest, { user, scope }, params) => {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      include: {
        patient: { select: { id: true, name: true, phone: true, consentWhatsApp: true } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    if (!invoice.patient.consentWhatsApp) {
      return NextResponse.json(
        { error: "Paciente não autorizou comunicação via WhatsApp" },
        { status: 400 }
      )
    }

    if (!invoice.messageBody) {
      return NextResponse.json(
        { error: "Fatura sem mensagem. Regenere a fatura." },
        { status: 400 }
      )
    }

    // Create notification record for the WhatsApp message
    // Using APPOINTMENT_REMINDER as the closest available notification type
    // TODO: Add INVOICE notification type to the NotificationType enum
    await prisma.notification.create({
      data: {
        clinicId: user.clinicId,
        patientId: invoice.patientId,
        type: "APPOINTMENT_REMINDER",
        channel: "WHATSAPP",
        recipient: invoice.patient.phone,
        content: invoice.messageBody,
      },
    })

    return NextResponse.json({ success: true, message: "Fatura enviada via WhatsApp" })
  }
)
