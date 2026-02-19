"use client"

import { useSession } from "next-auth/react"
import type { Feature } from "@/lib/rbac/types"

export function usePermission(feature: Feature) {
  const { data: session } = useSession()
  const access = session?.user?.permissions?.[feature] ?? "NONE"
  return {
    canRead: access === "READ" || access === "WRITE",
    canWrite: access === "WRITE",
    access,
  }
}

export function usePermissions() {
  const { data: session } = useSession()
  return session?.user?.permissions ?? null
}
