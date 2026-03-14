import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const updateSettingsSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200).optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email("Email inválido").max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  timezone: z.string().min(1).max(100).optional(),
  defaultSessionDuration: z
    .number()
    .int()
    .min(15, "Duração mínima é 15 minutos")
    .max(180, "Duração máxima é 180 minutos")
    .optional(),
  minAdvanceBooking: z
    .number()
    .int()
    .min(0, "Valor mínimo é 0 horas")
    .max(168, "Valor máximo é 168 horas (7 dias)")
    .optional(),
  reminderHours: z
    .array(z.number().int().min(0).max(168))
    .max(10, "Máximo de 10 lembretes")
    .optional(),
  invoiceDueDay: z.number().int().min(1, "Mínimo dia 1").max(28, "Máximo dia 28").optional(),
  invoiceMessageTemplate: z.string().nullable().optional(),
  paymentInfo: z.string().nullable().optional(),
  billingMode: z.enum(["PER_SESSION", "MONTHLY_FIXED"]).optional(),
  invoiceGrouping: z.enum(["MONTHLY", "PER_SESSION"]).optional(),
  taxPercentage: z.number().min(0).max(100).optional(),
})

/**
 * GET /api/admin/settings
 * Returns clinic settings - ADMIN only
 */
export const GET = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "READ" },
  async (req, { user }) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        timezone: true,
        defaultSessionDuration: true,
        minAdvanceBooking: true,
        reminderHours: true,
        invoiceDueDay: true,
        invoiceMessageTemplate: true,
        paymentInfo: true,
        billingMode: true,
        invoiceGrouping: true,
        taxPercentage: true,
        logoData: true,
      },
    })

    if (!clinic) {
      return NextResponse.json(
        { error: "Clínica não encontrada" },
        { status: 404 }
      )
    }

    const { logoData, ...rest } = clinic
    return NextResponse.json({ settings: { ...rest, hasLogo: !!logoData } })
  }
)

/**
 * PATCH /api/admin/settings
 * Updates clinic settings - ADMIN only
 */
export const PATCH = withFeatureAuth(
  { feature: "clinic_settings", minAccess: "WRITE" },
  async (req, { user }) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      )
    }

    const parsed = updateSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { name, phone, email, address, timezone, defaultSessionDuration, minAdvanceBooking, reminderHours, invoiceDueDay, invoiceMessageTemplate, paymentInfo, billingMode, invoiceGrouping, taxPercentage } =
      parsed.data

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (phone !== undefined) updateData.phone = phone || null
    if (email !== undefined) updateData.email = email || null
    if (address !== undefined) updateData.address = address || null
    if (timezone !== undefined) updateData.timezone = timezone
    if (defaultSessionDuration !== undefined)
      updateData.defaultSessionDuration = defaultSessionDuration
    if (minAdvanceBooking !== undefined) updateData.minAdvanceBooking = minAdvanceBooking
    if (reminderHours !== undefined) updateData.reminderHours = reminderHours
    if (invoiceDueDay !== undefined) updateData.invoiceDueDay = invoiceDueDay
    if (invoiceMessageTemplate !== undefined) updateData.invoiceMessageTemplate = invoiceMessageTemplate || null
    if (paymentInfo !== undefined) updateData.paymentInfo = paymentInfo || null
    if (billingMode !== undefined) updateData.billingMode = billingMode
    if (invoiceGrouping !== undefined) updateData.invoiceGrouping = invoiceGrouping
    if (taxPercentage !== undefined) updateData.taxPercentage = taxPercentage

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo para atualizar" },
        { status: 400 }
      )
    }

    // When switching to MONTHLY_FIXED, force invoiceGrouping to MONTHLY
    // and clear patient-level PER_SESSION overrides
    if (billingMode === "MONTHLY_FIXED") {
      updateData.invoiceGrouping = "MONTHLY"
    }

    const clinicSelect = {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      timezone: true,
      defaultSessionDuration: true,
      minAdvanceBooking: true,
      reminderHours: true,
      invoiceDueDay: true,
      invoiceMessageTemplate: true,
      paymentInfo: true,
      billingMode: true,
      invoiceGrouping: true,
      taxPercentage: true,
    } as const

    const updatedClinic = billingMode === "MONTHLY_FIXED"
      ? await prisma.$transaction(async (tx) => {
          const clinic = await tx.clinic.update({
            where: { id: user.clinicId },
            data: updateData,
            select: clinicSelect,
          })
          // Clear patient-level PER_SESSION overrides
          await tx.patient.updateMany({
            where: { clinicId: user.clinicId, invoiceGrouping: "PER_SESSION" },
            data: { invoiceGrouping: null },
          })
          return clinic
        })
      : await prisma.clinic.update({
          where: { id: user.clinicId },
          data: updateData,
          select: clinicSelect,
        })

    return NextResponse.json({ settings: updatedClinic })
  }
)
