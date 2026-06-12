"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { useMountEffect } from "@/shared/hooks"

export interface PortalProfileSummary {
  id: string
  name: string
  displayName: string
  phone: string
  email: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressNeighborhood: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null
  consentWhatsApp: boolean
  consentEmail: boolean
}

export interface PortalMe {
  clinic: { name: string; hasLogo: boolean; cancelMinHours: number }
  access: "full" | "read_only"
  scope: "FULL" | "AGENDA"
  profiles: PortalProfileSummary[]
}

type Status = "loading" | "logged_out" | "logged_in"

interface PortalContextValue {
  slug: string
  status: Status
  me: PortalMe | null
  activeProfileId: string | null
  activeProfile: PortalProfileSummary | null
  setActiveProfileId: (id: string) => void
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<PortalContextValue | null>(null)

export function usePortal(): PortalContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("usePortal must be used within PortalSessionProvider")
  return ctx
}

export function PortalSessionProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading")
  const [me, setMe] = useState<PortalMe | null>(null)
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch(`/api/public/portal/${slug}/me`, { cache: "no-store" })
      if (res.status === 401) {
        setStatus("logged_out")
        setMe(null)
        return
      }
      if (!res.ok) {
        setStatus("logged_out")
        return
      }
      const data: PortalMe = await res.json()
      setMe(data)
      setActiveProfileId((prev) => prev ?? data.profiles[0]?.id ?? null)
      setStatus("logged_in")
    } catch {
      setStatus("logged_out")
    }
  }

  useMountEffect(() => {
    void load()
  })

  async function logout() {
    try {
      await fetch(`/api/public/portal/${slug}/session`, { method: "DELETE" })
    } catch {
      // ignore
    }
    setMe(null)
    setActiveProfileId(null)
    setStatus("logged_out")
  }

  const activeProfile = me?.profiles.find((p) => p.id === activeProfileId) ?? null

  return (
    <Ctx.Provider
      value={{
        slug,
        status,
        me,
        activeProfileId,
        activeProfile,
        setActiveProfileId,
        refresh: load,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
