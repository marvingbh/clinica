import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { z } from "zod"
import { computeSessionsToThin } from "@/lib/groups/recurrence-thinning"
import { findSafelyDeletableAppointments } from "@/lib/appointments/safe-recurrence-changes"
import { calculateGroupSessionDates, filterExistingSessionDates } from "@/lib/groups"
import { AppointmentModality } from "@prisma/client"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(timeRegex, "Formato de horário inválido (HH:mm)").optional(),
  duration: z.number().int().min(15).max(480).optional(),
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  capacity: z.number().int().min(1).max(100).nullish(),
  isActive: z.boolean().optional(),
  additionalProfessionalIds: z.array(z.string()).optional(),
  applyTo: z.enum(["future"]).optional(),
})

/**
 * GET /api/groups/[groupId]
 * Get a therapy group with its members
 */
export const GET = withFeatureAuth(
  { feature: "groups", minAccess: "READ" },
  async (req, { user }, params) => {
    const { groupId } = params

    const where: Record<string, unknown> = {
      id: groupId,
      clinicId: user.clinicId,
    }

    const group = await prisma.therapyGroup.findFirst({
      where,
      include: {
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
        additionalProfessionals: {
          select: {
            professionalProfile: {
              select: { id: true, user: { select: { name: true } } },
            },
          },
        },
        memberships: {
          where: {
            leaveDate: null, // Only active members
          },
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
          },
          orderBy: {
            joinDate: "asc",
          },
        },
      },
    })

    if (!group) {
      return NextResponse.json(
        { error: "Grupo não encontrado" },
        { status: 404 }
      )
    }

    return NextResponse.json({ group })
  }
)

/**
 * PATCH /api/groups/[groupId]
 * Update a therapy group
 */
export const PATCH = withFeatureAuth(
  { feature: "groups", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const { groupId } = params
    const body = await req.json()

    // Validate request body
    const validation = updateGroupSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const where: Record<string, unknown> = {
      id: groupId,
      clinicId: user.clinicId,
    }

    // Check if group exists
    const existingGroup = await prisma.therapyGroup.findFirst({
      where,
    })

    if (!existingGroup) {
      return NextResponse.json(
        { error: "Grupo não encontrado" },
        { status: 404 }
      )
    }

    const { additionalProfessionalIds, applyTo, ...updateData } = validation.data

    const scheduleChanged = updateData.dayOfWeek !== undefined || updateData.startTime !== undefined ||
      updateData.duration !== undefined || updateData.recurrenceType !== undefined

    const frequencyChanged = updateData.recurrenceType !== undefined &&
      updateData.recurrenceType !== existingGroup.recurrenceType

    // Update the group with additional professionals in a transaction
    const { group, rescheduledCount, removedCount, createdCount, keptInvoicedCount } = await prisma.$transaction(async (tx) => {
      // Update group fields
      await tx.therapyGroup.update({
        where: { id: groupId },
        data: updateData,
      })

      // Update additional professionals if provided
      if (additionalProfessionalIds !== undefined) {
        const newIds = additionalProfessionalIds.filter(
          id => id !== existingGroup.professionalProfileId
        )

        let validIds: string[] = []
        if (newIds.length > 0) {
          const validProfs = await tx.professionalProfile.findMany({
            where: {
              id: { in: newIds },
              user: { clinicId: user.clinicId },
            },
            select: { id: true },
          })
          validIds = validProfs.map(p => p.id)
        }

        await tx.therapyGroupProfessional.deleteMany({ where: { groupId } })
        if (validIds.length > 0) {
          await tx.therapyGroupProfessional.createMany({
            data: validIds.map(profId => ({ groupId, professionalProfileId: profId })),
          })
        }
      }

      // Apply schedule changes to future sessions
      let rescheduled = 0
      let removed = 0
      let created = 0
      let keptInvoiced = 0
      if (applyTo === "future" && scheduleChanged) {
        const now = new Date()
        now.setHours(0, 0, 0, 0)

        // Get the updated group for new values
        const updated = await tx.therapyGroup.findUniqueOrThrow({ where: { id: groupId } })
        const newDayOfWeek = updated.dayOfWeek
        const [newH, newM] = updated.startTime.split(":").map(Number)
        const newDuration = updated.duration

        // Get all future sessions
        let futureAppts = await tx.appointment.findMany({
          where: {
            groupId,
            scheduledAt: { gte: now },
            status: { in: ["AGENDADO", "CONFIRMADO"] },
          },
          select: { id: true, scheduledAt: true },
        })

        // When the cadence becomes less frequent (e.g. WEEKLY -> BIWEEKLY), thin
        // out the future sessions that fall on the "off" dates, keeping only those
        // aligned to the new interval. Invoice-linked sessions are preserved.
        if (frequencyChanged) {
          const toThin = computeSessionsToThin(
            futureAppts,
            existingGroup.recurrenceType,
            updated.recurrenceType,
          )
          if (toThin.length > 0) {
            const { safeToDelete } = await findSafelyDeletableAppointments(tx, toThin)
            // Off-cadence sessions that couldn't be removed because they're on an
            // active invoice — surfaced so the UI can explain why they remain.
            keptInvoiced = toThin.length - safeToDelete.length
            if (safeToDelete.length > 0) {
              const deletable = new Set(safeToDelete)
              await tx.appointmentProfessional.deleteMany({
                where: { appointmentId: { in: safeToDelete } },
              })
              await tx.appointment.deleteMany({ where: { id: { in: safeToDelete } } })
              removed = safeToDelete.length
              futureAppts = futureAppts.filter(a => !deletable.has(a.id))
            }
          }
        }

        // Move each remaining appointment to the new day/time, tracking the
        // resulting dates so we can fill any gaps for a denser cadence.
        const survivorDates: Date[] = []
        for (const appt of futureAppts) {
          const oldDate = appt.scheduledAt
          const currentDay = oldDate.getDay()
          const dayDiff = newDayOfWeek - currentDay
          const newDate = new Date(oldDate)
          newDate.setDate(newDate.getDate() + dayDiff)
          newDate.setHours(newH, newM, 0, 0)
          const newEnd = new Date(newDate.getTime() + newDuration * 60000)

          await tx.appointment.update({
            where: { id: appt.id },
            data: { scheduledAt: newDate, endAt: newEnd },
          })
          survivorDates.push(newDate)
          rescheduled++
        }

        // When the cadence becomes more frequent (e.g. BIWEEKLY -> WEEKLY), fill in
        // the missing in-between dates for each active member, bounded to the
        // existing future window. (For a less-frequent change there are no gaps to
        // fill, so this is a no-op.)
        if (frequencyChanged && survivorDates.length > 0) {
          const sorted = [...survivorDates].sort((a, b) => a.getTime() - b.getTime())
          const windowStart = sorted[0]
          const windowEnd = sorted[sorted.length - 1]

          const patternDates = calculateGroupSessionDates(
            windowStart, windowEnd, newDayOfWeek, updated.startTime, newDuration, updated.recurrenceType,
          )
          const missing = filterExistingSessionDates(patternDates, survivorDates)

          if (missing.length > 0) {
            const activeMembers = await tx.groupMembership.findMany({
              where: {
                groupId,
                joinDate: { lte: windowEnd },
                OR: [{ leaveDate: null }, { leaveDate: { gt: windowStart } }],
              },
              select: { patientId: true, joinDate: true, leaveDate: true },
            })
            const addlProfs = await tx.therapyGroupProfessional.findMany({
              where: { groupId },
              select: { professionalProfileId: true },
            })

            const toCreate: Array<{
              clinicId: string; professionalProfileId: string; patientId: string
              groupId: string; scheduledAt: Date; endAt: Date; modality: AppointmentModality
            }> = []
            for (const sd of missing) {
              const sessionDateObj = new Date(sd.date + "T00:00:00")
              for (const m of activeMembers) {
                const jd = new Date(m.joinDate); jd.setHours(0, 0, 0, 0)
                const ld = m.leaveDate ? new Date(m.leaveDate) : null
                if (ld) ld.setHours(0, 0, 0, 0)
                if (jd > sessionDateObj) continue
                if (ld && ld <= sessionDateObj) continue
                toCreate.push({
                  clinicId: user.clinicId,
                  professionalProfileId: updated.professionalProfileId,
                  patientId: m.patientId,
                  groupId,
                  scheduledAt: sd.scheduledAt,
                  endAt: sd.endAt,
                  modality: AppointmentModality.PRESENCIAL,
                })
              }
            }

            if (toCreate.length > 0) {
              await tx.appointment.createMany({ data: toCreate, skipDuplicates: true })
              created = toCreate.length

              if (addlProfs.length > 0) {
                const newApts = await tx.appointment.findMany({
                  where: {
                    groupId,
                    scheduledAt: { in: missing.map(s => s.scheduledAt) },
                    patientId: { in: toCreate.map(c => c.patientId) },
                  },
                  select: { id: true },
                })
                await tx.appointmentProfessional.createMany({
                  data: newApts.flatMap(a =>
                    addlProfs.map(p => ({ appointmentId: a.id, professionalProfileId: p.professionalProfileId })),
                  ),
                })
              }
            }
          }
        }
      }

      const result = await tx.therapyGroup.findUniqueOrThrow({
        where: { id: groupId },
        include: {
          professionalProfile: {
            select: { id: true, user: { select: { name: true } } },
          },
          additionalProfessionals: {
            select: {
              professionalProfile: {
                select: { id: true, user: { select: { name: true } } },
              },
            },
          },
        },
      })

      return { group: result, rescheduledCount: rescheduled, removedCount: removed, createdCount: created, keptInvoicedCount: keptInvoiced }
    }, { timeout: 30000 })

    const parts: string[] = []
    if (removedCount > 0) parts.push(`${removedCount} sessão(ões) removida(s)`)
    if (createdCount > 0) parts.push(`${createdCount} sessão(ões) criada(s)`)
    if (rescheduledCount > 0) parts.push(`${rescheduledCount} sessão(ões) reagendada(s)`)
    if (keptInvoicedCount > 0) parts.push(`${keptInvoicedCount} mantida(s) por estarem vinculadas a faturas`)
    const message = parts.length > 0
      ? `Grupo atualizado. ${parts.join(", ")}.`
      : "Grupo atualizado com sucesso"

    return NextResponse.json({ group, message, rescheduledCount, removedCount, createdCount, keptInvoicedCount })
  }
)

/**
 * DELETE /api/groups/[groupId]
 * Delete a therapy group
 */
export const DELETE = withFeatureAuth(
  { feature: "groups", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const { groupId } = params

    const where: Record<string, unknown> = {
      id: groupId,
      clinicId: user.clinicId,
    }

    // Check if group exists
    const existingGroup = await prisma.therapyGroup.findFirst({
      where,
    })

    if (!existingGroup) {
      return NextResponse.json(
        { error: "Grupo não encontrado" },
        { status: 404 }
      )
    }

    // Delete the group (cascades to memberships, appointments keep groupId as null)
    await prisma.therapyGroup.delete({
      where: { id: groupId },
    })

    return NextResponse.json({ success: true })
  }
)
