/**
 * Client-side service functions for group therapy management.
 * Handles member add/remove, session regeneration, and group creation.
 */

// ============================================================================
// Group Member Management
// ============================================================================

export async function addGroupMember(
  groupId: string,
  patientId: string,
  joinDate: string
): Promise<{ error?: string }> {
  const response = await fetch(`/api/groups/${groupId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientId, joinDate }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    return { error: result.error || "Erro ao adicionar membro" }
  }
  return {}
}

export async function removeGroupMember(
  groupId: string,
  patientId: string,
  leaveDate: string
): Promise<{ error?: string }> {
  // Find the membership ID by querying group details
  const groupRes = await fetch(`/api/groups/${groupId}`)
  if (!groupRes.ok) return { error: "Erro ao buscar grupo" }
  const groupData = await groupRes.json()

  // Search through memberships — check both patientId field and nested patient.id
  const memberships = groupData.group?.memberships || []
  const membership = memberships.find(
    (m: { id: string; patientId?: string; patient?: { id: string }; leaveDate?: string | null }) => {
      const mPatientId = m.patientId || m.patient?.id
      return mPatientId === patientId && !m.leaveDate
    }
  )

  if (!membership) {
    return { error: "Membro não encontrado no grupo" }
  }

  const response = await fetch(`/api/groups/${groupId}/members/${membership.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leaveDate }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    return { error: result.error || "Erro ao remover membro" }
  }
  return {}
}

export async function regenerateGroupSessions(
  groupId: string
): Promise<{ error?: string }> {
  const now = new Date()
  const twoYearsFromNow = new Date(now)
  twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2)

  const response = await fetch(`/api/groups/${groupId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "regenerate",
      startDate: now.toISOString().split("T")[0],
      endDate: twoYearsFromNow.toISOString().split("T")[0],
    }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    return { error: result.error || "Erro ao atualizar sessões" }
  }
  return {}
}

// ============================================================================
// Group Creation (Recurring)
// ============================================================================

export interface CreateRecurringGroupParams {
  name: string
  dayOfWeek: number
  startTime: string
  duration: number
  recurrenceType: "WEEKLY" | "BIWEEKLY" | "MONTHLY"
  professionalProfileId?: string
  additionalProfessionalIds?: string[]
}

export async function createTherapyGroup(
  params: CreateRecurringGroupParams
): Promise<{ groupId?: string; error?: string }> {
  const response = await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  let result
  try { result = await response.json() } catch { return { error: "Erro ao criar grupo" } }
  if (!response.ok) return { error: result.error || "Erro ao criar grupo" }
  return { groupId: result.group.id }
}

export async function generateGroupSessions(
  groupId: string,
  startDate: string,
  endDate: string
): Promise<{ sessionsCreated?: number; error?: string }> {
  const response = await fetch(`/api/groups/${groupId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startDate, endDate, mode: "generate" }),
  })
  let result
  try { result = await response.json() } catch { return { error: "Erro ao gerar sessões" } }
  if (!response.ok) return { error: result.error || "Erro ao gerar sessões" }
  return { sessionsCreated: result.sessionsCreated }
}
