"use client"

import { useMountEffect } from "@/shared/hooks"
import type { Patient } from "../lib/types"

interface Args {
  openCreateSheet: (slotTime?: string) => void
  handleSelectPatient: (patient: Patient) => void
}

/**
 * Honors `?newAppointment=1&patientId=...` deep-links from external
 * flows (e.g. the intake-approval panel's "Agendar primeira sessão"
 * CTA). On mount, opens the create-appointment sheet pre-selected with
 * the requested patient, then strips the params from the URL so a
 * refresh doesn't re-trigger the flow.
 *
 * Reads via `window.location` to avoid `useSearchParams` (which would
 * force a Suspense boundary around the agenda page in Next 16). Same
 * pattern the patients page uses for `?tab=fichas`.
 */
export function useNewAppointmentDeepLink({ openCreateSheet, handleSelectPatient }: Args) {
  useMountEffect(() => {
    if (typeof window === "undefined") return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get("newAppointment") !== "1") return
    const patientId = sp.get("patientId")
    if (!patientId) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/patients/${patientId}?appointmentsLimit=0`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !data?.patient) return
        openCreateSheet()
        handleSelectPatient(data.patient as Patient)
      } catch {
        // Silent — operator can still create manually.
      } finally {
        // Strip the deep-link params so a back/refresh doesn't re-open.
        const url = new URL(window.location.href)
        url.searchParams.delete("newAppointment")
        url.searchParams.delete("patientId")
        window.history.replaceState({}, "", url.pathname + (url.search || ""))
      }
    })()

    return () => {
      cancelled = true
    }
  })
}
