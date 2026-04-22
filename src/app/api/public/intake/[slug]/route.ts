import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import { intakeSubmissionSchema, normalizePhone, normalizeCpfCnpj } from "@/lib/intake"
import { createAndSendNotification } from "@/lib/notifications/notification-service"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"
import { NotificationType, NotificationChannel } from "@prisma/client"

/**
 * GET /api/public/intake/[slug] — Fetch clinic public info for the form page
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // M12: rate-limit slug enumeration via GET. `publicApi` fails open so a
  // genuine bot can't DoS legitimate users — but the per-key cap means
  // attackers can't probe more than 10 slugs/min/IP.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  const rl = await checkRateLimit(`intake-get:${ip}`, RATE_LIMIT_CONFIGS.publicApi)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfter / 1000)) } },
    )
  }

  const { slug } = await params

  const clinic = await prisma.clinic.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, logoUrl: true, logoData: true, isActive: true },
  })

  if (!clinic || !clinic.isActive) {
    return NextResponse.json(
      { error: "Clinica nao encontrada" },
      { status: 404 }
    )
  }

  return NextResponse.json({
    name: clinic.name,
    slug: clinic.slug,
    logoUrl: clinic.logoUrl,
    hasLogo: !!clinic.logoData,
  })
}

/**
 * POST /api/public/intake/[slug] — Submit intake form
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown"

    const rateLimit = await checkRateLimit(
      `intake-submit:${ip}`,
      RATE_LIMIT_CONFIGS.publicApi
    )

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
        { status: 429 }
      )
    }

    const { slug } = await params
    const body = await req.json()
    const parsed = intakeSubmissionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const clinic = await prisma.clinic.findUnique({
      where: { slug },
      select: { id: true, name: true, isActive: true },
    })

    if (!clinic || !clinic.isActive) {
      return NextResponse.json(
        { error: "Clinica nao encontrada" },
        { status: 404 }
      )
    }

    const data = parsed.data
    const normalizedPhone = normalizePhone(data.phone)
    const normalizedCpfCnpj = normalizeCpfCnpj(data.guardianCpfCnpj)

    const submission = await prisma.intakeSubmission.create({
      data: {
        clinicId: clinic.id,
        childName: data.childName,
        childBirthDate: new Date(data.childBirthDate),
        guardianName: data.guardianName,
        guardianCpfCnpj: normalizedCpfCnpj,
        phone: normalizedPhone,
        email: data.email,
        addressStreet: data.addressStreet,
        addressNumber: data.addressNumber || null,
        addressNeighborhood: data.addressNeighborhood || null,
        addressCity: data.addressCity || null,
        addressState: data.addressState || null,
        addressZip: data.addressZip,
        schoolName: data.schoolName || null,
        schoolUnit: data.schoolUnit || null,
        schoolShift: data.schoolShift || null,
        motherName: data.motherName || null,
        motherPhone: data.motherPhone ? normalizePhone(data.motherPhone) : null,
        fatherName: data.fatherName || null,
        fatherPhone: data.fatherPhone ? normalizePhone(data.fatherPhone) : null,
        consentPhotoVideo: data.consentPhotoVideo,
        consentSessionRecording: data.consentSessionRecording,
        ipAddress: ip,
      },
    })

    // Fire-and-forget: notify clinic admins
    notifyClinicAdmins(clinic.id, clinic.name, data.childName, data.guardianName).catch(
      (err) => console.error("Failed to send intake notification:", err)
    )

    return NextResponse.json(
      { message: "Ficha de cadastro enviada com sucesso" },
      { status: 201 }
    )
  } catch (error) {
    console.error("Intake form submission error:", error)
    return NextResponse.json(
      { error: "Erro interno. Tente novamente." },
      { status: 500 }
    )
  }
}

async function notifyClinicAdmins(
  clinicId: string,
  clinicName: string,
  childName: string,
  guardianName: string
) {
  const [admins, clinic] = await Promise.all([
    prisma.user.findMany({
      where: { clinicId, role: "ADMIN", isActive: true },
      select: { email: true },
    }),
    prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { emailBcc: true },
    }),
  ])

  const template = await getTemplate(
    clinicId,
    NotificationType.INTAKE_FORM_SUBMITTED,
    NotificationChannel.EMAIL
  )

  const variables = { clinicName, childName, guardianName }
  const content = renderTemplate(template.content, variables)
  const subject = template.subject ? renderTemplate(template.subject, variables) : undefined

  const recipients = new Set<string>()
  for (const admin of admins) {
    if (admin.email) recipients.add(admin.email)
  }
  if (clinic?.emailBcc) recipients.add(clinic.emailBcc)

  for (const email of recipients) {
    await createAndSendNotification({
      clinicId,
      type: NotificationType.INTAKE_FORM_SUBMITTED,
      channel: NotificationChannel.EMAIL,
      recipient: email,
      subject,
      content,
    })
  }
}
