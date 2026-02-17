import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"

// WhatsApp format validation: Brazilian format with country code
const phoneRegex = /^(\+?55)?(\d{2})(\d{8,9})$/

const additionalPhoneSchema = z.object({
  id: z.string().optional(),
  phone: z.string().regex(phoneRegex, "Telefone inválido. Use formato WhatsApp: (11) 99999-9999"),
  label: z.string().min(1, "Rótulo é obrigatório").max(30, "Rótulo deve ter no máximo 30 caracteres"),
})

const updatePatientSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200).optional(),
  phone: z
    .string()
    .regex(phoneRegex, "Telefone inválido. Use formato WhatsApp: (11) 99999-9999")
    .optional(),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  birthDate: z.string().optional().nullable(),
  cpf: z.string().max(14).optional().nullable().or(z.literal("")),
  fatherName: z.string().max(200).optional().nullable().or(z.literal("")),
  motherName: z.string().max(200).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable().or(z.literal("")),
  referenceProfessionalId: z.string().optional().nullable().or(z.literal("")),
  isActive: z.boolean().optional(),
  consentWhatsApp: z.boolean().optional(),
  consentEmail: z.boolean().optional(),
  additionalPhones: z.array(additionalPhoneSchema).max(4, "Máximo de 4 telefones adicionais").optional(),
})

/**
 * GET /api/patients/:id
 * Get a specific patient with appointment history
 */
export const GET = withAuth(
  { resource: "patient", action: "read" },
  async (req, { user, scope }, params) => {
    const { searchParams } = new URL(req.url)
    const appointmentsLimit = Math.min(Number(searchParams.get("appointmentsLimit")) || 10, 50)
    const appointmentsSkip = Math.max(Number(searchParams.get("appointmentsSkip")) || 0, 0)
    const appointmentsStatus = searchParams.get("appointmentsStatus") // optional status filter

    // Build base query
    const where: Record<string, unknown> = {
      id: params.id,
      clinicId: user.clinicId,
    }

    // For "own" scope, verify the professional has appointments with this patient
    if (scope === "own" && user.professionalProfileId) {
      where.appointments = {
        some: {
          professionalProfileId: user.professionalProfileId,
        },
      }
    }

    // Build appointment filter
    const appointmentWhere: Record<string, unknown> = {}
    if (appointmentsStatus) {
      appointmentWhere.status = appointmentsStatus
    }

    const [patient, appointmentsTotal] = await Promise.all([
      prisma.patient.findFirst({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          birthDate: true,
          cpf: true,
          fatherName: true,
          motherName: true,
          notes: true,
          isActive: true,
          lastVisitAt: true,
          consentWhatsApp: true,
          consentWhatsAppAt: true,
          consentEmail: true,
          consentEmailAt: true,
          createdAt: true,
          updatedAt: true,
          referenceProfessionalId: true,
          referenceProfessional: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          additionalPhones: {
            select: {
              id: true,
              phone: true,
              label: true,
            },
            orderBy: { createdAt: "asc" },
          },
          appointments: {
            where: appointmentWhere,
            orderBy: { scheduledAt: "asc" },
            skip: appointmentsSkip,
            take: appointmentsLimit,
            select: {
              id: true,
              scheduledAt: true,
              endAt: true,
              status: true,
              modality: true,
              notes: true,
              professionalProfile: {
                select: {
                  id: true,
                  user: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      // Count total appointments for pagination
      prisma.appointment.count({
        where: {
          patientId: params.id,
          clinicId: user.clinicId,
          ...appointmentWhere,
        },
      }),
    ])

    if (!patient) {
      return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ patient, appointmentsTotal })
  }
)

/**
 * PATCH /api/patients/:id
 * Update a patient - ADMIN only
 */
export const PATCH = withAuth(
  { resource: "patient", action: "update" },
  async (req, { user, scope }, params) => {
    // Only ADMIN can update (clinic scope required)
    if (scope !== "clinic") {
      return forbiddenResponse("Apenas administradores podem atualizar pacientes")
    }

    // Verify the patient exists and belongs to the clinic
    const existing = await prisma.patient.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
    }

    const body = await req.json()
    const validation = updatePatientSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const data = validation.data
    const updateData: Record<string, unknown> = {}

    // Handle simple fields
    if (data.name !== undefined) updateData.name = data.name
    if (data.email !== undefined) updateData.email = data.email || null
    if (data.birthDate !== undefined) {
      updateData.birthDate = data.birthDate ? new Date(data.birthDate + "T00:00:00") : null
    }
    if (data.fatherName !== undefined) updateData.fatherName = data.fatherName || null
    if (data.motherName !== undefined) updateData.motherName = data.motherName || null
    if (data.notes !== undefined) updateData.notes = data.notes || null
    if (data.referenceProfessionalId !== undefined) updateData.referenceProfessionalId = data.referenceProfessionalId || null
    if (data.isActive !== undefined) updateData.isActive = data.isActive

    // Handle phone update with duplicate check
    if (data.phone !== undefined) {
      const normalizedPhone = data.phone.replace(/\D/g, "")
      if (normalizedPhone !== existing.phone) {
        const existingPhone = await prisma.patient.findFirst({
          where: {
            clinicId: user.clinicId,
            phone: normalizedPhone,
            NOT: { id: params.id },
          },
        })

        if (existingPhone) {
          return NextResponse.json(
            { error: "Já existe um paciente com este telefone" },
            { status: 409 }
          )
        }
        updateData.phone = normalizedPhone
      }
    }

    // Handle CPF update with duplicate check
    if (data.cpf !== undefined) {
      const normalizedCpf = data.cpf ? data.cpf.replace(/\D/g, "") : null
      if (normalizedCpf !== existing.cpf) {
        if (normalizedCpf) {
          const existingCpf = await prisma.patient.findFirst({
            where: {
              clinicId: user.clinicId,
              cpf: normalizedCpf,
              NOT: { id: params.id },
            },
          })

          if (existingCpf) {
            return NextResponse.json(
              { error: "Já existe um paciente com este CPF" },
              { status: 409 }
            )
          }
        }
        updateData.cpf = normalizedCpf
      }
    }

    // Handle consent fields with timestamp tracking
    const now = new Date()
    if (data.consentWhatsApp !== undefined && data.consentWhatsApp !== existing.consentWhatsApp) {
      updateData.consentWhatsApp = data.consentWhatsApp
      updateData.consentWhatsAppAt = data.consentWhatsApp ? now : null
    }
    if (data.consentEmail !== undefined && data.consentEmail !== existing.consentEmail) {
      updateData.consentEmail = data.consentEmail
      updateData.consentEmailAt = data.consentEmail ? now : null
    }

    // Handle additional phones update (full replacement strategy)
    if (data.additionalPhones !== undefined) {
      const normalizedAdditionalPhones = data.additionalPhones.map((p) => ({
        id: p.id,
        phone: p.phone.replace(/\D/g, ""),
        label: p.label,
      }))

      // Get the primary phone (updated or existing)
      const primaryPhone = (updateData.phone as string) || existing.phone

      // Check for duplicates among additional phones and primary phone
      const allPhones = [primaryPhone, ...normalizedAdditionalPhones.map((p) => p.phone)]
      const uniquePhones = new Set(allPhones)
      if (uniquePhones.size !== allPhones.length) {
        return NextResponse.json(
          { error: "Números de telefone duplicados não são permitidos" },
          { status: 400 }
        )
      }

      // Delete all existing additional phones and recreate
      await prisma.patientPhone.deleteMany({
        where: { patientId: params.id, clinicId: user.clinicId },
      })

      if (normalizedAdditionalPhones.length > 0) {
        await prisma.patientPhone.createMany({
          data: normalizedAdditionalPhones.map((p) => ({
            patientId: params.id,
            clinicId: user.clinicId,
            phone: p.phone,
            label: p.label,
          })),
        })
      }
    }

    const patient = await prisma.patient.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        birthDate: true,
        cpf: true,
        fatherName: true,
        motherName: true,
        notes: true,
        isActive: true,
        lastVisitAt: true,
        consentWhatsApp: true,
        consentWhatsAppAt: true,
        consentEmail: true,
        consentEmailAt: true,
        createdAt: true,
        updatedAt: true,
        referenceProfessionalId: true,
        referenceProfessional: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        additionalPhones: {
          select: { id: true, phone: true, label: true },
          orderBy: { createdAt: "asc" },
        },
      },
    })

    // Build old/new values for audit (only changed fields)
    const oldValues: Record<string, unknown> = {}
    const newValues: Record<string, unknown> = {}

    if (data.name !== undefined && data.name !== existing.name) {
      oldValues.name = existing.name
      newValues.name = data.name
    }
    if (data.email !== undefined && (data.email || null) !== existing.email) {
      oldValues.email = existing.email
      newValues.email = data.email || null
    }
    if (data.phone !== undefined && updateData.phone !== existing.phone) {
      oldValues.phone = existing.phone
      newValues.phone = updateData.phone
    }
    if (data.isActive !== undefined && data.isActive !== existing.isActive) {
      oldValues.isActive = existing.isActive
      newValues.isActive = data.isActive
    }
    if (data.consentWhatsApp !== undefined && data.consentWhatsApp !== existing.consentWhatsApp) {
      oldValues.consentWhatsApp = existing.consentWhatsApp
      newValues.consentWhatsApp = data.consentWhatsApp
    }
    if (data.consentEmail !== undefined && data.consentEmail !== existing.consentEmail) {
      oldValues.consentEmail = existing.consentEmail
      newValues.consentEmail = data.consentEmail
    }

    // Only log if there were actual changes
    if (Object.keys(newValues).length > 0) {
      await audit.log({
        user,
        action: AuditAction.PATIENT_UPDATED,
        entityType: "Patient",
        entityId: params.id,
        oldValues,
        newValues,
        request: req,
      })
    }

    return NextResponse.json({ patient })
  }
)

/**
 * DELETE /api/patients/:id
 * Soft-delete (deactivate) a patient - ADMIN only
 */
export const DELETE = withAuth(
  { resource: "patient", action: "delete" },
  async (req, { user, scope }, params) => {
    // Only ADMIN can delete (clinic scope required)
    if (scope !== "clinic") {
      return forbiddenResponse("Apenas administradores podem desativar pacientes")
    }

    // Verify the patient exists and belongs to the clinic
    const existing = await prisma.patient.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
    }

    // Soft delete by setting isActive to false
    await prisma.patient.update({
      where: { id: params.id },
      data: { isActive: false },
    })

    // Create audit log
    await audit.log({
      user,
      action: AuditAction.PATIENT_DELETED,
      entityType: "Patient",
      entityId: params.id,
      oldValues: {
        name: existing.name,
        isActive: existing.isActive,
      },
      newValues: {
        isActive: false,
      },
      request: req,
    })

    return NextResponse.json({ success: true })
  }
)
