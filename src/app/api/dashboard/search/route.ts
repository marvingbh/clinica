import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { Prisma } from "@prisma/client"

/**
 * GET /api/dashboard/search?q=…
 *
 * Dashboard omnisearch — returns up to 6 patients and 6 invoices matching the
 * query. Accent-insensitive via unaccent(). Patient results run for anyone
 * with agenda_own access; invoices only when the caller has `finances: READ`.
 * Professional-scoped users only see patients tied to their own appointments
 * and invoices assigned to their profile.
 */
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get("q") || "").trim()

    if (q.length < 2) {
      return NextResponse.json({ patients: [], invoices: [] })
    }

    const canSeeFinances = meetsMinAccess(user.permissions.finances, "READ")
    const canSeeOthersAgenda = meetsMinAccess(user.permissions.agenda_others, "READ")

    // --- Patients (accent-insensitive name / email / phone / mother / father) ---
    const patientWhere: Prisma.Sql[] = [
      Prisma.sql`p."clinicId" = ${user.clinicId}`,
      Prisma.sql`(
        unaccent(p."name") ILIKE unaccent('%' || ${q} || '%')
        OR unaccent(COALESCE(p."email", '')) ILIKE unaccent('%' || ${q} || '%')
        OR p."phone" LIKE '%' || ${q} || '%'
        OR unaccent(COALESCE(p."motherName", '')) ILIKE unaccent('%' || ${q} || '%')
        OR unaccent(COALESCE(p."fatherName", '')) ILIKE unaccent('%' || ${q} || '%')
      )`,
    ]

    // Professional-scoped: only patients they've seen.
    if (!canSeeOthersAgenda && user.professionalProfileId) {
      patientWhere.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "Appointment" a
        WHERE a."patientId" = p."id"
          AND a."professionalProfileId" = ${user.professionalProfileId}
      )`)
    }

    const patientRows = await prisma.$queryRaw<
      Array<{ id: string; name: string; phone: string; email: string | null }>
    >(Prisma.sql`
      SELECT p."id", p."name", p."phone", p."email"
      FROM "Patient" p
      WHERE ${Prisma.join(patientWhere, " AND ")}
      ORDER BY unaccent(p."name") ASC
      LIMIT 6
    `)

    // --- Invoices (only when the caller has finance access) ---
    let invoices: Array<{
      id: string
      referenceMonth: number
      referenceYear: number
      totalAmount: string
      status: string
      patientName: string
    }> = []

    if (canSeeFinances) {
      const rows = await prisma.invoice.findMany({
        where: {
          clinicId: user.clinicId,
          OR: [
            { patient: { name: { contains: q, mode: "insensitive" } } },
            { patient: { motherName: { contains: q, mode: "insensitive" } } },
            { patient: { fatherName: { contains: q, mode: "insensitive" } } },
          ],
          ...(user.professionalProfileId && !canSeeOthersAgenda
            ? { professionalProfileId: user.professionalProfileId }
            : {}),
        },
        include: { patient: { select: { name: true } } },
        orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
        take: 6,
      })
      invoices = rows.map((r) => ({
        id: r.id,
        referenceMonth: r.referenceMonth,
        referenceYear: r.referenceYear,
        totalAmount: r.totalAmount.toString(),
        status: r.status,
        patientName: r.patient.name,
      }))
    }

    return NextResponse.json({
      patients: patientRows,
      invoices,
    })
  }
)
