import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { resolvePortalAccess, type PortalAccess } from "./policy"
import { isMinor, portalDisplayName } from "./guardian"
import {
  hashSessionToken,
  isSessionValid,
  portalCookieName,
  slideSession,
} from "./session"

export interface PortalClinic {
  id: string
  slug: string
  name: string
  portalCancelMinHours: number
  hasLogo: boolean
}

export interface PortalContext {
  clinic: PortalClinic
  session: { id: string; scope: "FULL" | "AGENDA"; identifier: string; patientId: string | null }
  /** Accessible patient profiles, revalidated on every request. */
  patientIds: string[]
  /** Effective access (read_only collapses POSTs). */
  access: Exclude<PortalAccess, "disabled">
}

type PortalHandler = (
  req: NextRequest,
  ctx: PortalContext,
  params: Record<string, string>,
) => Promise<NextResponse>

type RouteParams = { params: Promise<Record<string, string>> }

function reauthResponse(): NextResponse {
  return NextResponse.json(
    { error: "Sua sessão expirou. Entre novamente para continuar.", reauth: true },
    { status: 401, headers: { "Cache-Control": "private, no-store" } },
  )
}

function notFoundResponse(): NextResponse {
  return NextResponse.json(
    { error: "Portal não encontrado" },
    { status: 404, headers: { "Cache-Control": "private, no-store" } },
  )
}

/**
 * Resolves the clinic for a portal slug. Returns null when the clinic does not
 * exist, is inactive, the plan disallows the portal, or the toggle is off.
 * Also returns the effective access so handlers can gate writes.
 */
export async function resolvePortalClinic(
  slug: string,
): Promise<{ clinic: PortalClinic; access: Exclude<PortalAccess, "disabled"> } | null> {
  const clinic = await prisma.clinic.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      patientPortalEnabled: true,
      portalCancelMinHours: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      logoData: true,
      plan: { select: { allowPatientPortal: true } },
    },
  })
  if (!clinic) return null

  const access = resolvePortalAccess({
    planAllows: !!clinic.plan?.allowPatientPortal,
    clinicEnabled: clinic.patientPortalEnabled,
    clinicActive: clinic.isActive,
    subscription: { subscriptionStatus: clinic.subscriptionStatus, trialEndsAt: clinic.trialEndsAt },
  })
  if (access === "disabled") return null

  return {
    clinic: {
      id: clinic.id,
      slug: clinic.slug,
      name: clinic.name,
      portalCancelMinHours: clinic.portalCancelMinHours,
      hasLogo: !!clinic.logoData,
    },
    access,
  }
}

/**
 * Recomputes the set of patient profiles a session can access. For FULL scope:
 * active patients in the clinic whose Patient.phone, PatientPhone(notify=true),
 * or Patient.email matches the verified identifier. For AGENDA scope: only the
 * pinned patientId, and only while still active.
 */
export async function resolveAccessiblePatientIds(args: {
  clinicId: string
  scope: "FULL" | "AGENDA"
  identifier: string
  patientId: string | null
}): Promise<string[]> {
  if (args.scope === "AGENDA") {
    if (!args.patientId) return []
    const patient = await prisma.patient.findFirst({
      where: { id: args.patientId, clinicId: args.clinicId, isActive: true },
      select: { id: true },
    })
    return patient ? [patient.id] : []
  }

  const id = args.identifier
  const isEmail = id.includes("@")
  const patients = await prisma.patient.findMany({
    where: {
      clinicId: args.clinicId,
      isActive: true,
      OR: isEmail
        ? [{ email: id }]
        : [{ phone: id }, { additionalPhones: { some: { phone: id, notify: true } } }],
    },
    select: { id: true },
  })
  return patients.map((p) => p.id)
}

/**
 * Wraps a portal API handler with session resolution. Resolves the clinic by
 * slug (404 if disabled), validates the session cookie, recomputes accessible
 * patientIds, slides expiry, and provides a typed PortalContext. Read-only
 * subscriptions are surfaced via ctx.access (handlers gate writes themselves).
 */
export function withPortalSession(
  handler: PortalHandler,
  opts?: { requireScope?: "FULL" },
) {
  return async (req: NextRequest, routeContext?: RouteParams): Promise<NextResponse> => {
    const params = routeContext?.params ? await routeContext.params : {}
    const slug = params.slug
    if (!slug) return notFoundResponse()

    const resolved = await resolvePortalClinic(slug)
    if (!resolved) return notFoundResponse()
    const { clinic, access } = resolved

    const cookieStore = await cookies()
    const token = cookieStore.get(portalCookieName(slug))?.value
    if (!token) return reauthResponse()

    const tokenHash = hashSessionToken(token)
    const session = await prisma.patientPortalSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        clinicId: true,
        scope: true,
        identifier: true,
        patientId: true,
        expiresAt: true,
        absoluteExpiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    })

    const now = new Date()
    if (
      !session ||
      session.clinicId !== clinic.id ||
      !isSessionValid(session, now)
    ) {
      return reauthResponse()
    }

    if (opts?.requireScope === "FULL" && session.scope !== "FULL") {
      return NextResponse.json(
        { error: "Confirme seu acesso para ver esta área.", reauth: true, elevate: true },
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      )
    }

    const patientIds = await resolveAccessiblePatientIds({
      clinicId: clinic.id,
      scope: session.scope,
      identifier: session.identifier,
      patientId: session.patientId,
    })

    if (patientIds.length === 0) return reauthResponse()

    // Slide expiry at most once per hour.
    const slide = slideSession(session, now)
    if (slide.shouldTouch) {
      await prisma.patientPortalSession.update({
        where: { id: session.id },
        data: { lastUsedAt: now, expiresAt: slide.expiresAt },
      })
    }

    const ctx: PortalContext = {
      clinic,
      session: {
        id: session.id,
        scope: session.scope,
        identifier: session.identifier,
        patientId: session.patientId,
      },
      patientIds,
      access,
    }

    const response = await handler(req, ctx, params)
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
}

/** Profile entry returned to the client after login / from `me`. */
export interface PortalProfile {
  id: string
  displayName: string
  isGuardianAccess: boolean
}

/**
 * Builds the profile list for a set of patient ids, applying guardian framing.
 * Patients are re-read so the displayName reflects current data.
 */
export async function buildPortalProfiles(
  clinicId: string,
  patientIds: string[],
  now: Date = new Date(),
): Promise<PortalProfile[]> {
  if (patientIds.length === 0) return []
  const patients = await prisma.patient.findMany({
    where: { id: { in: patientIds }, clinicId },
    select: { id: true, name: true, birthDate: true },
  })
  return patients.map((p) => {
    const minor = isMinor(p.birthDate, now)
    return {
      id: p.id,
      displayName: portalDisplayName({ name: p.name, birthDate: p.birthDate }, now),
      isGuardianAccess: minor,
    }
  })
}

/** Shared 403 for write attempts in a read-only subscription. */
export function readOnlyResponse(): NextResponse {
  return NextResponse.json(
    { error: "O portal está temporariamente em modo somente leitura. Entre em contato com a clínica." },
    { status: 403, headers: { "Cache-Control": "private, no-store" } },
  )
}

export interface PortalOwnedAppointment {
  id: string
  status: string
  scheduledAt: Date
  patientId: string | null
  professionalProfileId: string
}

/**
 * Loads a CONSULTA appointment guaranteed to belong to the clinic and to one of
 * the session's accessible patients. Returns null when not found / not owned.
 */
export async function loadPortalAppointment(
  ctx: PortalContext,
  appointmentId: string,
): Promise<PortalOwnedAppointment | null> {
  const appt = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      clinicId: ctx.clinic.id,
      type: "CONSULTA",
      patientId: { in: ctx.patientIds },
    },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      patientId: true,
      professionalProfileId: true,
    },
  })
  return appt
}
