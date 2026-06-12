import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { buildEntityMap, checkAiCredits, getUtcMonthRange, type AiCreditResult } from "@/lib/ai"

/** Body schema for POST /api/ai/note-draft. */
export const noteDraftSchema = z.object({
  patientId: z.string().min(1),
  noteId: z.string().min(1).optional(),
  format: z.enum(["SOAP", "DAP", "LIVRE"]),
  sections: z
    .array(z.object({ key: z.string().min(1), label: z.string().min(1) }))
    .min(1)
    .max(12),
  abordagem: z.string().max(60).optional(),
  roughInput: z.string().min(10),
  sharedContext: z.string().optional(),
  includeHistory: z.boolean().optional(),
})

export const feedbackSchema = z.object({
  feedback: z.enum(["POSITIVE", "NEGATIVE"]),
})

/**
 * Count successful generations consumed this UTC calendar month for a clinic,
 * and resolve the credit decision against the clinic's plan.
 */
export async function resolveCredits(clinicId: string, planCredits: number): Promise<{
  used: number
  result: AiCreditResult
}> {
  const { start, end } = getUtcMonthRange(new Date())
  const used = await prisma.aiUsage.count({
    where: { clinicId, status: "SUCCESS", createdAt: { gte: start, lt: end } },
  })
  return { used, result: checkAiCredits({ planCredits, usedThisMonth: used }) }
}

/** Load the clinic AI flags + plan credits, plus the user's opt-out, for a clinic. */
export async function loadAiContext(clinicId: string, userId: string) {
  const [clinic, user] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        aiEnabled: true,
        aiHistoryContext: true,
        plan: { select: { aiMonthlyCredits: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { aiOptOut: true } }),
  ])
  return { clinic, user }
}

/** Load + pseudonymize the patient's entities, scoped to the clinic. Null if not found. */
export async function loadPatientEntities(clinicId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: {
      name: true,
      motherName: true,
      fatherName: true,
      cpf: true,
      billingCpf: true,
      phone: true,
      email: true,
    },
  })
  if (!patient) return null
  return buildEntityMap(patient)
}

/**
 * Last up to 3 SIGNED notes for a patient (scoped by clinic), concatenated and
 * truncated per note. Returns plain strings (pseudonymization happens in the
 * domain pipeline). Defensive against the prontuário schema not matching.
 */
export async function loadHistoryContext(clinicId: string, patientId: string): Promise<string[]> {
  try {
    const notes = await prisma.clinicalNote.findMany({
      where: { clinicId, patientId, status: "ASSINADA" },
      orderBy: { sessionDate: "desc" },
      take: 3,
      select: { sections: true },
    })
    return notes
      .map((n) => {
        const sections = n.sections as Record<string, unknown> | null
        if (!sections || typeof sections !== "object") return ""
        return Object.values(sections)
          .filter((v): v is string => typeof v === "string")
          .join("\n")
          .slice(0, 2000)
      })
      .filter((s) => s.trim().length > 0)
  } catch {
    return []
  }
}

export function notFoundResponse() {
  return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 })
}
