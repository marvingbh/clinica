import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { createAuditLog, AuditAction } from "@/lib/rbac/audit"
import { generateDraft, getAiProvider } from "@/lib/ai"
import {
  noteDraftSchema,
  resolveCredits,
  loadAiContext,
  loadPatientEntities,
  loadHistoryContext,
  notFoundResponse,
} from "../_helpers"

// LLM generation can take several seconds; give the route headroom.
export const maxDuration = 60

export const POST = withFeatureAuth(
  { feature: "ai_assist", minAccess: "WRITE" },
  async (req, { user }) => {
    const parsed = noteDraftSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }
    const body = parsed.data

    // FK validation: patient must belong to the user's clinic.
    const patientEntities = await loadPatientEntities(user.clinicId, body.patientId)
    if (!patientEntities) return notFoundResponse()

    const { clinic, user: dbUser } = await loadAiContext(user.clinicId, user.id)
    if (!clinic) return notFoundResponse()

    const planCredits = clinic.plan?.aiMonthlyCredits ?? 0
    const { used, result: credit } = await resolveCredits(user.clinicId, planCredits)

    const historyContext =
      body.includeHistory && clinic.aiHistoryContext
        ? await loadHistoryContext(user.clinicId, body.patientId)
        : undefined

    const provider = getAiProvider()
    const outcome = await generateDraft(
      {
        clinic: { aiEnabled: clinic.aiEnabled, aiHistoryContext: clinic.aiHistoryContext },
        user: { aiOptOut: dbUser?.aiOptOut ?? false },
        credit,
        patientEntities,
        format: body.format,
        sections: body.sections,
        abordagem: body.abordagem,
        roughInput: body.roughInput,
        sharedContext: body.sharedContext,
        historyContext,
      },
      provider
    )

    if (outcome.kind === "blocked") {
      return NextResponse.json({ error: outcome.reason, message: outcome.message }, { status: 403 })
    }

    if (outcome.kind === "failed") {
      await prisma.aiUsage.create({
        data: {
          clinicId: user.clinicId,
          userId: user.id,
          noteId: body.noteId ?? null,
          patientId: body.patientId,
          model: provider.model,
          tokensIn: outcome.tokensIn,
          tokensOut: outcome.tokensOut,
          status: "FAILED",
        },
      })
      return NextResponse.json(
        { error: "generation_failed", message: outcome.message },
        { status: 502 }
      )
    }

    // Success: record metadata-only usage + audit log (RN7/RN8), then respond.
    const usage = await prisma.aiUsage.create({
      data: {
        clinicId: user.clinicId,
        userId: user.id,
        noteId: body.noteId ?? null,
        patientId: body.patientId,
        model: provider.model,
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
        truncated: outcome.truncated,
        status: "SUCCESS",
      },
      select: { id: true },
    })

    await createAuditLog({
      user,
      action: AuditAction.AI_DRAFT_GENERATED,
      entityType: "ClinicalNote",
      entityId: body.noteId ?? "unsaved",
      newValues: {
        model: provider.model,
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
        truncated: outcome.truncated,
      },
    })

    const newUsed = used + 1
    const limit = planCredits < 0 ? null : planCredits
    return NextResponse.json({
      usageId: usage.id,
      sections: outcome.sections,
      truncated: outcome.truncated,
      credits: {
        used: newUsed,
        limit,
        remaining: limit === null ? null : Math.max(0, limit - newUsed),
      },
    })
  }
)
