import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"

// WhatsApp format validation: Brazilian format with country code
// Accepts: +5511999999999, 5511999999999, 11999999999
const phoneRegex = /^(\+?55)?(\d{2})(\d{8,9})$/

const createPatientSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  phone: z
    .string()
    .regex(phoneRegex, "Telefone inválido. Use formato WhatsApp: (11) 99999-9999"),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  birthDate: z.string().optional().nullable(),
  cpf: z.string().max(14).optional().nullable().or(z.literal("")),
  fatherName: z.string().max(200).optional().nullable().or(z.literal("")),
  motherName: z.string().max(200).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable().or(z.literal("")),
  referenceProfessionalId: z.string().optional().nullable().or(z.literal("")),
  consentWhatsApp: z.boolean().default(false),
  consentEmail: z.boolean().default(false),
})

/**
 * GET /api/patients
 * List patients - ADMIN sees all clinic patients, PROFESSIONAL sees only patients they have appointments with
 * Supports pagination with page and limit query params
 */
export const GET = withAuth(
  { resource: "patient", action: "list" },
  async (req, { user, scope }) => {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search")
    const isActive = searchParams.get("isActive")
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)))
    const skip = (page - 1) * limit

    // Base query always filters by clinic
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    // For "own" scope, only show patients the professional has appointments with
    if (scope === "own" && user.professionalProfileId) {
      where.appointments = {
        some: {
          professionalProfileId: user.professionalProfileId,
        },
      }
    }

    // Apply optional filters
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ]
    }

    if (isActive !== null) {
      where.isActive = isActive === "true"
    }

    // Fetch patients and total count in parallel
    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          birthDate: true,
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
        },
      }),
      prisma.patient.count({ where }),
    ])

    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      patients,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    })
  }
)

/**
 * POST /api/patients
 * Create a new patient - only ADMIN can create patients
 */
export const POST = withAuth(
  { resource: "patient", action: "create" },
  async (req, { user }) => {
    const body = await req.json()

    const validation = createPatientSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { name, email, phone, birthDate, cpf, fatherName, motherName, notes, referenceProfessionalId, consentWhatsApp, consentEmail } =
      validation.data

    // Normalize phone number (remove non-digits, ensure country code)
    const normalizedPhone = phone.replace(/\D/g, "")

    // Check for duplicate phone within clinic
    const existingPhone = await prisma.patient.findUnique({
      where: {
        clinicId_phone: {
          clinicId: user.clinicId,
          phone: normalizedPhone,
        },
      },
    })

    if (existingPhone) {
      return NextResponse.json(
        { error: "Já existe um paciente com este telefone" },
        { status: 409 }
      )
    }

    // Check for duplicate CPF if provided
    const normalizedCpf = cpf ? cpf.replace(/\D/g, "") : null
    if (normalizedCpf) {
      const existingCpf = await prisma.patient.findUnique({
        where: {
          clinicId_cpf: {
            clinicId: user.clinicId,
            cpf: normalizedCpf,
          },
        },
      })

      if (existingCpf) {
        return NextResponse.json(
          { error: "Já existe um paciente com este CPF" },
          { status: 409 }
        )
      }
    }

    const now = new Date()
    const patient = await prisma.patient.create({
      data: {
        clinicId: user.clinicId,
        name,
        email: email || null,
        phone: normalizedPhone,
        birthDate: birthDate ? new Date(birthDate + "T00:00:00") : null,
        cpf: normalizedCpf,
        fatherName: fatherName || null,
        motherName: motherName || null,
        notes: notes || null,
        referenceProfessionalId: referenceProfessionalId || null,
        consentWhatsApp,
        consentWhatsAppAt: consentWhatsApp ? now : null,
        consentEmail,
        consentEmailAt: consentEmail ? now : null,
      },
    })

    // Create audit log
    await audit.log({
      user,
      action: AuditAction.PATIENT_CREATED,
      entityType: "Patient",
      entityId: patient.id,
      newValues: {
        name,
        email: email || null,
        phone: normalizedPhone,
        consentWhatsApp,
        consentEmail,
      },
      request: req,
    })

    return NextResponse.json({ patient }, { status: 201 })
  }
)
