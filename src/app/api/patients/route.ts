import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"

// WhatsApp format validation: Brazilian format with country code
// Accepts: +5511999999999, 5511999999999, 11999999999
const phoneRegex = /^(\+?55)?(\d{2})(\d{8,9})$/

const additionalPhoneSchema = z.object({
  phone: z.string().regex(phoneRegex, "Telefone inválido. Use formato WhatsApp: (11) 99999-9999"),
  label: z.string().min(1, "Rótulo é obrigatório").max(30, "Rótulo deve ter no máximo 30 caracteres"),
})

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
  schoolName: z.string().max(200).optional().nullable().or(z.literal("")),
  firstAppointmentDate: z.string().optional().nullable(),
  lastFeeAdjustmentDate: z.string().optional().nullable(),
  sessionFee: z.number().min(0).optional().nullable(),
  therapeuticProject: z.string().max(5000).optional().nullable().or(z.literal("")),
  referenceProfessionalId: z.string().optional().nullable().or(z.literal("")),
  consentWhatsApp: z.boolean().default(false),
  consentEmail: z.boolean().default(false),
  additionalPhones: z.array(additionalPhoneSchema).max(4, "Máximo de 4 telefones adicionais").optional(),
})

/**
 * GET /api/patients
 * List patients - ADMIN sees all clinic patients, PROFESSIONAL sees only patients they have appointments with
 * Supports pagination with page and limit query params
 */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search")
    const isActive = searchParams.get("isActive")
    const referenceProfessionalId = searchParams.get("referenceProfessionalId")
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)))
    const skip = (page - 1) * limit

    // When a search term is present, use raw SQL for accent-insensitive matching
    // via PostgreSQL's unaccent() extension. Also searches motherName/fatherName.
    if (search) {
      const params: unknown[] = [user.clinicId, search]
      let paramIndex = 3

      const conditions: string[] = [
        `p."clinicId" = $1`,
        `(
          unaccent(p."name") ILIKE unaccent('%' || $2 || '%')
          OR unaccent(COALESCE(p."email", '')) ILIKE unaccent('%' || $2 || '%')
          OR p."phone" LIKE '%' || $2 || '%'
          OR unaccent(COALESCE(p."motherName", '')) ILIKE unaccent('%' || $2 || '%')
          OR unaccent(COALESCE(p."fatherName", '')) ILIKE unaccent('%' || $2 || '%')
        )`,
      ]

      if (isActive !== null) {
        conditions.push(`p."isActive" = $${paramIndex}`)
        params.push(isActive === "true")
        paramIndex++
      }

      if (referenceProfessionalId) {
        conditions.push(`p."referenceProfessionalId" = $${paramIndex}`)
        params.push(referenceProfessionalId)
        paramIndex++
      }

      const whereClause = conditions.join(" AND ")

      const selectQuery = `
        SELECT p."id", p."name", p."email", p."phone", p."motherName", p."fatherName"
        FROM "Patient" p
        WHERE ${whereClause}
        ORDER BY p."name" ASC
        LIMIT ${limit} OFFSET ${skip}
      `
      const countQuery = `
        SELECT COUNT(*)::int as count
        FROM "Patient" p
        WHERE ${whereClause}
      `

      const [patients, countResult] = await Promise.all([
        prisma.$queryRawUnsafe<Array<{
          id: string
          name: string
          email: string | null
          phone: string
          motherName: string | null
          fatherName: string | null
        }>>(selectQuery, ...params),
        prisma.$queryRawUnsafe<Array<{ count: number }>>(countQuery, ...params),
      ])

      const total = countResult[0]?.count ?? 0
      const totalPages = Math.ceil(total / limit)

      return NextResponse.json({
        patients,
        pagination: { page, limit, total, totalPages },
      })
    }

    // Non-search listing: use standard Prisma query
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    if (isActive !== null) {
      where.isActive = isActive === "true"
    }

    if (referenceProfessionalId) {
      where.referenceProfessionalId = referenceProfessionalId
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
          schoolName: true,
          firstAppointmentDate: true,
          lastFeeAdjustmentDate: true,
          sessionFee: true,
          therapeuticProject: true,
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
          additionalPhones: {
            select: {
              id: true,
              phone: true,
              label: true,
            },
            orderBy: { createdAt: "asc" },
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
export const POST = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()

    const validation = createPatientSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { name, email, phone, birthDate, cpf, fatherName, motherName, notes, schoolName, firstAppointmentDate, lastFeeAdjustmentDate, sessionFee, therapeuticProject, referenceProfessionalId, consentWhatsApp, consentEmail, additionalPhones } =
      validation.data

    // Normalize phone number (remove non-digits, ensure country code)
    const normalizedPhone = phone.replace(/\D/g, "")

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

    // Normalize and validate additional phones
    const normalizedAdditionalPhones = (additionalPhones || []).map((p) => ({
      phone: p.phone.replace(/\D/g, ""),
      label: p.label,
    }))

    // Check for duplicates among additional phones and primary phone
    const allPhones = [normalizedPhone, ...normalizedAdditionalPhones.map((p) => p.phone)]
    const uniquePhones = new Set(allPhones)
    if (uniquePhones.size !== allPhones.length) {
      return NextResponse.json(
        { error: "Números de telefone duplicados não são permitidos" },
        { status: 400 }
      )
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
        schoolName: schoolName || null,
        firstAppointmentDate: firstAppointmentDate ? new Date(firstAppointmentDate + "T00:00:00") : null,
        lastFeeAdjustmentDate: lastFeeAdjustmentDate ? new Date(lastFeeAdjustmentDate + "T00:00:00") : null,
        sessionFee: sessionFee ?? null,
        therapeuticProject: therapeuticProject || null,
        referenceProfessionalId: referenceProfessionalId || null,
        consentWhatsApp,
        consentWhatsAppAt: consentWhatsApp ? now : null,
        consentEmail,
        consentEmailAt: consentEmail ? now : null,
        additionalPhones: normalizedAdditionalPhones.length > 0 ? {
          create: normalizedAdditionalPhones.map((p) => ({
            clinicId: user.clinicId,
            phone: p.phone,
            label: p.label,
          })),
        } : undefined,
      },
      include: {
        additionalPhones: {
          select: { id: true, phone: true, label: true },
          orderBy: { createdAt: "asc" },
        },
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
