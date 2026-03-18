"use client"

import { useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { usePermission } from "./usePermission"
import type { Feature } from "@/lib/rbac/types"

import { useEffect } from "react"

interface UseRequireAuthOptions {
  feature?: Feature
  minAccess?: "READ" | "WRITE"
}

/**
 * Handles auth redirect + optional permission gating.
 * Returns `isReady: true` only when the user is authenticated
 * (and has the required permission, if specified).
 *
 * Usage:
 *   const { isReady, session } = useRequireAuth()
 *   if (!isReady) return <LoadingSkeleton />
 *   return <PageContent session={session} />
 */
export function useRequireAuth(options?: UseRequireAuthOptions) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const redirected = useRef(false)
  const { canRead, canWrite } = usePermission(
    (options?.feature ?? "agenda_own") as Feature
  )

  const hasRequiredAccess = !options?.feature
    ? true
    : options.minAccess === "WRITE"
      ? canWrite
      : canRead

  // Auth redirect: runs when session status changes.
  useEffect(() => {
    if (redirected.current) return

    if (status === "unauthenticated") {
      redirected.current = true
      router.push("/login")
    } else if (status === "authenticated" && !hasRequiredAccess) {
      redirected.current = true
      toast.error("Sem permissao para acessar esta pagina")
      router.push("/")
    }
  }, [status, hasRequiredAccess, router])

  const isReady = status === "authenticated" && hasRequiredAccess

  if (!isReady) {
    return { isReady: false as const, session: null, status }
  }

  return {
    isReady: true as const,
    session: session!,
    status,
  }
}
