"use client"

export interface ProfessionalLite {
  id: string
  name: string
}

let cached: Promise<ProfessionalLite[]> | null = null

/**
 * Fetch the clinic's professionals as a `[{ id: ProfessionalProfile.id, name }]`
 * list. The `/api/professionals` endpoint returns User objects with the profile
 * nested — we project just what callers need and drop entries without a profile.
 *
 * The promise is module-scoped so multiple components mounting at once share
 * one network request. ADMIN-only — the endpoint returns 403 for professionals.
 */
export async function loadProfessionals(): Promise<ProfessionalLite[]> {
  if (!cached) {
    cached = fetch("/api/professionals")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return []
        return (data.professionals ?? [])
          .filter((p: { professionalProfile?: { id: string } }) => p.professionalProfile?.id)
          .map((p: { name: string; professionalProfile: { id: string } }) => ({
            id: p.professionalProfile.id,
            name: p.name,
          }))
      })
      .catch(() => {
        // Don't poison the cache — let a future call retry.
        cached = null
        return [] as ProfessionalLite[]
      })
  }
  return cached
}
